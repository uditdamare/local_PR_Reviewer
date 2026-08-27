"use client";

import { useState } from "react";
import { api, ApiRequestError } from "@/lib/api";
import type { CreateReviewInput, ReviewRecord } from "@/types/review";
import { ReviewForm } from "@/components/ReviewForm";
import { ReviewStatusPanel } from "@/components/ReviewStatusPanel";
import { ReviewSummary } from "@/components/ReviewSummary";
import { FindingList } from "@/components/FindingList";
import { ChangedFiles } from "@/components/ChangedFiles";

export default function HomePage() {
  const [review, setReview] = useState<ReviewRecord | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (input: CreateReviewInput) => {
    setIsSubmitting(true);
    setError(null);
    setReview(null);
    try {
      const { reviewId } = await api.createReview(input);
      const fullReview = await api.getReview(reviewId);
      setReview(fullReview);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-gray-100">AI PR Reviewer</h1>
        <p className="mt-1 text-sm text-gray-400">
          Review a local Git branch diff with a self-hosted coding LLM.
        </p>
      </header>

      <ReviewForm onSubmit={handleSubmit} isSubmitting={isSubmitting} />

      {error && (
        <div className="rounded-xl border border-red-600/40 bg-red-600/10 p-4 text-sm text-red-300">{error}</div>
      )}

      {review && (
        <div className="space-y-6">
          <ReviewStatusPanel review={review} />
          {review.changedFiles.length > 0 && <ChangedFiles files={review.changedFiles} />}
          {review.result && (
            <>
              <ReviewSummary result={review.result} />
              <FindingList findings={review.result.findings} />
            </>
          )}
        </div>
      )}
    </main>
  );
}
