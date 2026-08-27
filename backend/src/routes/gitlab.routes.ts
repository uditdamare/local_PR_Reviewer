import {
  Router,
  Request,
  Response,
} from "express";

import { GitLabService } from "../services/gitlab.service";

const router = Router();

const gitlabService =
  new GitLabService();
// GET /api/gitlab/<project-id>/<mr-iid>
router.get(
  "/:projectId/:mrIid",
  async (
    req: Request,
    res: Response,
  ) => {

    try {
      const projectId =
        req.params.projectId;

      if (!projectId) {
        return res.status(400).json({
          error: "Invalid project ID",
        });
      }

      const mrIid =
        Number(req.params.mrIid);

      if (Number.isNaN(mrIid)) {
        return res.status(400).json({
          error: "Invalid merge request IID",
        });
      }

      const mergeRequest =
        await gitlabService.getMergeRequest(
          projectId,
          mrIid,
        );

      return res.json({
        id: mergeRequest.id,

        iid: mergeRequest.iid,

        title: mergeRequest.title,

        description:
          mergeRequest.description,

        sourceBranch:
          mergeRequest.source_branch,

        targetBranch:
          mergeRequest.target_branch,

        author:
          mergeRequest.author,

        url:
          mergeRequest.web_url,
      });

    } catch (error: any) {

      console.error(
        error.response?.data || error,
      );

      return res.status(500).json({
        error:
          "Failed to fetch GitLab merge request",
      });
    }
  },
);

export default router;