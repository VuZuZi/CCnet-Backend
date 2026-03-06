import { Router } from 'express';
import { getContainer } from '../../container/index.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { upload } from '../../middlewares/upload.middleware.js'; 

const router = Router();

const execute = (action) => (req, res, next) => {
  const container = getContainer();
  const controller = container.resolve('mediaController'); 
  return controller[action](req, res, next);
};

router.post(
    '/upload', 
    authenticate, 
    upload.single('file'), 
    execute('upload')
);

export default router;