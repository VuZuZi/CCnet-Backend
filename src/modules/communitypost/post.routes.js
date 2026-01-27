import { Router } from 'express';
import { getContainer } from '../../container/index.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { upload } from '../../middlewares/upload.middleware.js';
import { optionalAuthenticate } from '../../middlewares/optionalAuth.middleware.js';

const router = Router();

const execute = (action) => (req, res, next) => {
  const container = getContainer();
  const controller = container.resolve('postController'); 
  return controller[action](req, res, next);
};

router.get('/', optionalAuthenticate, execute('getNewsFeed'));
router.get('/:id', optionalAuthenticate, execute('getPostById'));
router.get('/:id/comments', optionalAuthenticate, execute('getComments'));
router.post(
    '/', 
    authenticate, 
    upload.array('images', 5), 
    execute('createPost')
);
router.delete('/:id', authenticate, execute('deletePost'));
router.post('/:id/reaction', authenticate, execute('toggleReaction'));
router.post('/:id/comments', authenticate, execute('addComment'));
router.post('/:id/report', authenticate, execute('reportPost'));

export default router;