import { GitLabDiff } from "../types/gitlab.types";

function capDiffLength(diff: GitLabDiff, maxChars: number): GitLabDiff {
  if (diff.diff.length <= maxChars) {
    return diff;
  }

  return {
    ...diff,
    diff: `${diff.diff.slice(0, maxChars)}\n[...diff truncated...]`,
  };
}

/**
 * Groups diffs into batches that each stay under maxCharsPerBatch, so a
 * multi-file MR doesn't get silently truncated by the LLM's context window
 * (a single oversized prompt gets cut off server-side with no error).
 * Each batch is reviewed as its own LLM call; findings are merged after.
 *
 * extraWeight lets the caller account for additional prompt content tied
 * to a diff (e.g. the relevant full-file context also being sent) so the
 * batch's real total size — not just the diff text — stays under budget.
 */
export function batchDiffs(
  diffs: GitLabDiff[],
  maxCharsPerBatch: number,
  extraWeight: (diff: GitLabDiff) => number = () => 0,
): GitLabDiff[][] {
  const capped = diffs.map((diff) => capDiffLength(diff, maxCharsPerBatch));

  const batches: GitLabDiff[][] = [];
  let currentBatch: GitLabDiff[] = [];
  let currentChars = 0;

  for (const diff of capped) {
    const size = diff.diff.length + extraWeight(diff);

    if (currentBatch.length > 0 && currentChars + size > maxCharsPerBatch) {
      batches.push(currentBatch);
      currentBatch = [];
      currentChars = 0;
    }

    currentBatch.push(diff);
    currentChars += size;
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
}
