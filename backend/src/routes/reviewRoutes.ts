import { Router } from "express";
import { createReview, getReviewById } from "../controllers/reviewController";

export const reviewRoutes = Router();

reviewRoutes.post("/reviews", createReview);
reviewRoutes.get("/reviews/:id", getReviewById);
