import { Router } from "express";
import { getContainer } from "../../container/index.js";
import { authenticate } from "../../middlewares/auth.middleware.js";

const router = Router();

const execute = (action) => async (req, res, next) => {
  try {
    const container = getContainer();
    const controller = container.resolve("searchController");

    if (!controller || typeof controller[action] !== "function") {
      throw new Error(`searchController.${action} is not available`);
    }

    return controller[action](req, res, next);
  } catch (error) {
    next(error);
  }
};

router.get("/", authenticate, execute("globalSearch"));
router.post(
  "/community-posts/:postId/view",
  authenticate,
  execute("markCommunityPostViewed")
);

export default router;