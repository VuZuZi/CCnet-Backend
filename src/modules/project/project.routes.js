import { Router } from 'express';
import { getContainer } from '../../container/index.js';
import { authenticate } from '../../middlewares/auth.middleware.js';

const router = Router();

const execute = (action) => (req, res, next) => {
  const container = getContainer();
  const controller = container.resolve('projectController');
  return controller[action](req, res, next);
};

// GET /api/v1/projects - Get projects overview with filters
router.get('/', authenticate, execute('getOverview'));

export default router;
