import axios, {
  AxiosInstance,
  isAxiosError,
} from "axios";

import { env } from "../config/env";
import { formatErrorForLog } from "../utils/format-error";

function isRetryableStatus(status: number | undefined): boolean {
  // 429 (rate limited) and 5xx (including the transient 503 "overloaded"
  // Gemini returns fairly often) are worth retrying. Anything else — 400
  // (bad request), 401/403 (auth), 404 (bad model name) — won't succeed on
  // retry, so fail immediately instead of burning attempts.
  return status === 429 || (status !== undefined && status >= 500);
}

function isRetryableError(error: unknown): boolean {
  if (!isAxiosError(error)) {
    return false;
  }

  // No response at all (network error, timeout) is also worth a retry.
  return error.response === undefined || isRetryableStatus(error.response.status);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class LLMService {
  private readonly client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: env.llm.baseUrl,

      headers: {
        Authorization: `Bearer ${env.llm.apiKey}`,
        "Content-Type": "application/json",
      },

      timeout: env.llm.requestTimeoutMs,
    });
  }

  async generate(
    systemPrompt: string,
    userPrompt: string,
  ): Promise<string> {
    const totalAttempts = env.llm.maxRetries + 1;
    let lastError: unknown;

    for (let attempt = 1; attempt <= totalAttempts; attempt++) {
      try {
        const response = await this.client.post("/chat/completions", {
          model: env.llm.model,

          messages: [
            {
              role: "system",
              content: systemPrompt,
            },
            {
              role: "user",
              content: userPrompt,
            },
          ],

          temperature: 0.1,
        });

        return response.data.choices[0].message.content;
      } catch (error) {
        lastError = error;

        const isLastAttempt = attempt === totalAttempts;

        if (isLastAttempt || !isRetryableError(error)) {
          throw error;
        }

        // Exponential backoff with jitter, so a batch of concurrent calls
        // hitting the same transient outage don't all retry in lockstep.
        const delayMs =
          env.llm.retryBaseDelayMs * 2 ** (attempt - 1) + Math.random() * 250;

        console.warn(
          `LLM call failed (attempt ${attempt}/${totalAttempts}, ${formatErrorForLog(error)}) — retrying in ${Math.round(delayMs)}ms`,
        );

        await sleep(delayMs);
      }
    }

    // Unreachable — the loop always either returns or throws — but keeps
    // TypeScript satisfied that every path returns/throws.
    throw lastError;
  }
}
