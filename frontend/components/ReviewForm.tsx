"use client";

import { useState } from "react";
import type { CreateReviewInput } from "@/types/review";

interface ReviewFormProps {
  onSubmit: (input: CreateReviewInput) => Promise<void>;
  isSubmitting: boolean;
}

export function ReviewForm({ onSubmit, isSubmitting }: ReviewFormProps) {
  const [repoPath, setRepoPath] = useState("");
  const [baseBranch, setBaseBranch] = useState("main");
  const [reviewBranch, setReviewBranch] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoPath || !baseBranch || !reviewBranch) return;
    await onSubmit({ repoPath, baseBranch, reviewBranch });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-6">
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-300" htmlFor="repoPath">
          Repository path
        </label>
        <input
          id="repoPath"
          type="text"
          value={repoPath}
          onChange={(e) => setRepoPath(e.target.value)}
          placeholder="/Users/me/projects/myrepo"
          className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 outline-none focus:border-blue-500"
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-300" htmlFor="baseBranch">
            Base branch
          </label>
          <input
            id="baseBranch"
            type="text"
            value={baseBranch}
            onChange={(e) => setBaseBranch(e.target.value)}
            placeholder="main"
            className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 outline-none focus:border-blue-500"
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-300" htmlFor="reviewBranch">
            Review branch
          </label>
          <input
            id="reviewBranch"
            type="text"
            value={reviewBranch}
            onChange={(e) => setReviewBranch(e.target.value)}
            placeholder="feature/payment-fix"
            className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 outline-none focus:border-blue-500"
            required
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSubmitting ? "Reviewing..." : "Start Review"}
      </button>
    </form>
  );
}
