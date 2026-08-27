import type { Finding } from "@/types/review";

const SEVERITY_STYLES: Record<Finding["severity"], string> = {
  critical: "bg-red-600/20 text-red-300 border-red-600/40",
  high: "bg-orange-600/20 text-orange-300 border-orange-600/40",
  medium: "bg-yellow-600/20 text-yellow-300 border-yellow-600/40",
  low: "bg-gray-600/20 text-gray-300 border-gray-600/40",
};

const CATEGORY_LABEL: Record<Finding["category"], string> = {
  bug: "Bug",
  security: "Security",
  performance: "Performance",
  maintainability: "Maintainability",
  documentation: "Documentation",
};

export function FindingCard({ finding }: { finding: Finding }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5">
      <div className="mb-2 flex items-center gap-2">
        <span
          className={`rounded-md border px-2 py-0.5 text-xs font-bold uppercase ${SEVERITY_STYLES[finding.severity]}`}
        >
          {finding.severity}
        </span>
        <span className="rounded-md border border-white/10 px-2 py-0.5 text-xs font-semibold uppercase text-gray-300">
          {CATEGORY_LABEL[finding.category]}
        </span>
      </div>

      <h4 className="text-base font-semibold text-gray-100">{finding.title}</h4>
      <p className="mt-1 font-mono text-xs text-gray-500">
        {finding.file}
        {finding.line !== null ? `:${finding.line}` : ""}
      </p>

      <p className="mt-3 text-sm text-gray-300">{finding.description}</p>

      {finding.suggestion && (
        <div className="mt-3 rounded-lg bg-black/30 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Suggested fix</p>
          <p className="mt-1 text-sm text-gray-300">{finding.suggestion}</p>
        </div>
      )}

      <p className="mt-3 text-xs text-gray-500">Confidence: {Math.round(finding.confidence * 100)}%</p>
    </div>
  );
}
