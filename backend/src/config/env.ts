import "dotenv/config";

function readInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const env = {
  port: readInt("PORT", 4000),
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434",
  ollamaModel: process.env.OLLAMA_MODEL ?? "qwen3-coder",
  maxFilesRead: readInt("MAX_FILES_READ", 15),
  maxFileReadChars: readInt("MAX_FILE_READ_CHARS", 20000),
  maxDiffChars: readInt("MAX_DIFF_CHARS", 60000),
  gitlab: {
    url: requiredEnv("GITLAB_URL"),
    token: requiredEnv("GITLAB_TOKEN"),
  },
  // Any OpenAI-compatible chat-completions provider: local Ollama, Gemini's
  // OpenAI-compat endpoint, etc. The base URL is used exactly as given
  // (must already include whatever path prefix the provider needs, e.g.
  // Ollama's "/v1" or Gemini's "/v1beta/openai") — no provider-specific
  // normalization.
  llm: {
    baseUrl: process.env.LLM_BASE_URL ?? "http://localhost:11434/v1",
    apiKey: process.env.LLM_API_KEY ?? "ollama",
    model: process.env.LLM_MODEL ?? "qwen2.5-coder:0.5b",
    requestTimeoutMs: readInt("LLM_REQUEST_TIMEOUT_MS", 30 * 60 * 1000),
  },
  reviewBatchMaxDiffChars: readInt("REVIEW_BATCH_MAX_DIFF_CHARS", 6000),
  reviewRelevantFileMaxChars: readInt("REVIEW_RELEVANT_FILE_MAX_CHARS", 3000),
};

function requiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}