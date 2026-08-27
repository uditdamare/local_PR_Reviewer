export interface GitLabUser {
  id: number;
  username: string;
  name: string;
  avatar_url?: string;
  web_url?: string;
}

export interface GitLabMergeRequest {
  id: number;
  iid: number;
  title: string;
  description: string | null;

  source_branch: string;
  target_branch: string;

  source_project_id: number;
  target_project_id: number;

  web_url: string;

  author: GitLabUser;

  state: string;

  created_at: string;
  updated_at: string;
}

export interface GitLabDiff {
  old_path: string;
  new_path: string;

  a_mode: string;
  b_mode: string;

  new_file: boolean;
  renamed_file: boolean;
  deleted_file: boolean;

  diff: string;
}

export interface GitLabDiffResponse {
  diffs: GitLabDiff[];

  total_diffs?: number;
  page?: number;
  per_page?: number;
}

export interface GitLabTreeItem {
  id: string;
  name: string;
  type: "blob" | "tree";
  path: string;
  mode: string;
}

export interface GitLabFile {
  file_name: string;
  file_path: string;

  size: number;

  encoding: string;
  content: string;

  ref: string;

  blob_id: string;
  commit_id: string;
  last_commit_id: string;
}