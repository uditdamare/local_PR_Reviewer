import type { Finding } from "@/types/review";
import { FindingCard } from "./FindingCard";

export function FindingList({ findings }: { findings: Finding[] }) {
  if (findings.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-center text-sm text-gray-400">
        No findings were reported for this review.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {findings.map((finding, index) => (
        <FindingCard key={`${finding.file}-${finding.line}-${index}`} finding={finding} />
      ))}
    </div>
  );
}
