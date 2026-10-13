import express from "express";
import cors from "cors";
import { env } from "./config/env";
import { apiRouter } from "./routes";
import { errorHandler } from "./middleware/errorHandler";
import { randomBytes } from "node:crypto";
import { renderDashboardPage } from "./admin/dashboard-page";

const app = express();

app.use(cors());
app.use(express.json({ limit: "5mb" }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Project-token dashboard. The page itself holds no secrets, but it is only
// served to this machine; every API call it makes is gated by ADMIN_TOKEN in
// routes/admin.routes.ts. Strict per-request-nonce CSP, no framing, no caching.
app.get("/admin", (req, res) => {
  const remote = req.socket.remoteAddress ?? "";

  if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(remote)) {
    res.status(403).send("The dashboard is only available from the machine it runs on.");
    return;
  }

  const nonce = randomBytes(16).toString("base64");

  res.set({
    "Content-Security-Policy":
      `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; ` +
      "connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.type("html").send(renderDashboardPage(nonce));
});

app.use("/api", apiRouter);

app.use(errorHandler);

const server = app.listen(env.port, () => {
  console.log(`PR Reviewer backend listening on http://localhost:${env.port}`);
});

// Multi-batch LLM reviews can run long on constrained hardware — match
// Node's own request/header timeouts to the LLM request timeout so a slow
// review isn't killed mid-flight by the framework itself.
server.requestTimeout = env.llm.requestTimeoutMs;
server.headersTimeout = env.llm.requestTimeoutMs;
