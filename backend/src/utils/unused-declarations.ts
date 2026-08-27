import ts from "typescript";

export interface UnusedDeclaration {
  name: string;
  line: number;
}

function getScriptKind(filePath: string): ts.ScriptKind | undefined {
  const dotIndex = filePath.lastIndexOf(".");
  const ext = dotIndex === -1 ? "" : filePath.slice(dotIndex).toLowerCase();

  switch (ext) {
    case ".js":
    case ".jsx":
      // Allow JSX in .js too — plenty of Next.js/React code uses it.
      return ts.ScriptKind.JSX;
    case ".ts":
      return ts.ScriptKind.TS;
    case ".tsx":
      return ts.ScriptKind.TSX;
    default:
      return undefined;
  }
}

function isExported(statement: ts.VariableStatement): boolean {
  return (
    ts.canHaveModifiers(statement) &&
    (ts.getModifiers(statement) ?? []).some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
    )
  );
}

/**
 * Deterministic, single-file "declared but never referenced again in this
 * file" check for local const/let variables and imports. Intentionally
 * narrow in scope (no destructuring, no exports, no function params) to
 * keep false-positive risk low — the goal is replacing the exact class of
 * mistake an LLM makes when it can't see the whole file, not a full linter.
 */
export function findUnusedDeclarations(
  filePath: string,
  content: string,
): UnusedDeclaration[] {
  const scriptKind = getScriptKind(filePath);
  if (!scriptKind) {
    return [];
  }

  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  );

  const identifierCounts = new Map<string, number>();
  const candidates: Array<{ name: string; line: number }> = [];
  let hasJsx = false;

  const lineOf = (node: ts.Node): number =>
    sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line +
    1;

  function visit(node: ts.Node): void {
    if (
      ts.isJsxElement(node) ||
      ts.isJsxSelfClosingElement(node) ||
      ts.isJsxFragment(node)
    ) {
      hasJsx = true;
    }

    if (ts.isIdentifier(node)) {
      identifierCounts.set(
        node.text,
        (identifierCounts.get(node.text) ?? 0) + 1,
      );
    }

    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      ts.isVariableDeclarationList(node.parent) &&
      (node.parent.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const)) !== 0 &&
      ts.isVariableStatement(node.parent.parent) &&
      !isExported(node.parent.parent)
    ) {
      candidates.push({ name: node.name.text, line: lineOf(node.name) });
    }

    if (ts.isImportClause(node) && node.name) {
      candidates.push({ name: node.name.text, line: lineOf(node.name) });
    }

    if (ts.isNamespaceImport(node)) {
      candidates.push({ name: node.name.text, line: lineOf(node.name) });
    }

    if (ts.isImportSpecifier(node)) {
      candidates.push({ name: node.name.text, line: lineOf(node.name) });
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return candidates.filter((candidate) => {
    // The classic JSX transform implicitly uses `React` (React.createElement)
    // for every JSX element without ever writing the identifier — a default
    // `import React from "react"` alongside any JSX is never really unused.
    if (hasJsx && candidate.name === "React") {
      return false;
    }

    return (identifierCounts.get(candidate.name) ?? 0) <= 1;
  });
}
