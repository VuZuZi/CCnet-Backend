import { Router } from 'express';
import { getContainer } from '../../container/index.js';
import { authenticate } from '../../middlewares/auth.middleware.js';

const router = Router();

const execute = (action) => (req, res, next) => {
  const container = getContainer();
  const controller = container.resolve('followController');
  return controller[action](req, res, next);
};

router.get('/following', authenticate, execute('getMyFollowing'));

router.post('/users/:id', authenticate, execute('followUser'));
router.delete('/users/:id', authenticate, execute('unfollowUser'));
router.get('/users/:id/status', authenticate, execute('statusUser'));
router.get('/users/:id/stats', authenticate, execute('statsUser'));

export default router;
