import { Router } from 'express';
import { getContainer } from '../../container/index.js';
import { authenticate } from '../../middlewares/auth.middleware.js';

const router = Router();

const execute = (action) => (req, res, next) => {
  const container = getContainer();
  const controller = container.resolve('projectController');
  return controller[action](req, res, next);
};

// Public routes
router.get('/', execute('getProjects'));

// Protected routes (require authentication) - Must be before /:id
router.get('/my', authenticate, execute('getMyProjects'));
router.post('/', authenticate, execute('createProject'));

// Routes with params - Must be after specific routes
router.get('/:id', execute('getProjectById'));
router.put('/:id', authenticate, execute('updateProject'));
router.delete('/:id', authenticate, execute('deleteProject'));

export default router;
