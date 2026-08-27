import fs from "node:fs";
import path from "node:path";
import { env } from "../config/env";
import { AppError } from "../types/errors";
import type { ReviewResult } from "../types/review";
import { reviewResultSchema } from "../schemas/review.schemas";
import type { CodeReviewer, ReviewPromptContext } from "./CodeReviewer";

const SYSTEM_PROMPT_PATH = path.join(__dirname, "../../../prompts/system-reviewer.md");

function loadSystemPrompt(): string {
  try {
    return fs.readFileSync(SYSTEM_PROMPT_PATH, "utf-8");
  } catch {
    return "You are a senior software engineer performing a pull request code review.";
  }
}

/**
 * Extracts a JSON object from a model response that may contain
 * surrounding prose, markdown code fences, or minor trailing noise.
 */
function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return raw.slice(start, end + 1);
  }
  return raw.trim();
}

interface OllamaGenerateResponse {
  response: string;
}

export class OllamaCodeReviewer implements CodeReviewer {
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly systemPrompt: string;

  constructor(baseUrl: string = env.ollamaBaseUrl, model: string = env.ollamaModel) {
    this.baseUrl = baseUrl;
    this.model = model;
    this.systemPrompt = loadSystemPrompt();
  }

  async review(context: ReviewPromptContext): Promise<ReviewResult> {
    const prompt = this.buildPrompt(context);

    const raw = await this.callOllama(prompt);
    return this.parseResult(raw);
  }

  private buildPrompt(context: ReviewPromptContext): string {
    const guidelinesSection = context.guidelines
      ? `## Repository Guidelines (.ai-review/guidelines.md)\n\n${context.guidelines}`
      : "## Repository Guidelines\n\nNo repository-specific guidelines were found (.ai-review/guidelines.md is absent). Continue with general best practices.";

    // TODO(agentic-tools): V1 pre-fetches diff + changed-file contents up
    // front rather than letting the model call tools interactively via
    // Ollama's function-calling API. The RepositoryTools passed on `context`
    // are already available for a future iteration that upgrades this to a
    // true tool-calling loop (see reviewOrchestrator.ts).
    const fileExcerpts = context.changedFiles
      .slice(0, env.maxFilesRead)
      .map((file) => {
        const content = context.tools.read_file(file);
        return `### ${file}\n\`\`\`\n${content}\n\`\`\``;
      })
      .join("\n\n");

    const truncatedDiff =
      context.diff.length > env.maxDiffChars
        ? `${context.diff.slice(0, env.maxDiffChars)}\n[...diff truncated...]`
        : context.diff;

    return [
      `# Pull Request Review Request`,
      `Repository: ${context.repositoryPath}`,
      `Base branch: ${context.baseBranch}`,
      `Review branch: ${context.reviewBranch}`,
      ``,
      guidelinesSection,
      ``,
      `## Diff (base...review)`,
      "```diff",
      truncatedDiff,
      "```",
      ``,
      `## Changed File Contents (current state on review branch)`,
      fileExcerpts || "(no readable file contents available)",
      ``,
      `## Output Instructions`,
      `Respond with ONLY a single JSON object matching the required schema. Do not include markdown fences or commentary outside the JSON.`,
    ].join("\n");
  }

  private async callOllama(prompt: string): Promise<string> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          system: this.systemPrompt,
          prompt,
          stream: false,
          format: "json",
        }),
      });
    } catch (err) {
      throw new AppError(
        "LLM_UNAVAILABLE",
        `Could not reach Ollama at ${this.baseUrl}: ${(err as Error).message}`,
        503,
      );
    }

    if (!response.ok) {
      throw new AppError(
        "LLM_UNAVAILABLE",
        `Ollama returned an error (status ${response.status})`,
        503,
      );
    }

    const body = (await response.json()) as OllamaGenerateResponse;
    return body.response;
  }

  private parseResult(raw: string): ReviewResult {
    const jsonCandidate = extractJson(raw);

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(jsonCandidate);
    } catch {
      throw new AppError(
        "LLM_RESPONSE_INVALID",
        "The model returned a response that could not be parsed as JSON.",
        502,
      );
    }

    const validated = reviewResultSchema.safeParse(parsedJson);
    if (!validated.success) {
      throw new AppError(
        "LLM_RESPONSE_INVALID",
        `The model response did not match the expected review schema: ${validated.error.message}`,
        502,
      );
    }

    return validated.data;
  }
}
