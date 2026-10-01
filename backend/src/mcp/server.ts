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
    title: "Check GitLab merge request for known production-risk patterns (automated LLM path)",
    description:
      "Checks a GitLab merge request's diff against a small, curated set of production-risk " +
      "failure patterns, each grounded in a real, named postmortem (see PROJECT_BRIEF.md). " +
      "Returns one assessment per pattern with a confidence score and reasoning, or an explicit " +
      "abstain when the diff doesn't show clear evidence — this is not a general code review. " +
      "REQUIRES a working, credited LLM provider configured as LLM_BASE_URL/LLM_MODEL/LLM_API_KEY " +
      "in the backend's environment — it makes a real API call to that provider and will fail " +
      "(or burn quota/credits) without one. If you're not certain that's configured and working, " +
      "use prepare_production_risk_check + finalize_production_risk_check instead — same output " +
      "shape, same validation, but you (the calling agent) do the reasoning yourself at no extra " +
      "cost. That pair is the recommended default for this deployment specifically, since no LLM " +
      "API credits are provisioned here.",
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

const AGENT_ASSESSMENT_SHAPE = {
  patternId: z.string(),
  abstain: z.boolean(),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .nullable()
    .describe("Required when abstain is false; must be null when abstain is true."),
  reasoning: z.string(),
  file: z.string().nullable(),
  line: z.number().int().nullable(),
};

server.registerTool(
  "prepare_production_risk_check",
  {
    title: "RECOMMENDED: start a production-risk check here (agent reasons, no LLM API key needed)",
    description:
      "The recommended first step for checking a GitLab merge request against this project's " +
      "curated production-risk failure patterns — use this by default, not check_production_risk, " +
      "unless you already know this deployment has a working, credited LLM provider configured " +
      "(it usually doesn't). Fetches the merge request's diff and the curated failure-pattern set " +
      "from GitLab and Postgres, and returns the exact prompt/instructions an LLM would otherwise " +
      "be sent — but makes no LLM call itself, so it costs nothing beyond the tool call. " +
      "YOU (the agent calling this tool, whichever AI system you are) must then: read the " +
      "returned `instructions` and `prompt`, reason over the diff against every pattern id listed " +
      "exactly as the instructions describe (evidence-grounded, abstain when unsure, never invent " +
      "a pattern outside the given list), then call finalize_production_risk_check with your own " +
      "`assessments` array. That second call re-validates your output the same way an LLM's " +
      "response would be validated — unknown pattern ids dropped, line numbers checked against " +
      "the real diff, low confidence downgraded to abstain — so your reasoning is trusted no more " +
      "than a hosted model's would be.",
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
      const prepared = await productionRiskService.prepareCheck(
        projectId,
        mergeRequestIid,
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                instructions: prepared.systemPrompt,
                prompt: prepared.prompt,
                patternIds: prepared.patterns.map((pattern) => pattern.id),
              },
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
            text: error?.message ?? "Failed to prepare production-risk check",
          },
        ],
      };
    }
  },
);

server.registerTool(
  "finalize_production_risk_check",
  {
    title: "Validate and finalize agent-reasoned production-risk assessments",
    description:
      "Takes the assessments array you (the agent) produced after calling " +
      "prepare_production_risk_check yourself, and runs it through the same validation the " +
      "automated path applies to an LLM's response: pattern ids outside the curated set are " +
      "dropped, line numbers are checked against the real diff hunks, and confidence below the " +
      "configured threshold is converted to an abstain. Your self-reported confidence is trusted " +
      "no more than a hosted model's would be. Returns the same JSON shape as check_production_risk.",
    inputSchema: {
      projectId: z
        .string()
        .describe("GitLab project ID or URL-encoded path (e.g. \"123\" or \"group%2Fproject\")"),
      mergeRequestIid: z
        .number()
        .int()
        .positive()
        .describe("The merge request's internal ID (the number in its URL)"),
      assessments: z
        .array(z.object(AGENT_ASSESSMENT_SHAPE))
        .describe(
          "One entry per pattern id from prepare_production_risk_check's response — exactly " +
            "the same contract that prompt asked an LLM to follow.",
        ),
    },
  },
  async ({ projectId, mergeRequestIid, assessments }) => {
    try {
      const review = await productionRiskService.finalizeAgentAssessments(
        projectId,
        mergeRequestIid,
        assessments,
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
            text: error?.message ?? "Failed to finalize production-risk assessments",
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
      "Posts production-risk findings as a single Markdown comment on the merge request via the " +
      "GitLab API. Pass the `assessments` array from finalize_production_risk_check (the " +
      "recommended path, since this deployment has no LLM API credits) to post them directly " +
      "with no LLM call involved. Omitting `assessments` falls back to running the fully " +
      "automated check_production_risk internally, which requires a working, credited LLM " +
      "provider — only rely on that fallback if you know one is configured. Either way this is " +
      "always a separate, explicit action from checking — nothing in this project posts " +
      "automatically. Only call this after you (or the person you're working with) have reviewed " +
      "the findings and decided the comment should actually be posted.",
    inputSchema: {
      projectId: z
        .string()
        .describe("GitLab project ID or URL-encoded path (e.g. \"123\" or \"group%2Fproject\")"),
      mergeRequestIid: z
        .number()
        .int()
        .positive()
        .describe("The merge request's internal ID (the number in its URL)"),
      assessments: z
        .array(z.object(AGENT_ASSESSMENT_SHAPE))
        .optional()
        .describe(
          "Optional — the already-finalized assessments from finalize_production_risk_check. " +
            "When omitted, this tool runs the automated LLM-based check itself.",
        ),
    },
  },
  async ({ projectId, mergeRequestIid, assessments }) => {
    try {
      const [review, patterns] = await Promise.all([
        assessments
          ? productionRiskService.finalizeAgentAssessments(
              projectId,
              mergeRequestIid,
              assessments,
            )
          : productionRiskService.checkMergeRequest(projectId, mergeRequestIid),
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
