import { createHash, timingSafeEqual } from "node:crypto";
import { Router, NextFunction, Request, Response } from "express";

import { env } from "../config/env";
import { ProjectTokenError, projectTokenService } from "../services/project-token.service";
import { formatErrorForLog } from "../utils/format-error";

const router = Router();

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

// Gate for everything under /api/admin: the dashboard manages credentials, so
// it must be explicitly enabled (ADMIN_TOKEN), reachable only from this
// machine, and authenticated on every request.
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!env.adminToken) {
    res.status(503).json({
      error: "The dashboard is disabled. Set ADMIN_TOKEN in backend/.env and restart the backend to enable it.",
    });
    return;
  }

  if (!LOOPBACK.has(req.socket.remoteAddress ?? "")) {
    res.status(403).json({ error: "The dashboard is only available from the machine it runs on." });
    return;
  }

  // Hash both sides so the comparison is constant-time regardless of length.
  const supplied = digest(req.header("x-admin-token") ?? "");

  if (!timingSafeEqual(supplied, digest(env.adminToken))) {
    res.status(401).json({ error: "Wrong or missing admin token." });
    return;
  }

  next();
}

function handleError(res: Response, error: unknown): void {
  if (error instanceof ProjectTokenError) {
    res.status(error.statusCode).json({ error: error.message });
    return;
  }

  console.error(`Admin API error: ${formatErrorForLog(error)}`);
  res.status(500).json({ error: "Unexpected error." });
}

router.use(requireAdmin);

router.get("/project-tokens", async (_req, res) => {
  try {
    res.json({
      encryptionConfigured: Boolean(env.tokenEncryptionKey),
      tokens: await projectTokenService.list(),
    });
  } catch (error) {
    handleError(res, error);
  }
});

router.post("/project-tokens", async (req, res) => {
  if (!env.tokenEncryptionKey) {
    res.status(503).json({
      error: "TOKEN_ENCRYPTION_KEY is not set, so tokens can't be stored. Generate one with `openssl rand -base64 32`.",
    });
    return;
  }

  const { project, token } = req.body ?? {};

  if (typeof project !== "string" || typeof token !== "string") {
    res.status(400).json({ error: "Both `project` and `token` are required strings." });
    return;
  }

  try {
    res.status(201).json(await projectTokenService.add(project, token));
  } catch (error) {
    handleError(res, error);
  }
});

router.post("/project-tokens/:id/test", async (req, res) => {
  try {
    res.json(await projectTokenService.test(Number(req.params.id)));
  } catch (error) {
    handleError(res, error);
  }
});

router.delete("/project-tokens/:id", async (req, res) => {
  try {
    await projectTokenService.remove(Number(req.params.id));
    res.status(204).end();
  } catch (error) {
    handleError(res, error);
  }
});

export default router;
