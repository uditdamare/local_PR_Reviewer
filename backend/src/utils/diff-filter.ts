import { GitLabDiff } from "../types/gitlab.types";

const NON_CODE_EXTENSIONS = new Set([
  ".md",
  ".txt",
  ".log",
  ".lock",
  // Binary/office formats — GitLab's diff for these is meaningless text,
  // sending it wastes a batch slot and produces junk findings.
  ".docx",
  ".doc",
  ".pdf",
  ".xlsx",
  ".xls",
  ".pptx",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".ico",
  ".zip",
  ".gz",
  ".woff",
  ".woff2",
  ".ttf",
]);

const NON_CODE_FILENAMES = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
]);

function isReviewableFile(path: string): boolean {
  const fileName = path.split("/").pop() ?? path;

  if (NON_CODE_FILENAMES.has(fileName)) {
    return false;
  }

  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex === -1) {
    return true;
  }

  const extension = fileName.slice(dotIndex).toLowerCase();
  return !NON_CODE_EXTENSIONS.has(extension);
}

/**
 * Excludes docs/notes/lockfiles so a large non-code file (e.g. a scratch
 * handoff doc) doesn't drown out the actual code diff in the LLM prompt.
 */
export function filterReviewableDiffs(
  diffs: GitLabDiff[],
): GitLabDiff[] {
  return diffs.filter((diff) =>
    isReviewableFile(diff.new_path) &&
    isReviewableFile(diff.old_path),
  );
}
