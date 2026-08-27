import fs from "node:fs";
import path from "node:path";
import { simpleGit, type SimpleGit } from "simple-git";
import { AppError } from "../types/errors";
import type { ChangedFile, ChangedFileStatus } from "../types/review";

/**
 * All Git access for a review is isolated behind this service.
 * Callers never pass raw shell input — only a validated repo path and
 * branch names that are checked against `git branch --list` before use.
 */
export class GitService {
  private readonly repoPath: string;
  private readonly git: SimpleGit;

  private constructor(repoPath: string) {
    this.repoPath = repoPath;
    this.git = simpleGit({ baseDir: repoPath });
  }

  static async open(repoPath: string): Promise<GitService> {
    const resolved = path.resolve(repoPath);

    if (!fs.existsSync(resolved)) {
      throw new AppError("REPO_NOT_FOUND", `Repository path does not exist: ${resolved}`, 404);
    }

    if (!fs.statSync(resolved).isDirectory()) {
      throw new AppError("REPO_NOT_FOUND", `Repository path is not a directory: ${resolved}`, 400);
    }

    const service = new GitService(resolved);

    const isRepo = await service.git.checkIsRepo().catch(() => false);
    if (!isRepo) {
      throw new AppError("NOT_A_GIT_REPO", `Path is not a Git repository: ${resolved}`, 400);
    }

    return service;
  }

  get root(): string {
    return this.repoPath;
  }

  async listBranches(): Promise<string[]> {
    const summary = await this.git.branch(["-a"]).catch((err: Error) => {
      throw new AppError("GIT_OPERATION_FAILED", `Failed to list branches: ${err.message}`, 500);
    });
    return summary.all.map((name) => name.replace(/^remotes\/[^/]+\//, ""));
  }

  async assertBranchExists(branchName: string): Promise<void> {
    const branches = await this.listBranches();
    if (!branches.includes(branchName)) {
      throw new AppError(
        "BRANCH_NOT_FOUND",
        `Branch "${branchName}" was not found in this repository`,
        404,
      );
    }
  }

  async resolveCommit(branchName: string): Promise<string> {
    const hash = await this.git.revparse([branchName]).catch((err: Error) => {
      throw new AppError(
        "GIT_OPERATION_FAILED",
        `Failed to resolve commit for "${branchName}": ${err.message}`,
        500,
      );
    });
    return hash.trim();
  }

  async diff(baseBranch: string, reviewBranch: string): Promise<string> {
    return this.git.diff([`${baseBranch}...${reviewBranch}`]).catch((err: Error) => {
      throw new AppError("GIT_OPERATION_FAILED", `Failed to generate diff: ${err.message}`, 500);
    });
  }

  async changedFiles(baseBranch: string, reviewBranch: string): Promise<ChangedFile[]> {
    const summary = await this.git
      .diffSummary([`${baseBranch}...${reviewBranch}`])
      .catch((err: Error) => {
        throw new AppError(
          "GIT_OPERATION_FAILED",
          `Failed to summarize changed files: ${err.message}`,
          500,
        );
      });

    return summary.files.map((file) => {
      const insertions = "insertions" in file ? file.insertions : 0;
      const deletions = "deletions" in file ? file.deletions : 0;
      const status: ChangedFileStatus = file.binary
        ? "modified"
        : insertions > 0 && deletions === 0
          ? "added"
          : insertions === 0 && deletions > 0
            ? "deleted"
            : "modified";

      return { path: file.file, status, insertions, deletions };
    });
  }

  /**
   * Reads a file's contents at a given ref, constrained to this repository.
   * Returns null if the file does not exist at that ref (e.g. it was deleted).
   */
  async readFileAtRef(ref: string, filePath: string): Promise<string | null> {
    const safeRelativePath = this.assertPathWithinRepo(filePath);
    try {
      return await this.git.show([`${ref}:${safeRelativePath}`]);
    } catch {
      return null;
    }
  }

  /**
   * Reads a file's current working-tree contents, constrained to this repository.
   * TODO(sandboxing): before production use, run this inside a restricted
   * filesystem sandbox / container rather than trusting path validation alone.
   */
  readFile(filePath: string): string | null {
    const safeRelativePath = this.assertPathWithinRepo(filePath);
    const fullPath = path.join(this.repoPath, safeRelativePath);
    if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
      return null;
    }
    return fs.readFileSync(fullPath, "utf-8");
  }

  listFiles(relativeDir = "."): string[] {
    const safeRelativePath = this.assertPathWithinRepo(relativeDir);
    const fullPath = path.join(this.repoPath, safeRelativePath);
    if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isDirectory()) {
      return [];
    }
    return fs
      .readdirSync(fullPath, { withFileTypes: true })
      .filter((entry) => entry.name !== ".git" && entry.name !== "node_modules")
      .map((entry) => (entry.isDirectory() ? `${entry.name}/` : entry.name));
  }

  /**
   * Ensures a client/LLM-supplied relative path cannot escape the repository
   * root (no `..` traversal, no absolute paths pointing elsewhere).
   */
  private assertPathWithinRepo(relativePath: string): string {
    const normalized = path.normalize(relativePath).replace(/^([/\\])+/, "");
    const resolved = path.resolve(this.repoPath, normalized);
    if (!resolved.startsWith(this.repoPath)) {
      throw new AppError("INVALID_REQUEST", `Path escapes repository root: ${relativePath}`, 400);
    }
    return normalized;
  }
}
