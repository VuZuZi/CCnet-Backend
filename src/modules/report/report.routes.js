import express from "express";
const router = express.Router();

import { authMiddleware } from "../../middlewares/auth.middleware.js";
import reportController from "./report.controller.js";

router.post("/report", authMiddleware, reportController.createReport);

export default router;
