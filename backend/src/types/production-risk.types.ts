// One assessment per curated failure pattern, per PROJECT_BRIEF.md's
// checklist item: "diff + patterns in, structured JSON out (pattern,
// confidence, reasoning, or abstain)". The model is required to return one
// of these for every pattern it was shown — not just the ones it flags —
// so an omission can't silently pass as "no risk found".
export interface PatternAssessment {
  patternId: string;
  abstain: boolean;
  // Required when abstain is false, null when abstaining — the model isn't
  // asked to invent a confidence number for a pattern it isn't reporting.
  confidence: number | null;
  reasoning: string;
  file: string | null;
  line: number | null;
  // True when the model reported a finding (abstain: false) but its
  // confidence fell below the configured threshold, so this was converted
  // to an abstain server-side — distinct from the model abstaining on its
  // own. Always false when abstain is false.
  belowThreshold: boolean;
}

export interface ProductionRiskReview {
  assessments: PatternAssessment[];
  batchesRun: number;
  patternsChecked: number;
  confidenceThreshold: number;
}
