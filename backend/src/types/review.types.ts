import { GitLabDiff, GitLabMergeRequest } from "./gitlab.types";

export interface ReviewContext {
    mergeRequest: {
        title: string;
        description: string | null;

        sourceBranch: string;
        targetBranch: string;

        url: string;
    };

    guidelines: string[];

    diffs: GitLabDiff[];

    relevantFiles: {
        path: string;
        content: string;
    }[];
}

export type ReviewSeverity =
    | "CRITICAL"
    | "HIGH"
    | "MEDIUM"
    | "LOW"
    | "INFO";

export type ReviewCategory =
    | "SECURITY"
    | "BUG"
    | "PERFORMANCE"
    | "ARCHITECTURE"
    | "CODE_QUALITY"
    | "DOCUMENTATION"
    | "TESTING";

export interface ReviewFinding {
    severity: ReviewSeverity;

    category: ReviewCategory;

    file: string;

    line?: number;

    title: string;

    explanation: string;

    suggestion?: string;
}

export interface DocumentationItem {
    file: string;

    reason: string;
}

export interface CodeReview {
    summary: string;

    findings: ReviewFinding[];

    documentationNeeded: DocumentationItem[];
}