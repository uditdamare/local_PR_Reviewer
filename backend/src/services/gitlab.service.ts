import axios, {
  AxiosInstance,
} from "axios";

import { env } from "../config/env";
import { projectTokenService } from "./project-token.service";

import {
  GitLabDiff,
  GitLabFile,
  GitLabMergeRequest,
  GitLabNote,
  GitLabTreeItem,
} from "../types/gitlab.types";

export class GitLabService {
  private readonly clients = new Map<string, AxiosInstance>();

  // Token precedence per call:
  //   1. `fixedToken`, if given. The remote HTTP MCP server always passes one:
  //      each request supplies its own via an Authorization header, so that
  //      server never reads the stored-token registry at all.
  //   2. The token registered for that project in the /admin dashboard.
  //   3. GITLAB_TOKEN from the environment (local default).
  constructor(private readonly fixedToken?: string) {}

  private async clientFor(projectId: string): Promise<AxiosInstance> {
    const token =
      this.fixedToken ??
      (await projectTokenService.resolve(projectId)) ??
      env.gitlab.token;

    if (!token) {
      throw new Error(
        `No GitLab token available for project "${projectId}". Add one for it in the dashboard (/admin), ` +
          "or set GITLAB_TOKEN in the environment.",
      );
    }

    let client = this.clients.get(token);

    if (!client) {
      client = axios.create({
        baseURL: `${env.gitlab.url}/api/v4`,

        headers: {
          "PRIVATE-TOKEN": token,
          Accept: "application/json",
        },

        timeout: 30_000,
      });

      this.clients.set(token, client);
    }

    return client;
  }

  /**
   * Get merge request information.
   */
  async getMergeRequest(
    projectId: string,
    mergeRequestIid: number,
  ): Promise<GitLabMergeRequest> {
    const encodedProjectId = encodeURIComponent(projectId);
    const client = await this.clientFor(projectId);

    const response =
      await client.get<GitLabMergeRequest>(
        `/projects/${encodedProjectId}/merge_requests/${mergeRequestIid}`,
      );

    return response.data;
  }

  /**
   * Get files/diffs changed in the MR.
   */
  async getMergeRequestDiffs(
    projectId: string,
    mergeRequestIid: number,
  ): Promise<GitLabDiff[]> {
    const encodedProjectId = encodeURIComponent(projectId);
    const client = await this.clientFor(projectId);

    const response =
      await client.get<GitLabDiff[]>(
        `/projects/${encodedProjectId}/merge_requests/${mergeRequestIid}/diffs`,
      );

    return response.data;
  }

  /**
   * Get repository tree.
   */
  async getRepositoryTree(
    projectId: string,
    ref: string,
  ): Promise<GitLabTreeItem[]> {
    const encodedProjectId = encodeURIComponent(projectId);
    const client = await this.clientFor(projectId);

    const response =
      await client.get<GitLabTreeItem[]>(
        `/projects/${encodedProjectId}/repository/tree`,
        {
          params: {
            ref,
            recursive: true,
            per_page: 100,
          },
        },
      );

    return response.data;
  }

  /**
   * Get a single repository file.
   *
   * GitLab returns file content as Base64.
   */
  async getFile(
    projectId: string,
    filePath: string,
    ref: string,
  ): Promise<GitLabFile> {
    const encodedProjectId =
      encodeURIComponent(projectId);

    const encodedFilePath =
      encodeURIComponent(filePath);

    const client = await this.clientFor(projectId);

    const response =
      await client.get<GitLabFile>(
        `/projects/${encodedProjectId}/repository/files/${encodedFilePath}`,
        {
          params: {
            ref,
          },
        },
      );

    const file = response.data;

    return {
      ...file,

      content: Buffer.from(
        file.content,
        "base64",
      ).toString("utf8"),
    };
  }

  /**
   * Post a general (non-inline) comment on a merge request. Always a
   * separate, explicit action from running a review — this project never
   * posts automatically as a side effect of checking a diff.
   */
  async createMergeRequestNote(
    projectId: string,
    mergeRequestIid: number,
    body: string,
  ): Promise<GitLabNote> {
    const encodedProjectId = encodeURIComponent(projectId);
    const client = await this.clientFor(projectId);

    const response = await client.post<GitLabNote>(
      `/projects/${encodedProjectId}/merge_requests/${mergeRequestIid}/notes`,
      { body },
    );

    return response.data;
  }
}
