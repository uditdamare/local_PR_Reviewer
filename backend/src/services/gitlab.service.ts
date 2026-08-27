import axios, {
  AxiosInstance,
} from "axios";

import { env } from "../config/env";

import {
  GitLabDiff,
  GitLabFile,
  GitLabMergeRequest,
  GitLabTreeItem,
} from "../types/gitlab.types";

export class GitLabService {
  private readonly client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: `${env.gitlab.url}/api/v4`,

      headers: {
        "PRIVATE-TOKEN": env.gitlab.token,
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
}