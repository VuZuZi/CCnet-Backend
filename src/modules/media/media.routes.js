import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { upload, validateMagicBytes } from '../../middlewares/upload.middleware.js'; 
import { autoCleanupTempFiles } from '../../middlewares/cleanup.middleware.js';
import { scopePerRequest } from '../../middlewares/di.middleware.js';

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

router.get(
    '/signature',
    authenticate,
    execute('getSignature')
);

export default router;