import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { upload, validateMagicBytes } from '../../middlewares/upload.middleware.js';
import { autoCleanupTempFiles } from '../../middlewares/cleanup.middleware.js';
import { scopePerRequest } from '../../middlewares/di.middleware.js';
import { validateBody, validateParams } from '../../middlewares/validate.middleware.js';
import { syncMediaSchema, deleteMediaSchema } from './media.validation.js';

const router = Router();

router.use(scopePerRequest);

const execute = (action) => (req, res, next) => {
    if (!req.scope) throw new Error('[CTO Config] Bắt buộc phải có req.scope.');
    const controller = req.scope.resolve('mediaController');
    return controller[action](req, res, next);
};

router.post(
    '/upload',
    authenticate,
    upload.single('file'),
    autoCleanupTempFiles,
    validateMagicBytes,
    execute('upload')
);

router.post(
    '/upload-smart',
    authenticate,
    upload.single('file'),
    autoCleanupTempFiles,
    validateMagicBytes,
    execute('uploadSmart')
);

router.get(
    '/signature',
    authenticate,
    execute('getSignature')
);

router.post(
    '/sync',
    authenticate,
    validateBody(syncMediaSchema),
    execute('syncMedia')
);

router.delete(
    '/:id',
    authenticate,
    validateParams(deleteMediaSchema),
    execute('deleteMedia')
);

export default router;