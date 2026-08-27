import ts from "typescript";

const EXTENSION_JSX: Record<string, boolean> = {
  ".js": false,
  ".jsx": true,
  ".ts": false,
  ".tsx": true,
};

function getExtension(filePath: string): string {
  const dotIndex = filePath.lastIndexOf(".");
  return dotIndex === -1 ? "" : filePath.slice(dotIndex).toLowerCase();
}

export function isSyntaxCheckable(filePath: string): boolean {
  return getExtension(filePath) in EXTENSION_JSX;
}

export interface SyntaxIssue {
  message: string;
  line?: number;
}

/**
 * Deterministic syntax check via the TypeScript parser — catches things
 * (unbalanced braces, broken statements) that an LLM can miss or hallucinate
 * about, independent of model quality.
 */
export function checkSyntax(
  filePath: string,
  content: string,
): SyntaxIssue[] {
  const useJsx = EXTENSION_JSX[getExtension(filePath)];
  if (useJsx === undefined) {
    return [];
  }

  const { diagnostics } = ts.transpileModule(content, {
    compilerOptions: {
      allowJs: true,
      target: ts.ScriptTarget.Latest,
      ...(useJsx ? { jsx: ts.JsxEmit.Preserve } : {}),
    },
    reportDiagnostics: true,
    fileName: filePath,
  });

  if (!diagnostics || diagnostics.length === 0) {
    return [];
  }

  return diagnostics.map((diagnostic) => {
    const message = ts.flattenDiagnosticMessageText(
      diagnostic.messageText,
      "\n",
    );

    let line: number | undefined;
    if (diagnostic.file && diagnostic.start !== undefined) {
      line =
        diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
          .line + 1;
    }

    return { message, line };
  });
}
