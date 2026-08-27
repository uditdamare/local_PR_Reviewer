import type { Request, Response, NextFunction } from "express";
import { createReviewRequestSchema } from "../schemas/review.schemas";
import { AppError } from "../types/errors";
import { runReview, getReview } from "../services/ReviewOrchestrator";

export async function createReview(req: Request, res: Response, next: NextFunction): Promise<void> {
  const parsed = createReviewRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    next(new AppError("INVALID_REQUEST", parsed.error.issues.map((i) => i.message).join(", ")));
    return;
  }

  try {
    // V1 runs synchronously, per spec, but the response shape already
    // matches an async "queued" flow so a worker can be introduced later
    // without changing the API contract.
    const record = await runReview({
      repoPath: parsed.data.repoPath,
      baseBranch: parsed.data.baseBranch,
      reviewBranch: parsed.data.reviewBranch,
    });

    res.status(201).json({ reviewId: record.id, status: record.status });
  } catch (err) {
    next(err);
  }
}

export function getReviewById(req: Request, res: Response, next: NextFunction): void {
  try {
    const record = getReview(req.params.id as string);
    res.status(200).json(record);
  } catch (err) {
    next(err);
  }
}
