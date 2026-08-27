export type ChangedFileStatus = "added" | "modified" | "deleted" | "renamed";

export interface ChangedFile {
  path: string;
  status: ChangedFileStatus;
  insertions: number;
  deletions: number;
}

export interface ReviewContext {
  repositoryPath: string;
  baseBranch: string;
  reviewBranch: string;
  baseCommit: string;
  reviewCommit: string;
  diff: string;
  changedFiles: ChangedFile[];
  guidelines: string | null;
}

export type FindingSeverity = "critical" | "high" | "medium" | "low";

export type FindingCategory =
  | "bug"
  | "security"
  | "performance"
  | "maintainability"
  | "documentation";

export interface Finding {
  severity: FindingSeverity;
  category: FindingCategory;
  file: string;
  line: number | null;
  title: string;
  description: string;
  suggestion: string;
  confidence: number;
}

export interface ReviewResult {
  summary: string;
  findings: Finding[];
}

export type ReviewStatus = "queued" | "running" | "completed" | "failed";

export interface ReviewRecord {
  id: string;
  status: ReviewStatus;
  repositoryPath: string;
  baseBranch: string;
  reviewBranch: string;
  changedFiles: ChangedFile[];
  result: ReviewResult | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
}
