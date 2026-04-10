import { Router } from "express";
import { scopePerRequest } from "../../middlewares/di.middleware.js";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { validateBody } from "../../middlewares/validate.middleware.js";
import { addBankSchema, verifyBankSchema } from "./bankAccount.validation.js";

const router = Router();
router.use(scopePerRequest);

const execute = (action) => (req, res, next) => {
    try {
        const controller = req.scope.resolve("bankAccountController");
        return controller[action](req, res, next);
    } catch (error) {
        next(error);
    }
};

router.post(
    "/",
    authenticate,
    validateBody(addBankSchema),
    execute("addBankAccount")
);

router.post(
    "/:id/verify",
    authenticate,
    validateBody(verifyBankSchema),
    execute("verifyBankAccount")
);

router.get(
    "/",
    authenticate,
    execute("getMyAccounts")
);

router.delete(
    "/:id",
    authenticate,
    execute("deprecateAccount")
);

export default router;