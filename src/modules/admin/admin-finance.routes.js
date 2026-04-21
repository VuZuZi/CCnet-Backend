import { Router } from 'express';
import { authenticate, authorize } from '../../middlewares/auth.middleware.js';
import { scopePerRequest } from '../../middlewares/di.middleware.js';
import { validateQuery, validateParams } from '../../middlewares/validate.middleware.js';
import { getFinancialSummaryQuerySchema, getFinancialDetailParamsSchema } from './admin-finance.validation.js';

const router = Router();
router.use(scopePerRequest);

const execute = (action) => (req, res, next) => {
    const controller = req.scope.resolve('adminFinanceController');
    return controller[action](req, res, next);
};

router.get(
    '/summary',
    authenticate,
    authorize('admin', 'manager'),
    validateQuery(getFinancialSummaryQuerySchema),
    execute('getSummary')
);

router.get(
    '/:projectId/detail',
    authenticate,
    authorize('admin', 'manager'),
    validateParams(getFinancialDetailParamsSchema),
    execute('getDetail')
);

export default router;