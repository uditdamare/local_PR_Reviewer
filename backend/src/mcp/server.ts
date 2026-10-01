import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { GitLabService } from "../services/gitlab.service";
import { LLMService } from "../services/llm.service";
import { ReviewService } from "../services/review.service";
import { ProductionRiskService } from "../services/production-risk.service";
import { registerProductionRiskTools } from "./register-tools";

// Local, stdio-transport entry point (Claude Code/Desktop spawn this as a
// subprocess). Uses env.gitlab.token — GITLAB_TOKEN must be set in
// backend/.env for this one. For the remote, multi-user-safe HTTP entry
// point that never holds a token server-side, see http-server.ts.
const gitlabService = new GitLabService();
const llmService = new LLMService();
const reviewService = new ReviewService(gitlabService, llmService);
const productionRiskService = new ProductionRiskService(gitlabService, llmService);

const server = new McpServer({
  name: "pr-reviewer",
  version: "0.1.0",
});

registerProductionRiskTools(server, { gitlabService, reviewService, productionRiskService });

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("MCP server failed to start:", error);
  process.exit(1);
});
