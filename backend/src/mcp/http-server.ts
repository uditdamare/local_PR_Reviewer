import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import type { Request, Response } from "express";

import { GitLabService } from "../services/gitlab.service";
import { LLMService } from "../services/llm.service";
import { ReviewService } from "../services/review.service";
import { ProductionRiskService } from "../services/production-risk.service";
import { registerProductionRiskTools } from "./register-tools";
import { formatErrorForLog } from "../utils/format-error";

// Remote, Streamable-HTTP entry point — for adding this MCP server to
// Claude Code/Desktop as a remote connector (`claude mcp add ... --header
// "Authorization: Bearer <token>"`), instead of spawning the stdio server
// locally. Deliberately holds NO GitLab token itself: every request must
// carry its own `Authorization: Bearer <gitlab-token>` header, used to
// build a fresh GitLabService for that request only. Nothing is cached or
// written to disk — a token present in one request's memory is gone once
// that request finishes. This is why GITLAB_TOKEN is optional in env.ts:
// this server never reads it.
//
// Stateless by design (sessionIdGenerator: undefined) — each request gets
// its own McpServer + transport, torn down when the response closes. No
// per-session state to manage, which also means no server-side risk of one
// user's token leaking into another user's session.

const PORT = Number.parseInt(process.env.HTTP_PORT ?? "8080", 10);
const HOST = process.env.HTTP_HOST ?? "0.0.0.0";
const ALLOWED_HOSTS = process.env.ALLOWED_HOSTS?.split(",").map((h) => h.trim());

function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;

  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1]!.trim() : null;
}

function buildServer(gitlabToken: string): McpServer {
  const gitlabService = new GitLabService(gitlabToken);
  const llmService = new LLMService();
  const reviewService = new ReviewService(gitlabService, llmService);
  const productionRiskService = new ProductionRiskService(gitlabService, llmService);

  const server = new McpServer({
    name: "pr-reviewer",
    version: "0.1.0",
  });

  registerProductionRiskTools(server, { gitlabService, reviewService, productionRiskService });

  return server;
}

const app = createMcpExpressApp({
  host: HOST,
  ...(ALLOWED_HOSTS ? { allowedHosts: ALLOWED_HOSTS } : {}),
});

app.post("/mcp", async (req: Request, res: Response) => {
  const token = extractBearerToken(req);

  if (!token) {
    res.status(401).json({
      jsonrpc: "2.0",
      error: {
        code: -32001,
        message:
          "Missing or malformed Authorization header. Expected: Authorization: Bearer <gitlab-token>",
      },
      id: null,
    });
    return;
  }

  try {
    const server = buildServer(token);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);

    res.on("close", () => {
      transport.close();
      server.close();
    });
  } catch (error) {
    console.error(`Error handling MCP request: ${formatErrorForLog(error)}`);

    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

app.listen(PORT, HOST, () => {
  console.log(`pr-reviewer remote MCP server listening on http://${HOST}:${PORT}/mcp`);
});
