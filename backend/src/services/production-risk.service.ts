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
import { formatErrorForLog } from "../utils/format-error";

export interface PreparedProductionRiskCheck {
  patterns: FailurePattern[];
  diffs: GitLabDiff[];
  systemPrompt: string;
  prompt: string;
}

// A raw assessment as handed in by whoever is doing the reasoning — an LLM
// response (parsed JSON) or an agent's own directly-provided array. Same
// shape either way; sanitizeAssessments() doesn't care which produced it.
type RawAssessment = Partial<PatternAssessment> & { patternId?: unknown };

export class ProductionRiskService {
  constructor(
    private readonly gitlabService: GitLabService,
    private readonly llmService: LLMService,
  ) {}

  /**
   * The fully-automated path: fetches the diff, calls the configured LLM
   * provider itself, validates the result. Costs an LLM API call.
   */
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

        const rawAssessments = this.parseLlmJson(response);
        const sanitized = this.sanitizeAssessments(rawAssessments, patterns);
        const validated = this.validateAssessmentLines(sanitized, batch);

        batchResults.push(validated);
      } catch (error) {
        console.error(
          `Production-risk batch ${index + 1}/${batches.length} failed: ${formatErrorForLog(error)}`,
        );
      }
    }

    return this.finalize(batchResults, patterns, batches.length);
  }

  /**
   * The agent-reasoned path, part 1: fetches the diff and patterns and
   * returns the exact same prompt an LLM would be given, but doesn't call
   * any LLM itself. Meant for a human's Claude Code/Desktop session to read
   * and reason over directly — costs no separate LLM API call, since the
   * calling agent already is one. Call finalizeAgentAssessments() next with
   * the agent's own answer.
   */
  async prepareCheck(
    projectId: string,
    mergeRequestIid: number,
  ): Promise<PreparedProductionRiskCheck> {
    const patterns = await this.loadPatterns();

    const allDiffs = await this.gitlabService.getMergeRequestDiffs(
      projectId,
      mergeRequestIid,
    );

    const diffs = filterReviewableDiffs(allDiffs);

    return {
      patterns,
      diffs,
      systemPrompt: PRODUCTION_RISK_SYSTEM_PROMPT,
      prompt: buildProductionRiskPrompt(diffs, patterns),
    };
  }

  /**
   * The agent-reasoned path, part 2: takes assessments the calling agent
   * produced itself (following prepareCheck's prompt/instructions) and runs
   * them through the exact same validation checkMergeRequest applies to an
   * LLM's response — unknown pattern ids dropped, line numbers checked
   * against the real diff hunks, confidence thresholded. An agent's
   * self-reported confidence is trusted no more than a hosted model's.
   */
  async finalizeAgentAssessments(
    projectId: string,
    mergeRequestIid: number,
    rawAssessments: unknown,
  ): Promise<ProductionRiskReview> {
    const patterns = await this.loadPatterns();

    const allDiffs = await this.gitlabService.getMergeRequestDiffs(
      projectId,
      mergeRequestIid,
    );

    const diffs = filterReviewableDiffs(allDiffs);

    const sanitized = this.sanitizeAssessments(rawAssessments, patterns);
    const validated = this.validateAssessmentLines(sanitized, diffs);

    return this.finalize([validated], patterns, 1);
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

  private finalize(
    batchResults: PatternAssessment[][],
    patterns: FailurePattern[],
    batchesRun: number,
  ): ProductionRiskReview {
    const merged = this.mergeAssessments(batchResults, patterns);
    const threshold = env.productionRiskConfidenceThreshold;

    return {
      assessments: merged.map((assessment) =>
        this.applyConfidenceThreshold(assessment, threshold),
      ),
      batchesRun,
      patternsChecked: patterns.length,
      confidenceThreshold: threshold,
    };
  }

  private parseLlmJson(response: string): unknown {
    let cleaned = response.trim();

    if (cleaned.startsWith("```")) {
      cleaned = cleaned
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "");
    }

    try {
      return JSON.parse(cleaned);
    } catch {
      throw new Error(`LLM returned invalid JSON:\n${response}`);
    }
  }

  // Shared by both paths: never trust patternId/abstain/confidence/etc as
  // given, whether they came from a hosted LLM's JSON or an agent's direct
  // input. Unknown pattern ids are dropped rather than passed through.
  private sanitizeAssessments(
    rawInput: unknown,
    patterns: FailurePattern[],
  ): PatternAssessment[] {
    const knownPatternIds = new Set(patterns.map((pattern) => pattern.id));

    const rawAssessments = Array.isArray(rawInput)
      ? rawInput
      : (rawInput as { assessments?: unknown[] })?.assessments;

    if (!Array.isArray(rawAssessments)) {
      throw new Error(
        `Expected an "assessments" array, got: ${JSON.stringify(rawInput)}`,
      );
    }

    const assessments: PatternAssessment[] = [];

    for (const raw of rawAssessments) {
      const item = raw as RawAssessment;

      // Drop anything claiming a pattern outside the curated set — neither
      // an LLM nor an agent is allowed to invent a finding under an
      // unknown pattern.
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
        reasoning: `${assessment.reasoning} (line number reported could not be verified against the diff and was removed)`,
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

  // The model's (or agent's) self-reported confidence is a signal, not
  // something trusted directly — a finding below the configured bar gets
  // converted to an abstain here, distinct from abstaining on its own, so a
  // low-confidence guess can't reach a caller looking only at `abstain`.
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
