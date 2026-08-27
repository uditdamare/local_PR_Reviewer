import { GitLabService } from "./gitlab.service";
import { LLMService } from "./llm.service";

import { env } from "../config/env";
import { GitLabDiff } from "../types/gitlab.types";
import {
  CodeReview,
  DocumentationItem,
  ReviewContext,
  ReviewFinding,
} from "../types/review.types";

import { buildReviewPrompt } from "../utils/review-prompt";
import { filterReviewableDiffs } from "../utils/diff-filter";
import { batchDiffs } from "../utils/diff-batch";
import { checkSyntax, isSyntaxCheckable } from "../utils/syntax-check";
import {
  getNewFileLineRanges,
  isLineWithinRanges,
} from "../utils/diff-hunks";
import { findUnusedDeclarations } from "../utils/unused-declarations";
import { scanForSecrets } from "../utils/secret-scan";

const REVIEW_SYSTEM_PROMPT = `
You are an expert software engineer
performing automated code reviews.

Be conservative.

Do not report speculative problems.

Prioritize real bugs and security issues.
`;

export class ReviewService {
  constructor(
    private readonly gitlabService: GitLabService,
    private readonly llmService: LLMService,
  ) {}

  async reviewMergeRequest(
    projectId: string,
    mergeRequestIid: number,
  ): Promise<CodeReview> {

    // 1. Get MR
    const mergeRequest =
      await this.gitlabService.getMergeRequest(
        projectId,
        mergeRequestIid,
      );

    // 2. Get changed code
    const allDiffs =
      await this.gitlabService.getMergeRequestDiffs(
        projectId,
        mergeRequestIid,
      );

    const diffs = filterReviewableDiffs(allDiffs);

    // 3. Get project guidelines
    const guidelines: string[] = [];

    try {
      const guidelinesFile =
        await this.gitlabService.getFile(
          projectId,
          ".ai-review/guidelines.md",
          mergeRequest.target_branch,
        );

      guidelines.push(guidelinesFile.content);
    } catch {
      console.log(
        "No .ai-review/guidelines.md found",
      );
    }

    // 4. Fetch each changed file's full content once — shared by the
    // syntax check, the unused-declaration check, the secret scan, and
    // the "relevant files" context handed to the LLM below.
    const contentByPath = await this.fetchChangedFileContents(
      projectId,
      mergeRequest.source_branch,
      diffs,
    );

    // 5. Deterministic checks, independent of whatever the LLM does or
    // doesn't notice.
    const syntaxFindings = this.checkSyntaxErrors(contentByPath);
    const unusedDeclarationFindings =
      this.checkUnusedDeclarations(contentByPath, syntaxFindings);
    const secretFindings = this.checkSecrets(contentByPath);

    // 6. Split the diffs into batches that fit the model's context window,
    // so a multi-file MR doesn't get silently truncated in one giant
    // prompt. Batch sizing accounts for the relevant full-file context
    // that will also be attached, not just the diff text.
    const batches = batchDiffs(
      diffs,
      env.reviewBatchMaxDiffChars,
      (diff) =>
        Math.min(
          contentByPath.get(diff.new_path)?.length ?? 0,
          env.reviewRelevantFileMaxChars,
        ),
    );

    const llmFindings: ReviewFinding[] = [];
    const documentationNeeded: DocumentationItem[] = [];
    const summaries: string[] = [];

    for (const [index, batch] of batches.entries()) {
      const context: ReviewContext = {
        mergeRequest: {
          title: mergeRequest.title,

          description:
            mergeRequest.description,

          sourceBranch:
            mergeRequest.source_branch,

          targetBranch:
            mergeRequest.target_branch,

          url: mergeRequest.web_url,
        },

        guidelines,

        diffs: batch,

        relevantFiles: this.buildRelevantFiles(batch, contentByPath),
      };

      const prompt = buildReviewPrompt(context);

      try {
        const response = await this.llmService.generate(
          REVIEW_SYSTEM_PROMPT,
          prompt,
        );

        const batchReview = this.parseReview(response);

        summaries.push(batchReview.summary);
        llmFindings.push(...batchReview.findings);
        documentationNeeded.push(...batchReview.documentationNeeded);
      } catch (error) {
        console.error(
          `Review batch ${index + 1}/${batches.length} failed:`,
          error,
        );
      }
    }

    // 7. Small local models are unreliable at mapping a diff hunk to an
    // absolute line number — drop any LLM-claimed line that doesn't
    // actually fall within that file's diff hunks, rather than trusting it.
    const validatedLlmFindings = this.validateFindingLines(
      llmFindings,
      diffs,
    );

    // 8. Merge the deterministic findings with the LLM's findings across
    // all batches.
    return {
      summary:
        summaries.length > 0
          ? summaries.join("\n\n")
          : "No significant issues found.",
      findings: [
        ...syntaxFindings,
        ...unusedDeclarationFindings,
        ...secretFindings,
        ...validatedLlmFindings,
      ],
      documentationNeeded,
    };
  }

  private async fetchChangedFileContents(
    projectId: string,
    ref: string,
    diffs: GitLabDiff[],
  ): Promise<Map<string, string>> {
    const contentByPath = new Map<string, string>();

    for (const diff of diffs) {
      if (diff.deleted_file) {
        continue;
      }

      try {
        const file = await this.gitlabService.getFile(
          projectId,
          diff.new_path,
          ref,
        );
        contentByPath.set(diff.new_path, file.content);
      } catch {
        // File may have been renamed/removed since the diff was computed —
        // skip it, the checks below just won't run for this path.
      }
    }

    return contentByPath;
  }

  private buildRelevantFiles(
    batch: GitLabDiff[],
    contentByPath: Map<string, string>,
  ): { path: string; content: string }[] {
    return batch
      .map((diff) => {
        const content = contentByPath.get(diff.new_path);
        if (!content) {
          return null;
        }

        const capped =
          content.length > env.reviewRelevantFileMaxChars
            ? `${content.slice(0, env.reviewRelevantFileMaxChars)}\n[...file truncated...]`
            : content;

        return { path: diff.new_path, content: capped };
      })
      .filter(
        (file): file is { path: string; content: string } => file !== null,
      );
  }

  private validateFindingLines(
    findings: ReviewFinding[],
    diffs: GitLabDiff[],
  ): ReviewFinding[] {
    const rangesByPath = new Map(
      diffs.map((diff) => [diff.new_path, getNewFileLineRanges(diff.diff)]),
    );

    return findings.map((finding) => {
      if (typeof finding.line !== "number") {
        return finding;
      }

      const ranges = rangesByPath.get(finding.file);

      if (!ranges || isLineWithinRanges(finding.line, ranges)) {
        return finding;
      }

      return {
        ...finding,
        line: undefined,
        explanation: `${finding.explanation} (line number reported by the model could not be verified against the diff and was removed)`,
      };
    });
  }

  private checkSyntaxErrors(
    contentByPath: Map<string, string>,
  ): ReviewFinding[] {
    const findings: ReviewFinding[] = [];

    for (const [path, content] of contentByPath) {
      if (!isSyntaxCheckable(path)) {
        continue;
      }

      for (const issue of checkSyntax(path, content)) {
        findings.push({
          severity: "CRITICAL",
          category: "BUG",
          file: path,
          line: issue.line,
          title: "Syntax error introduced",
          explanation: issue.message,
        });
      }
    }

    return findings;
  }

  private checkUnusedDeclarations(
    contentByPath: Map<string, string>,
    syntaxFindings: ReviewFinding[],
  ): ReviewFinding[] {
    // Only trust the AST for files that parsed cleanly — a syntax error
    // can produce a garbage tree and bogus unused-declaration noise.
    const pathsWithSyntaxErrors = new Set(
      syntaxFindings.map((finding) => finding.file),
    );

    const findings: ReviewFinding[] = [];

    for (const [path, content] of contentByPath) {
      if (!isSyntaxCheckable(path) || pathsWithSyntaxErrors.has(path)) {
        continue;
      }

      for (const declaration of findUnusedDeclarations(path, content)) {
        findings.push({
          severity: "LOW",
          category: "CODE_QUALITY",
          file: path,
          line: declaration.line,
          title: "Possibly unused declaration",
          explanation: `\`${declaration.name}\` is declared but not referenced anywhere else in this file.`,
        });
      }
    }

    return findings;
  }

  private checkSecrets(contentByPath: Map<string, string>): ReviewFinding[] {
    const findings: ReviewFinding[] = [];

    for (const [path, content] of contentByPath) {
      for (const match of scanForSecrets(content)) {
        findings.push({
          severity: match.severity,
          category: "SECURITY",
          file: path,
          line: match.line,
          title: `Possible hardcoded credential: ${match.pattern}`,
          explanation:
            "This line matches a known credential/personal-path pattern. Rotate/remove it and use an environment variable or secrets manager instead.",
        });
      }
    }

    return findings;
  }

  private parseReview(
    response: string,
  ): CodeReview {

    let cleaned = response.trim();

    // Handle ```json ... ``` responses
    if (cleaned.startsWith("```")) {
      cleaned = cleaned
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "");
    }

    try {
      return JSON.parse(cleaned) as CodeReview;
    } catch {
      throw new Error(
        `LLM returned invalid JSON:\n${response}`,
      );
    }
  }
}
