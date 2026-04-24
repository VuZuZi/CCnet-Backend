import { Router } from 'express';
import { validateBody } from '../../middlewares/validate.middleware.js';
import { testChatSchema } from './ai.validation.js';
import { authenticate, authorize } from '../../middlewares/auth.middleware.js';
import { scopePerRequest } from '../../middlewares/di.middleware.js';

const router = Router();

router.use(scopePerRequest);

const invoke = (methodName) => (req, res, next) => {
    return req.scope.resolve('aiController')[methodName](req, res, next);
};

router.get('/health', invoke('checkHealth'));

router.post('/test-chat', validateBody(testChatSchema), invoke('testChat'));

router.get('/models', invoke('getAvailableModels'));

export default router;