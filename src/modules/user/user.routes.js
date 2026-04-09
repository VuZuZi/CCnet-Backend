import { Router } from "express";
import { getContainer } from "../../container/index.js";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { validate, validateBody } from "../../middlewares/validate.middleware.js";
import { z } from "zod";
import reportController from "../report/report.controller.js";
import {
  uploadAvatar,
  uploadCover,
} from "../../middlewares/upload.middleware.js";
import {
  updateProfileSchema,
  changePasswordSchema,
} from "./user.validation.js";

const router = Router();

const execute = (action) => (req, res, next) => {
  const container = getContainer();
  const controller = container.resolve("userController");
  return controller[action](req, res, next);
};

router.get("/", authenticate, execute("getProfile"));
router.get("/suggested", authenticate, execute("getSuggestedUsers"));
router.put(
  "/",
  authenticate,
  validate(updateProfileSchema),
  execute("updateProfile"),
);

router.put(
  "/password",
  authenticate,
  validate(changePasswordSchema),
  execute("changePassword"),
);

router.put(
  "/avatar",
  authenticate,
  uploadAvatar.single("avatar"),
  execute("changeAvatar"),
);

router.put(
  "/cover",
  authenticate,
  uploadCover.single("coverPhoto"),
  execute("changeCoverPhoto"),
);

const reportUserSchema = z.object({
  reason_code: z.enum([
    'spam',
    'harassment',
    'inappropriate',
    'violence',
    'hate_speech',
    'other',
  ]),
  description: z.string().max(1000).optional(),
});

router.get("/:id", authenticate, execute("getPublicProfile"));

router.post(
  "/:id/report",
  authenticate,
  validateBody(reportUserSchema),
  (req, res, next) => {
    req.body.target_ref = req.params.id;
    req.body.target_type = "user";
    return reportController.createReport(req, res, next);
  },
);

export default router;
