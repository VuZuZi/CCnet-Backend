import multer from 'multer';
import AppError from '../core/AppError.js';

const storage = multer.memoryStorage();
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new AppError('Invalid file type. Only JPG, PNG, WEBP and GIF are allowed.', 400), false);
  }
};

export const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024, files: 5 }
});

export const uploadAvatar = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { 
    fileSize: 2 * 1024 * 1024, 
    files: 1 
  }
});

export const uploadCover = multer({
  storage: storage, 
  fileFilter: fileFilter,
  limits: { 
    fileSize: 5 * 1024 * 1024, 
    files: 1 
  }
});