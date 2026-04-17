import { Router } from "express";
import { scopePerRequest } from "../../middlewares/di.middleware.js";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { validateQuery } from "../../middlewares/validate.middleware.js";
import { walletHistoryQuerySchema } from "./wallet.validation.js";

const router = Router();
router.use(scopePerRequest);

const execute = (action) => (req, res, next) => {
    try {
        const controller = req.scope.resolve("walletController");
        return controller[action](req, res, next);
    } catch (error) {
        next(error);
    }
};

router.get(
    "/me",
    authenticate,
    execute("getMyWallet")
);

router.get(
    "/history",
    authenticate,
    validateQuery(walletHistoryQuerySchema),
    execute("getWalletHistory")
);

export default router;