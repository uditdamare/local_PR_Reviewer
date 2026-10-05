import { ProductionRiskReview, PatternAssessment } from "../types/production-risk.types";
import { FailurePattern } from "../patterns/failure-patterns";

/**
 * Formats a ProductionRiskReview as a single Markdown MR comment — a
 * summary for a human to judge, not an auto-applied verdict. Abstained
 * patterns are shown collapsed, not omitted, so a reader can see what was
 * actually checked, not just what got flagged.
 */
export function formatProductionRiskComment(
  review: ProductionRiskReview,
  patterns: FailurePattern[],
): string {
  const nameById = new Map(patterns.map((pattern) => [pattern.id, pattern.name]));
  const findings = review.assessments.filter((assessment) => !assessment.abstain);
  const abstained = review.assessments.filter((assessment) => assessment.abstain);

  const lines: string[] = [];

  lines.push("## Production-Risk Review");
  lines.push("");
  lines.push(
    `Checked this diff against ${review.patternsChecked} curated production-risk failure ` +
      `patterns (confidence threshold: ${review.confidenceThreshold}). This is not a general ` +
      "code review — see the project's `PROJECT_BRIEF.md` for the pattern list and sources.",
  );
  lines.push("");

  if (findings.length === 0) {
    lines.push("No patterns matched with sufficient confidence.");
  } else {
    lines.push("### Findings");
    lines.push("");

    for (const finding of findings) {
      lines.push(formatFinding(finding, nameById));
    }
  }

  if (abstained.length > 0) {
    lines.push("");
    lines.push("<details>");
    lines.push(`<summary>Patterns checked but not flagged (${abstained.length})</summary>`);
    lines.push("");

    for (const assessment of abstained) {
      const name = nameById.get(assessment.patternId) ?? assessment.patternId;
      lines.push(`- **${name}** — ${assessment.reasoning}`);
    }

    lines.push("");
    lines.push("</details>");
  }

  lines.push("");
  lines.push("---");
  lines.push(
    "🤖 Automated production-risk check — a human should still judge these findings before " +
      "acting on them. This tool reasons over a single diff in isolation; it cannot see cross-MR " +
      "or whole-system state.",
  );

  return lines.join("\n");
}

function formatFinding(
  finding: PatternAssessment,
  nameById: Map<string, string>,
): string {
  const name = nameById.get(finding.patternId) ?? finding.patternId;
  const location =
    finding.file !== null
      ? finding.line !== null
        ? ` — \`${finding.file}:${finding.line}\``
        : ` — \`${finding.file}\``
      : "";

  return `- **${name}** (confidence ${finding.confidence})${location}\n  ${finding.reasoning}`;
}
