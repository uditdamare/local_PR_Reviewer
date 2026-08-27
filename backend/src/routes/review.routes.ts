import {
  Router,
  Request,
  Response,
} from "express";

import { GitLabService } from "../services/gitlab.service";
import { LLMService } from "../services/llm.service";
import { ReviewService } from "../services/review.service";

const router = Router();

const gitlabService =
  new GitLabService();

const llmService =
  new LLMService();

const reviewService =
  new ReviewService(
    gitlabService,
    llmService,
  );

router.post(
  "/",
  async (
    req: Request,
    res: Response,
  ) => {

    try {

      const {
        projectId,
        mergeRequestIid,
      } = req.body;

      if (!projectId) {
        return res.status(400).json({
          error: "projectId is required",
        });
      }

      if (!mergeRequestIid) {
        return res.status(400).json({
          error:
            "mergeRequestIid is required",
        });
      }

      const review =
        await reviewService.reviewMergeRequest(
          projectId,
          Number(mergeRequestIid),
        );

      return res.json(review);

    } catch (error: any) {

      console.error(error);

      return res.status(500).json({
        error:
          error.message ||
          "Failed to review merge request",
      });
    }
  },
);

export default router;