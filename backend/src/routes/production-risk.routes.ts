import {
  Router,
  Request,
  Response,
} from "express";

import { GitLabService } from "../services/gitlab.service";
import { LLMService } from "../services/llm.service";
import { ProductionRiskService } from "../services/production-risk.service";
import { formatErrorForLog } from "../utils/format-error";

const router = Router();

const gitlabService = new GitLabService();
const llmService = new LLMService();
const productionRiskService = new ProductionRiskService(gitlabService, llmService);

// GET, not POST — checking a diff has no side effects (unlike posting a
// GitLab comment), so a plain URL with query params works and can be
// opened directly in a browser: /api/production-risk-reviews?projectId=82&mergeRequestIid=1142
router.get(
  "/",
  async (
    req: Request,
    res: Response,
  ) => {
    try {
      const { projectId, mergeRequestIid } = req.query;

      if (typeof projectId !== "string") {
        return res.status(400).json({
          error: "projectId query param is required",
        });
      }

      if (typeof mergeRequestIid !== "string" || !/^\d+$/.test(mergeRequestIid)) {
        return res.status(400).json({
          error: "mergeRequestIid query param is required and must be a number",
        });
      }

      const review = await productionRiskService.checkMergeRequest(
        projectId,
        Number(mergeRequestIid),
      );

      return res.json(review);
    } catch (error: any) {
      console.error(formatErrorForLog(error));

      return res.status(500).json({
        error: error.message || "Failed to check merge request for production risk",
      });
    }
  },
);

export default router;
