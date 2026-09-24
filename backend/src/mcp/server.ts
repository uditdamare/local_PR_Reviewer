import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { GitLabService } from "../services/gitlab.service";
import { LLMService } from "../services/llm.service";
import { ReviewService } from "../services/review.service";
import { ProductionRiskService } from "../services/production-risk.service";
import { formatProductionRiskComment } from "../utils/production-risk-comment";

// `review_merge_request` below is the earlier general-findings pipeline
// (bugs/security/performance/etc, no curated evidence). `check_production_risk`
// is the project's actual differentiator: diff + the curated failure-pattern
// set in, per-pattern confidence/abstain out. Both are kept since they're
// genuinely different tools, not two versions of the same one.
const gitlabService = new GitLabService();
const llmService = new LLMService();
const reviewService = new ReviewService(gitlabService, llmService);
const productionRiskService = new ProductionRiskService(gitlabService, llmService);

const server = new McpServer({
  name: "pr-reviewer",
  version: "0.1.0",
});

server.registerTool(
  "review_merge_request",
  {
    title: "Review GitLab merge request",
    description:
      "Fetches a GitLab merge request's diff and runs it through the deterministic checks " +
      "(syntax, unused declarations, secret scan) plus an LLM review pass. Returns findings " +
      "as structured JSON. Note: this currently returns general code-review findings, not " +
      "yet the curated production-risk-pattern set described in the project brief.",
    inputSchema: {
      projectId: z
        .string()
        .describe("GitLab project ID or URL-encoded path (e.g. \"123\" or \"group%2Fproject\")"),
      mergeRequestIid: z
        .number()
        .int()
        .positive()
        .describe("The merge request's internal ID (the number in its URL)"),
    },
  },
  async ({ projectId, mergeRequestIid }) => {
    try {
      const review = await reviewService.reviewMergeRequest(
        projectId,
        mergeRequestIid,
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(review, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return {
        isError: true,
        content: [
          {
            type: "text" as const,
            text: error?.message ?? "Failed to review merge request",
          },
        ],
      };
    }
  },
);

server.registerTool(
  "check_production_risk",
  {
    title: "Check GitLab merge request for known production-risk patterns",
    description:
      "Checks a GitLab merge request's diff against a small, curated set of production-risk " +
      "failure patterns, each grounded in a real, named postmortem (see PROJECT_BRIEF.md). " +
      "Returns one assessment per pattern with a confidence score and reasoning, or an explicit " +
      "abstain when the diff doesn't show clear evidence — this is not a general code review.",
    inputSchema: {
      projectId: z
        .string()
        .describe("GitLab project ID or URL-encoded path (e.g. \"123\" or \"group%2Fproject\")"),
      mergeRequestIid: z
        .number()
        .int()
        .positive()
        .describe("The merge request's internal ID (the number in its URL)"),
    },
  },
  async ({ projectId, mergeRequestIid }) => {
    try {
      const review = await productionRiskService.checkMergeRequest(
        projectId,
        mergeRequestIid,
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(review, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return {
        isError: true,
        content: [
          {
            type: "text" as const,
            text: error?.message ?? "Failed to check merge request for production risk",
          },
        ],
      };
    }
  },
);

server.registerTool(
  "post_production_risk_comment",
  {
    title: "Post production-risk findings as a GitLab MR comment",
    description:
      "Runs the same production-risk check as check_production_risk, then posts the results as " +
      "a single Markdown comment on the merge request via the GitLab API. This is always a " +
      "separate, explicit action from checking — nothing in this project posts automatically. " +
      "Only call this after you (or the person you're working with) have reviewed the findings " +
      "and decided the comment should actually be posted.",
    inputSchema: {
      projectId: z
        .string()
        .describe("GitLab project ID or URL-encoded path (e.g. \"123\" or \"group%2Fproject\")"),
      mergeRequestIid: z
        .number()
        .int()
        .positive()
        .describe("The merge request's internal ID (the number in its URL)"),
    },
  },
  async ({ projectId, mergeRequestIid }) => {
    try {
      const [review, patterns] = await Promise.all([
        productionRiskService.checkMergeRequest(projectId, mergeRequestIid),
        productionRiskService.loadPatterns(),
      ]);

      const comment = formatProductionRiskComment(review, patterns);

      const note = await gitlabService.createMergeRequestNote(
        projectId,
        mergeRequestIid,
        comment,
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { posted: true, noteId: note.id, createdAt: note.created_at, comment },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error: any) {
      return {
        isError: true,
        content: [
          {
            type: "text" as const,
            text: error?.message ?? "Failed to post production-risk comment",
          },
        ],
      };
    }
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("MCP server failed to start:", error);
  process.exit(1);
});
