import { Router } from 'express';
import { authenticate, authorize } from '../../middlewares/auth.middleware.js';
import { scopePerRequest } from '../../middlewares/di.middleware.js';
import { validateBody, validateParams, validateQuery } from '../../middlewares/validate.middleware.js';
import {
    createEvidenceSchema,
    reviewEvidenceSchema,
    evidenceParamsSchema,
    getPublicEvidenceSchema,
    listEvidenceQuerySchema,
    patchEvidenceSchema,
    adminListEvidenceQuerySchema
} from './milestone-evidence.validation.js';

const router = Router();
router.use(scopePerRequest);

const execute = (action) => (req, res, next) => {
    const controller = req.scope.resolve('milestoneEvidenceController');
    return controller[action](req, res, next);
};

router.get(
    '/public/:projectId/:milestoneId',
    validateParams(getPublicEvidenceSchema),
    execute('getPublicEvidence')
);

router.get(
    '/my-evidence',
    authenticate,
    authorize('Organizer'),
    validateQuery(listEvidenceQuerySchema),
    execute('getMyEvidence')
);

router.get(
    '/admin/list',
    authenticate,
    authorize('admin', 'manager'),
    validateQuery(adminListEvidenceQuerySchema),
    execute('getAdminEvidenceList')
);

router.get(
    '/:id',
    authenticate,
    authorize('Organizer', 'admin', 'manager'),
    validateParams(evidenceParamsSchema),
    execute('getEvidenceDetail')
);

router.post(
    '/',
    authenticate,
    authorize('Organizer'),
    validateBody(createEvidenceSchema),
    execute('submitEvidence')
);

router.patch(
    '/:id/review',
    authenticate,
    authorize('admin', 'manager'),
    validateParams(evidenceParamsSchema),
    validateBody(reviewEvidenceSchema),
    execute('reviewEvidence')
);

router.patch(
    '/:id',
    authenticate,
    authorize('Organizer'),
    validateParams(evidenceParamsSchema),
    validateBody(patchEvidenceSchema),
    execute('patchEvidence')
);

export default router;
