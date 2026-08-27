import type { ReviewRecord } from "../types/review";

/**
 * In-memory store for review records.
 *
 * V1 intentionally has no database (see project constraints). This means
 * review history is lost on server restart — acceptable for local
 * development, not for a shared/production deployment.
 */
export class ReviewStore {
  private readonly records = new Map<string, ReviewRecord>();

  save(record: ReviewRecord): void {
    this.records.set(record.id, record);
  }

  get(id: string): ReviewRecord | undefined {
    return this.records.get(id);
  }
}

export const reviewStore = new ReviewStore();
