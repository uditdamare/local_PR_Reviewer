import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { GitLabService } from "../services/gitlab.service";
import { LLMService } from "../services/llm.service";
import { ReviewService } from "../services/review.service";

// Scaffolding only: this wires the MCP transport to the existing GitLab MR
// review pipeline (general findings — bugs/security/performance/etc). It
// does NOT yet implement the production-risk-pattern-matching, confidence
// scoring, or abstain logic described in PROJECT_BRIEF.md — that's the next
// layer to build on top of this tool's handler.
const gitlabService = new GitLabService();
const llmService = new LLMService();
const reviewService = new ReviewService(gitlabService, llmService);

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

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("MCP server failed to start:", error);
  process.exit(1);
});
