import type { Request, Response, NextFunction } from "express";
import { AppError } from "../types/errors";

/**
 * Central error handler. Never leaks stack traces or internal messages
 * to the client for unexpected errors — only AppError messages (which are
 * authored to be safe to display) are sent as-is.
 */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ code: err.code, message: err.message });
    return;
  }

  if (err instanceof SyntaxError && "statusCode" in err) {
    res.status(400).json({ code: "INVALID_REQUEST", message: "Request body is not valid JSON." });
    return;
  }

  console.error("Unhandled error:", err);
  res.status(500).json({ code: "INTERNAL_ERROR", message: "An unexpected error occurred." });
}
