import type { GitService } from "../git/GitService";
import { env } from "../config/env";

/**
 * Repository tools available to the reviewer/agent.
 *
 * These are the ONLY way the LLM (or its orchestrating service) may touch
 * the filesystem or Git history. Each tool is scoped to a single opened
 * GitService instance, which already constrains all paths to the target
 * repository root. There is no generic "run shell command" tool, and none
 * of these tools can mutate the repository.
 *
 * TODO(sandboxing): before production, run tool execution in a restricted
 * sandbox (e.g. separate worker/container with read-only bind mount) rather
 * than relying solely on in-process path validation.
 */

const BLOCKED_FILE_PATTERNS = [/^\.env(\..*)?$/i, /\.pem$/i, /\.key$/i];

function isBlockedFile(relativePath: string): boolean {
  const basename = relativePath.split(/[/\\]/).pop() ?? relativePath;
  return BLOCKED_FILE_PATTERNS.some((pattern) => pattern.test(basename));
}

export interface RepositoryTools {
  read_file(filePath: string): string;
  search_code(query: string): Array<{ file: string; line: number; text: string }>;
  list_files(dirPath?: string): string[];
  get_git_diff(): string;
}

export function createRepositoryTools(git: GitService, diff: string): RepositoryTools {
  return {
    read_file(filePath: string): string {
      if (isBlockedFile(filePath)) {
        return "[blocked: this file is excluded from review context]";
      }
      const content = git.readFile(filePath);
      if (content === null) {
        return `[file not found: ${filePath}]`;
      }
      return content.length > env.maxFileReadChars
        ? `${content.slice(0, env.maxFileReadChars)}\n[...truncated...]`
        : content;
    },

    search_code(query: string): Array<{ file: string; line: number; text: string }> {
      if (!query.trim()) return [];
      const results: Array<{ file: string; line: number; text: string }> = [];
      const needle = query.toLowerCase();

      const walk = (dir: string) => {
        for (const entry of git.listFiles(dir)) {
          if (results.length >= 50) return;
          const entryPath = dir === "." ? entry : `${dir}/${entry}`;
          if (entry.endsWith("/")) {
            if (entry === "node_modules/" || entry === ".git/") continue;
            walk(entryPath.replace(/\/$/, ""));
            continue;
          }
          if (isBlockedFile(entryPath)) continue;
          const content = git.readFile(entryPath);
          if (content === null) continue;
          const lines = content.split("\n");
          lines.forEach((line, index) => {
            if (results.length >= 50) return;
            if (line.toLowerCase().includes(needle)) {
              results.push({ file: entryPath, line: index + 1, text: line.trim() });
            }
          });
        }
      };

      walk(".");
      return results;
    },

    list_files(dirPath = "."): string[] {
      return git.listFiles(dirPath);
    },

    get_git_diff(): string {
      return diff;
    },
  };
}
