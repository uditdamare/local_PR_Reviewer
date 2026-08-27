import type { ApiError, CreateReviewInput, ReviewRecord } from "@/types/review";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiRequestError extends Error {
  readonly code: string;

  constructor(apiError: ApiError) {
    super(apiError.message);
    this.code = apiError.code;
    this.name = "ApiRequestError";
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const apiError: ApiError = body ?? { code: "UNKNOWN", message: "Request failed" };
    throw new ApiRequestError(apiError);
  }
  return body as T;
}

/**
 * Typed client for the PR Reviewer backend. All HTTP calls from the
 * frontend go through this module — components never call fetch directly.
 */
export const api = {
  async createReview(input: CreateReviewInput): Promise<{ reviewId: string; status: string }> {
    const response = await fetch(`${API_URL}/api/reviews`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    return handleResponse(response);
  },

  async getReview(id: string): Promise<ReviewRecord> {
    const response = await fetch(`${API_URL}/api/reviews/${id}`);
    return handleResponse(response);
  },
};
