import type { ReviewResult } from "@/types/review";

export function ReviewSummary({ result }: { result: ReviewResult }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-6">
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-400">Review Summary</h3>
      <p className="text-gray-200">{result.summary}</p>
      <p className="mt-3 text-sm text-gray-500">
        {result.findings.length} finding{result.findings.length === 1 ? "" : "s"}
      </p>
    </div>
  );
}
