import { isAxiosError } from "axios";

/**
 * Formats an error for logging. Deliberately never touches error.config or
 * error.request — an Axios error's config.headers carries the raw
 * Authorization bearer token (LLM_API_KEY / GITLAB_TOKEN), and a plain
 * `console.error(error)` on the error object prints it into logs in full.
 * Only status, message, and the response body (never request headers) are
 * included here.
 */
export function formatErrorForLog(error: unknown): string {
  if (isAxiosError(error)) {
    const status = error.response?.status;
    const body = error.response?.data;

    return (
      `AxiosError${status !== undefined ? ` (status ${status})` : ""}: ${error.message}` +
      (body !== undefined ? ` — response body: ${safeStringify(body)}` : "")
    );
  }

  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }

  return String(error);
}

function safeStringify(data: unknown): string {
  try {
    return JSON.stringify(data);
  } catch {
    return "(unserializable response body)";
  }
}
