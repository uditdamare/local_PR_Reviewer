import { Router } from "express";
import { reviewRoutes } from "./reviewRoutes";
import gitlabreviewRoutes from "./review.routes";
import gitlabRoutes from "./gitlab.routes";
import productionRiskRoutes from "./production-risk.routes";
import adminRoutes from "./admin.routes";

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
apiRouter.use(
    "/production-risk-reviews",
    productionRiskRoutes,
);
apiRouter.use(
    "/admin",
    adminRoutes,
);
apiRouter.get(
    "/health",
    (req, res) => {
        res.json({ status: "OK" });
    }
);
