import type { RepositoryTools } from "../tools/repositoryTools";
import type { ReviewResult } from "../types/review";

export interface ReviewPromptContext {
  repositoryPath: string;
  baseBranch: string;
  reviewBranch: string;
  diff: string;
  changedFiles: string[];
  guidelines: string | null;
  tools: RepositoryTools;
}

/**
 * Abstraction over any LLM capable of producing a structured code review.
 * V1 ships a single implementation (OllamaCodeReviewer) but nothing outside
 * this interface should know that Ollama is involved, so the provider can
 * be swapped without touching routes/controllers/services.
 */
export interface CodeReviewer {
  review(context: ReviewPromptContext): Promise<ReviewResult>;
}
