import type { ReviewRecord } from "@/types/review";

const STATUS_STYLES: Record<ReviewRecord["status"], string> = {
  queued: "bg-gray-500/20 text-gray-300",
  running: "bg-blue-500/20 text-blue-300",
  completed: "bg-green-500/20 text-green-300",
  failed: "bg-red-500/20 text-red-300",
};

export function ReviewStatusPanel({ review }: { review: ReviewRecord }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-100">Review {review.id.slice(0, 8)}</h2>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${STATUS_STYLES[review.status]}`}>
          {review.status}
        </span>
      </div>
      <dl className="mt-4 grid grid-cols-1 gap-2 text-sm text-gray-400 sm:grid-cols-3">
        <div>
          <dt className="text-gray-500">Repository</dt>
          <dd className="truncate text-gray-200">{review.repositoryPath}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Base branch</dt>
          <dd className="text-gray-200">{review.baseBranch}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Review branch</dt>
          <dd className="text-gray-200">{review.reviewBranch}</dd>
        </div>
      </dl>
      {review.status === "failed" && review.error && (
        <p className="mt-4 rounded-lg bg-red-500/10 px-4 py-2 text-sm text-red-300">{review.error}</p>
      )}
    </div>
  );
}
