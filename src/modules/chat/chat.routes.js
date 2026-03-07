import { Router } from 'express';
import multer from 'multer';
import { getContainer } from '../../container/index.js';
import { authenticate } from '../../middlewares/auth.middleware.js';

const router = Router();
const upload = multer({ dest: 'uploads/' });

const execute = (action) => (req, res, next) => {
  const container = getContainer();
  const controller = container.resolve('chatController');
  return controller[action](req, res, next);
};

router.get('/conversations', authenticate, execute('getConversations'));
router.post('/conversations', authenticate, execute('createConversation'));

router.get('/messages/:id', authenticate, execute('getMessages'));
router.post('/messages', authenticate, upload.array('attachments', 10), execute('sendMessage'));
router.patch('/read/:id', authenticate, execute('markAsRead'));
router.get('/files/:filename', authenticate, execute('downloadFile'));

export default router;
