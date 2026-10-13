import axios from "axios";

import { prisma } from "../db/prisma";
import { env } from "../config/env";
import { decryptToken, encryptToken } from "../utils/token-crypto";

export class ProjectTokenError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = "ProjectTokenError";
  }
}

// What the dashboard/API is allowed to see. The token itself is never part of this.
export interface ProjectTokenView {
  id: number;
  gitlabProjectId: string;
  projectPath: string;
  projectName: string;
  tokenHint: string;
  scopes: string[] | null;
  writeCapable: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface GitLabProjectInfo {
  id: number;
  path_with_namespace: string;
  name: string;
}

const RESOLVE_CACHE_TTL_MS = 15_000;

function toView(row: {
  id: number;
  gitlabProjectId: string;
  projectPath: string;
  projectName: string;
  tokenHint: string;
  scopes: string | null;
  createdAt: Date;
  updatedAt: Date;
}): ProjectTokenView {
  const scopes = row.scopes ? row.scopes.split(",") : null;

  return {
    id: row.id,
    gitlabProjectId: row.gitlabProjectId,
    projectPath: row.projectPath,
    projectName: row.projectName,
    tokenHint: row.tokenHint,
    scopes,
    // `api` allows writes (e.g. posting MR comments); read_api does not.
    writeCapable: scopes?.includes("api") ?? false,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function normalizeRef(ref: string): string {
  const trimmed = ref.trim();

  try {
    return decodeURIComponent(trimmed);
  } catch {
    return trimmed;
  }
}

export class ProjectTokenService {
  private readonly cache = new Map<string, { token: string | undefined; expires: number }>();

  async list(): Promise<ProjectTokenView[]> {
    const rows = await prisma.projectToken.findMany({ orderBy: { projectPath: "asc" } });
    return rows.map(toView);
  }

  /**
   * Validates the token against GitLab *before* storing it: it must be able to
   * read the given project. Re-adding the same project replaces its token.
   */
  async add(projectRef: string, token: string): Promise<ProjectTokenView> {
    const ref = normalizeRef(projectRef);
    const cleanToken = token.trim();

    if (!ref || !cleanToken) {
      throw new ProjectTokenError("Both a project (ID or path) and a token are required.", 400);
    }

    const project = await this.fetchProject(ref, cleanToken);
    const scopes = await this.fetchScopes(cleanToken);

    const data = {
      projectPath: project.path_with_namespace,
      projectName: project.name,
      encryptedToken: encryptToken(cleanToken),
      tokenHint: cleanToken.slice(-4),
      scopes: scopes ? scopes.join(",") : null,
    };

    const row = await prisma.projectToken.upsert({
      where: { gitlabProjectId: String(project.id) },
      create: { gitlabProjectId: String(project.id), ...data },
      update: data,
    });

    this.cache.clear();
    return toView(row);
  }

  async remove(id: number): Promise<void> {
    const result = await prisma.projectToken.deleteMany({ where: { id } });

    if (result.count === 0) {
      throw new ProjectTokenError("No such project token.", 404);
    }

    this.cache.clear();
  }

  /** Re-checks a stored token against GitLab (it may have expired or been revoked). */
  async test(id: number): Promise<{ ok: boolean; message: string }> {
    const row = await prisma.projectToken.findUnique({ where: { id } });

    if (!row) {
      throw new ProjectTokenError("No such project token.", 404);
    }

    try {
      await this.fetchProject(row.gitlabProjectId, decryptToken(row.encryptedToken));
      return { ok: true, message: "Token works for this project." };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "Token check failed." };
    }
  }

  /**
   * Token for a project given as a numeric ID or a path ("group/project").
   * undefined means "no entry" (caller falls back to GITLAB_TOKEN). If an entry
   * exists but can't be decrypted this throws, rather than silently falling back
   * to a token for the wrong project.
   */
  async resolve(projectRef: string): Promise<string | undefined> {
    const ref = normalizeRef(projectRef);
    const cached = this.cache.get(ref);

    if (cached && cached.expires > Date.now()) {
      return cached.token;
    }

    const row = await prisma.projectToken.findFirst({
      where: /^\d+$/.test(ref)
        ? { gitlabProjectId: ref }
        : { projectPath: { equals: ref, mode: "insensitive" } },
    });

    const token = row ? decryptToken(row.encryptedToken) : undefined;
    this.cache.set(ref, { token, expires: Date.now() + RESOLVE_CACHE_TTL_MS });

    return token;
  }

  private async fetchProject(ref: string, token: string): Promise<GitLabProjectInfo> {
    try {
      const response = await axios.get<GitLabProjectInfo>(
        `${env.gitlab.url}/api/v4/projects/${encodeURIComponent(ref)}`,
        { headers: { "PRIVATE-TOKEN": token }, timeout: 15_000 },
      );

      return response.data;
    } catch (error) {
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;

      if (status === 401) {
        throw new ProjectTokenError("GitLab rejected this token (401) — it is invalid or expired.", 400);
      }

      if (status === 404) {
        throw new ProjectTokenError(
          `This token can't see project "${ref}" (GitLab returned 404). Check the project ID/path, and that the token's owner has access to it.`,
          400,
        );
      }

      throw new ProjectTokenError("Could not reach GitLab to validate the token.", 502);
    }
  }

  // Best effort: lets the dashboard warn about write-capable tokens. Not every
  // token type/GitLab version supports this endpoint, so failure is not an error.
  private async fetchScopes(token: string): Promise<string[] | null> {
    try {
      const response = await axios.get<{ scopes?: string[] }>(
        `${env.gitlab.url}/api/v4/personal_access_tokens/self`,
        { headers: { "PRIVATE-TOKEN": token }, timeout: 15_000 },
      );

      return Array.isArray(response.data.scopes) ? response.data.scopes : null;
    } catch {
      return null;
    }
  }
}

export const projectTokenService = new ProjectTokenService();
