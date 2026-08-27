import { Router } from "express";
import { reviewRoutes } from "./reviewRoutes";
import gitlabreviewRoutes from "./review.routes";
import gitlabRoutes from "./gitlab.routes";

export const apiRouter = Router();

apiRouter.use(reviewRoutes);
apiRouter.use(
    "/gitlab",
    gitlabRoutes,
);
apiRouter.use(
    "/gitlab-reviews",
    gitlabreviewRoutes,
);
apiRouter.get(
    "/health",
    (req, res) => {
        res.json({ status: "OK" });
    }
);
