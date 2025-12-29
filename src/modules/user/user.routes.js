import { Router } from 'express';
import { getContainer } from '../../container/index.js';
import { authenticate } from '../../middlewares/auth.middleware.js';

const router = Router();

const execute = (action) => (req, res, next) => {
  const container = getContainer();
  const controller = container.resolve('userController');
  return controller[action](req, res, next);
};
router.get('/', authenticate, execute('getProfile'));
router.put('/', authenticate, execute('updateProfile'));
router.put('/password', authenticate, execute('changePassword'));

export default router;

