import { z } from "zod";

export const createReviewRequestSchema = z.object({
  repoPath: z.string().min(1, "repoPath is required"),
  baseBranch: z.string().min(1, "baseBranch is required"),
  reviewBranch: z.string().min(1, "reviewBranch is required"),
});

export type CreateReviewRequest = z.infer<typeof createReviewRequestSchema>;

export const findingSeveritySchema = z.enum(["critical", "high", "medium", "low"]);

export const findingCategorySchema = z.enum([
  "bug",
  "security",
  "performance",
  "maintainability",
  "documentation",
]);

export const findingSchema = z.object({
  severity: findingSeveritySchema,
  category: findingCategorySchema,
  file: z.string(),
  line: z.number().int().nullable(),
  title: z.string(),
  description: z.string(),
  suggestion: z.string(),
  confidence: z.number().min(0).max(1),
});

export const reviewResultSchema = z.object({
  summary: z.string(),
  findings: z.array(findingSchema),
});

export type ReviewResultParsed = z.infer<typeof reviewResultSchema>;
