export interface LineRange {
  start: number;
  end: number;
}

const HUNK_HEADER_RE = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm;

/**
 * Parses a unified diff's hunk headers to determine which new-file line
 * numbers actually appear in the diff. Used to catch LLM-hallucinated line
 * numbers — small models are unreliable at counting through a hunk to map
 * it to an absolute line number.
 */
export function getNewFileLineRanges(diffText: string): LineRange[] {
  const ranges: LineRange[] = [];
  const re = new RegExp(HUNK_HEADER_RE);
  let match: RegExpExecArray | null;

  while ((match = re.exec(diffText)) !== null) {
    const newStart = Number.parseInt(match[1]!, 10);
    const newLines = match[2] !== undefined ? Number.parseInt(match[2], 10) : 1;

    if (newLines > 0) {
      ranges.push({ start: newStart, end: newStart + newLines - 1 });
    }
  }

  return ranges;
}

export function isLineWithinRanges(
  line: number,
  ranges: LineRange[],
): boolean {
  return ranges.some((range) => line >= range.start && line <= range.end);
}
