import { GitLabService } from "./gitlab.service";
import { LLMService } from "./llm.service";
import { prisma } from "../db/prisma";

import { env } from "../config/env";
import { GitLabDiff } from "../types/gitlab.types";
import { PatternAssessment, ProductionRiskReview } from "../types/production-risk.types";
import { FailurePattern } from "../patterns/failure-patterns";

import {
  PRODUCTION_RISK_SYSTEM_PROMPT,
  buildProductionRiskPrompt,
} from "../utils/production-risk-prompt";
import { filterReviewableDiffs } from "../utils/diff-filter";
import { batchDiffs } from "../utils/diff-batch";
import { getNewFileLineRanges, isLineWithinRanges } from "../utils/diff-hunks";

export class ProductionRiskService {
  constructor(
    private readonly gitlabService: GitLabService,
    private readonly llmService: LLMService,
  ) {}

  async checkMergeRequest(
    projectId: string,
    mergeRequestIid: number,
  ): Promise<ProductionRiskReview> {
    const patterns = await this.loadPatterns();

    const allDiffs = await this.gitlabService.getMergeRequestDiffs(
      projectId,
      mergeRequestIid,
    );

    const diffs = filterReviewableDiffs(allDiffs);

    // Diff-only, deliberately — no full-file context here. This service
    // reasons over a single diff in isolation, per PROJECT_BRIEF.md's
    // stated non-goal (no cross-file/cross-MR reasoning for v1).
    const batches = batchDiffs(diffs, env.reviewBatchMaxDiffChars);

    const batchResults: PatternAssessment[][] = [];

    for (const [index, batch] of batches.entries()) {
      const prompt = buildProductionRiskPrompt(batch, patterns);

      try {
        const response = await this.llmService.generate(
          PRODUCTION_RISK_SYSTEM_PROMPT,
          prompt,
        );

        const assessments = this.parseAssessments(response, patterns);
        const validated = this.validateAssessmentLines(assessments, batch);

        batchResults.push(validated);
      } catch (error) {
        console.error(
          `Production-risk batch ${index + 1}/${batches.length} failed:`,
          error,
        );
      }
    }

    const merged = this.mergeAssessments(batchResults, patterns);
    const threshold = env.productionRiskConfidenceThreshold;

    return {
      assessments: merged.map((assessment) =>
        this.applyConfidenceThreshold(assessment, threshold),
      ),
      batchesRun: batches.length,
      patternsChecked: patterns.length,
      confidenceThreshold: threshold,
    };
  }

  async loadPatterns(): Promise<FailurePattern[]> {
    const rows = await prisma.failurePattern.findMany({
      orderBy: { id: "asc" },
    });

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      exampleSignature: row.exampleSignature,
      source: {
        name: row.sourceName,
        date: row.sourceDate,
        url: row.sourceUrl ?? undefined,
      },
    }));
  }

  private parseAssessments(
    response: string,
    patterns: FailurePattern[],
  ): PatternAssessment[] {
    let cleaned = response.trim();

    if (cleaned.startsWith("```")) {
      cleaned = cleaned
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error(`LLM returned invalid JSON:\n${response}`);
    }

    const knownPatternIds = new Set(patterns.map((pattern) => pattern.id));
    const rawAssessments = (parsed as { assessments?: unknown[] })?.assessments;

    if (!Array.isArray(rawAssessments)) {
      throw new Error(`LLM response missing "assessments" array:\n${response}`);
    }

    const assessments: PatternAssessment[] = [];

    for (const raw of rawAssessments) {
      const item = raw as Partial<PatternAssessment> & { patternId?: unknown };

      // Drop anything claiming a pattern outside the curated set — the
      // model isn't allowed to invent findings under an unknown pattern.
      if (typeof item.patternId !== "string" || !knownPatternIds.has(item.patternId)) {
        continue;
      }

      const abstain = item.abstain === true;

      assessments.push({
        patternId: item.patternId,
        abstain,
        confidence:
          !abstain && typeof item.confidence === "number"
            ? Math.max(0, Math.min(1, item.confidence))
            : null,
        reasoning:
          typeof item.reasoning === "string" && item.reasoning.trim().length > 0
            ? item.reasoning
            : "(no reasoning provided)",
        file: typeof item.file === "string" ? item.file : null,
        line: typeof item.line === "number" ? item.line : null,
        belowThreshold: false,
      });
    }

    return assessments;
  }

  private validateAssessmentLines(
    assessments: PatternAssessment[],
    diffs: GitLabDiff[],
  ): PatternAssessment[] {
    const rangesByPath = new Map(
      diffs.map((diff) => [diff.new_path, getNewFileLineRanges(diff.diff)]),
    );

    return assessments.map((assessment) => {
      if (assessment.line === null || assessment.file === null) {
        return assessment;
      }

      const ranges = rangesByPath.get(assessment.file);

      if (!ranges || isLineWithinRanges(assessment.line, ranges)) {
        return assessment;
      }

      return {
        ...assessment,
        line: null,
        reasoning: `${assessment.reasoning} (line number reported by the model could not be verified against the diff and was removed)`,
      };
    });
  }

  // Patterns are checked once per batch; a real finding in any batch beats
  // an abstain from another batch that just didn't cover that file.
  private mergeAssessments(
    batchResults: PatternAssessment[][],
    patterns: FailurePattern[],
  ): PatternAssessment[] {
    const byPattern = new Map<string, PatternAssessment[]>();

    for (const batch of batchResults) {
      for (const assessment of batch) {
        const list = byPattern.get(assessment.patternId) ?? [];
        list.push(assessment);
        byPattern.set(assessment.patternId, list);
      }
    }

    return patterns.map((pattern) => {
      const all = byPattern.get(pattern.id) ?? [];
      const nonAbstain = all.filter((assessment) => !assessment.abstain);

      if (nonAbstain.length > 0) {
        return nonAbstain.reduce((best, current) =>
          (current.confidence ?? 0) > (best.confidence ?? 0) ? current : best,
        );
      }

      return (
        all[0] ?? {
          patternId: pattern.id,
          abstain: true,
          confidence: null,
          reasoning: "No response for this pattern from any batch.",
          file: null,
          line: null,
          belowThreshold: false,
        }
      );
    });
  }

  // The model's self-reported confidence is a signal, not something trusted
  // directly — a finding below the configured bar gets converted to an
  // abstain here, distinct from the model abstaining on its own, so a low-
  // confidence guess can't reach a caller looking only at `abstain`.
  private applyConfidenceThreshold(
    assessment: PatternAssessment,
    threshold: number,
  ): PatternAssessment {
    if (assessment.abstain || (assessment.confidence ?? 0) >= threshold) {
      return assessment;
    }

    return {
      ...assessment,
      abstain: true,
      belowThreshold: true,
      reasoning: `${assessment.reasoning} (confidence ${assessment.confidence} was below the ${threshold} threshold; treated as abstain)`,
      confidence: null,
    };
  }
}
