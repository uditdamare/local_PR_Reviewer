import express from "express";
import cors from "cors";
import { env } from "./config/env";
import { apiRouter } from "./routes";
import { errorHandler } from "./middleware/errorHandler";

const app = express();

app.use(cors());
app.use(express.json({ limit: "5mb" }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
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
