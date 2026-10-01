import axios, {
  AxiosInstance,
} from "axios";

import { env } from "../config/env";

import {
  GitLabDiff,
  GitLabFile,
  GitLabMergeRequest,
  GitLabNote,
  GitLabTreeItem,
} from "../types/gitlab.types";

export class GitLabService {
  private readonly client: AxiosInstance;

  // `token` lets a caller override env.gitlab.token — used by the remote
  // HTTP MCP server, which never holds anyone's GitLab token itself: each
  // request supplies its own via an Authorization header, read per-request,
  // never written to this server's environment or disk. The stdio server
  // (local Claude Code/Desktop use) keeps using env.gitlab.token as before.
  constructor(token?: string) {
    const resolvedToken = token ?? env.gitlab.token;

    if (!resolvedToken) {
      throw new Error(
        "No GitLab token available — set GITLAB_TOKEN in the environment, " +
          "or (for the remote HTTP server) supply an Authorization header.",
      );
    }

    this.client = axios.create({
      baseURL: `${env.gitlab.url}/api/v4`,

      headers: {
        "PRIVATE-TOKEN": resolvedToken,
        Accept: "application/json",
      },

      timeout: 30_000,
    });
  }

  /**
   * Get merge request information.
   */
  async getMergeRequest(
    projectId: string,
    mergeRequestIid: number,
  ): Promise<GitLabMergeRequest> {
    const encodedProjectId = encodeURIComponent(projectId);

    const response =
      await this.client.get<GitLabMergeRequest>(
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

    const response =
      await this.client.get<GitLabDiff[]>(
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

    const response =
      await this.client.get<GitLabTreeItem[]>(
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

    const response =
      await this.client.get<GitLabFile>(
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

    const response = await this.client.post<GitLabNote>(
      `/projects/${encodedProjectId}/merge_requests/${mergeRequestIid}/notes`,
      { body },
    );

    return response.data;
  }
}