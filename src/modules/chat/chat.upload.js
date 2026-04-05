import fs from 'fs';
import multer from 'multer';
import path from 'path';

const uploadDir = path.resolve(process.cwd(), 'uploads');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '');
    const baseName = path
      .basename(file.originalname || 'file', ext)
      .replace(/[^a-zA-Z0-9-_]/g, '_')
      .slice(0, 60);

    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${baseName}-${unique}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    files: 20,
    fileSize: 15 * 1024 * 1024,
  },
});

export const groupAvatarUpload = upload.single('groupAvatar');

export const messageUpload = upload.fields([
  { name: 'attachments', maxCount: 20 },
  { name: 'files', maxCount: 20 },
]);

export { uploadDir };