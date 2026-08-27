import { ReviewContext } from "../types/review.types";

export function buildReviewPrompt(
  context: ReviewContext,
): string {
  const guidelines =
    context.guidelines.length > 0
      ? context.guidelines.join("\n\n")
      : "No project-specific guidelines were provided.";

  const diffs = context.diffs
    .map(
      (diff) => `
FILE: ${diff.new_path}

\`\`\`diff
${diff.diff}
\`\`\`
`,
    )
    .join("\n");

  const relevantFiles =
    context.relevantFiles.length > 0
      ? context.relevantFiles
          .map(
            (file) => `
FILE: ${file.path}

\`\`\`
${file.content}
\`\`\`
`,
          )
          .join("\n")
      : "No additional repository files were provided.";

  return `
Review the following GitLab Merge Request.

## Merge Request

Title:
${context.mergeRequest.title}

Description:
${context.mergeRequest.description || "No description"}

Source branch:
${context.mergeRequest.sourceBranch}

Target branch:
${context.mergeRequest.targetBranch}


## Project Guidelines

${guidelines}


## Changed Code

${diffs}


## Relevant Repository Files

${relevantFiles}


## Review Requirements

Review the changes for:

1. Bugs
2. Security vulnerabilities
3. Input validation problems
4. Performance issues
5. Architecture violations
6. Code quality problems
7. Missing tests
8. Missing documentation
9. Violations of project-specific guidelines

Only report issues that are reasonably supported by the provided code/context.

For every issue provide:

- severity
- category
- file
- line if identifiable
- title
- explanation
- suggested fix

Also identify functions/classes that should have documentation because their behavior would otherwise be difficult for a future AI agent or developer to understand.

Return ONLY valid JSON using this structure:

{
  "summary": "string",
  "findings": [
    {
      "severity": "CRITICAL | HIGH | MEDIUM | LOW | INFO",
      "category": "SECURITY | BUG | PERFORMANCE | ARCHITECTURE | CODE_QUALITY | DOCUMENTATION | TESTING",
      "file": "string",
      "line": 123,
      "title": "string",
      "explanation": "string",
      "suggestion": "string"
    }
  ],
  "documentationNeeded": [
    {
      "file": "string",
      "reason": "string"
    }
  ]
}
`;
}