export interface SecretMatch {
  pattern: string;
  severity: "CRITICAL" | "MEDIUM";
  line: number;
}

interface SecretPattern {
  name: string;
  severity: "CRITICAL" | "MEDIUM";
  regex: RegExp;
}

// Fixed-format token patterns only — deliberately no generic
// "password/secret/api_key = <string>" pattern, since that's the most
// false-positive-prone shape (placeholders, examples, unrelated variables).
const SECRET_PATTERNS: SecretPattern[] = [
  {
    name: "AWS Access Key ID",
    severity: "CRITICAL",
    regex: /AKIA[0-9A-Z]{16}/,
  },
  {
    name: "GitHub token",
    severity: "CRITICAL",
    regex: /gh[opusr]_[A-Za-z0-9]{36,}/,
  },
  {
    name: "GitLab personal access token",
    severity: "CRITICAL",
    regex: /glpat-[A-Za-z0-9_-]{20,}/,
  },
  {
    name: "Slack token",
    severity: "CRITICAL",
    regex: /xox[baprs]-[A-Za-z0-9-]{10,}/,
  },
  {
    name: "Private key block",
    severity: "CRITICAL",
    regex: /-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/,
  },
  {
    name: "Hardcoded personal file path (Windows)",
    severity: "MEDIUM",
    regex: /[A-Za-z]:\\Users\\[^\\"'\r\n]+\\/,
  },
  {
    name: "Hardcoded personal file path (Unix)",
    severity: "MEDIUM",
    regex: /\/home\/[^/"'\r\n]+\//,
  },
];

/**
 * Deterministic pattern-based secret/credential scan — catches the exact
 * class of finding an LLM sometimes gets right by luck (e.g. a hardcoded
 * key path) reliably instead of probabilistically, and without echoing
 * the matched secret back into the finding.
 */
export function scanForSecrets(content: string): SecretMatch[] {
  const matches: SecretMatch[] = [];
  const lines = content.split("\n");

  lines.forEach((lineText, index) => {
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.regex.test(lineText)) {
        matches.push({
          pattern: pattern.name,
          severity: pattern.severity,
          line: index + 1,
        });
      }
    }
  });

  return matches;
}
