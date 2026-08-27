import type { GitService } from "../git/GitService";

const GUIDELINES_PATH = ".ai-review/guidelines.md";

/**
 * Loads repository-specific review context (e.g. .ai-review/guidelines.md).
 *
 * Future context files (architecture.md, security.md, context/*) should be
 * added as additional loader functions here rather than expanding this one,
 * so each context source stays independently testable and optional.
 */
export class RepositoryContextService {
  static loadGuidelines(git: GitService): string | null {
    return git.readFile(GUIDELINES_PATH);
  }
}
