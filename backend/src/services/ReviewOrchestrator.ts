import { v4 as uuid } from "uuid";
import { GitService } from "../git/GitService";
import { RepositoryContextService } from "./RepositoryContextService";
import { createRepositoryTools } from "../tools/repositoryTools";
import { OllamaCodeReviewer } from "../reviewer/OllamaCodeReviewer";
import type { CodeReviewer } from "../reviewer/CodeReviewer";
import { reviewStore } from "./ReviewStore";
import type { ChangedFile, ReviewRecord } from "../types/review";
import { AppError } from "../types/errors";

/**
 * Coordinates a single review end to end:
 *   validate repo -> resolve commits -> diff -> guidelines -> LLM -> persist
 *
 * This is the only place that wires Git access, repository context, tools,
 * and the LLM provider together. Swapping the LLM provider only requires
 * changing `defaultReviewer` below.
 */
const defaultReviewer: CodeReviewer = new OllamaCodeReviewer();

export interface StartReviewInput {
  repoPath: string;
  baseBranch: string;
  reviewBranch: string;
}

export async function runReview(
  input: StartReviewInput,
  reviewer: CodeReviewer = defaultReviewer,
): Promise<ReviewRecord> {
  const id = uuid();
  const createdAt = new Date().toISOString();

  const record: ReviewRecord = {
    id,
    status: "running",
    repositoryPath: input.repoPath,
    baseBranch: input.baseBranch,
    reviewBranch: input.reviewBranch,
    changedFiles: [],
    result: null,
    error: null,
    createdAt,
    completedAt: null,
  };
  reviewStore.save(record);

  try {
    const git = await GitService.open(input.repoPath);
    await git.assertBranchExists(input.baseBranch);
    await git.assertBranchExists(input.reviewBranch);

    const [baseCommit, reviewCommit, diff, changedFiles] = await Promise.all([
      git.resolveCommit(input.baseBranch),
      git.resolveCommit(input.reviewBranch),
      git.diff(input.baseBranch, input.reviewBranch),
      git.changedFiles(input.baseBranch, input.reviewBranch),
    ]);

    record.changedFiles = changedFiles;

    const guidelines = RepositoryContextService.loadGuidelines(git);
    const tools = createRepositoryTools(git, diff);

    const result = await reviewer.review({
      repositoryPath: git.root,
      baseBranch: input.baseBranch,
      reviewBranch: input.reviewBranch,
      diff,
      changedFiles: changedFiles.map((f: ChangedFile) => f.path),
      guidelines,
      tools,
    });

    record.status = "completed";
    record.result = result;
    record.completedAt = new Date().toISOString();
  } catch (err) {
    record.status = "failed";
    record.error = err instanceof AppError ? err.message : "Review failed due to an internal error";
    record.completedAt = new Date().toISOString();
    reviewStore.save(record);
    throw err;
  }

  reviewStore.save(record);
  return record;
}

export function getReview(id: string): ReviewRecord {
  const record = reviewStore.get(id);
  if (!record) {
    throw new AppError("REVIEW_NOT_FOUND", `No review found with id "${id}"`, 404);
  }
  return record;
}
