export type AppErrorCode =
  | "INVALID_REQUEST"
  | "REPO_NOT_FOUND"
  | "NOT_A_GIT_REPO"
  | "BRANCH_NOT_FOUND"
  | "GIT_OPERATION_FAILED"
  | "LLM_UNAVAILABLE"
  | "LLM_RESPONSE_INVALID"
  | "REVIEW_NOT_FOUND"
  | "INTERNAL_ERROR";

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly statusCode: number;

  constructor(code: AppErrorCode, message: string, statusCode = 400) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.name = "AppError";
  }
}
