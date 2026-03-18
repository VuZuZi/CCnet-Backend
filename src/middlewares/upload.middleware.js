import multer from 'multer';
import AppError from '../core/AppError.js';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import fsPromises from 'fs/promises';

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, os.tmpdir());
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = crypto.randomBytes(16).toString('hex');
    cb(null, `${Date.now()}-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const ALLOWED_MIME_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword'
];

const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new AppError(`Định dạng file không hợp lệ: ${file.mimetype}. Chỉ cho phép Ảnh, PDF và Word.`, 400), false);
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
  limits: { fileSize: 2 * 1024 * 1024, files: 1 }
});

export const uploadCover = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 }
});

export const uploadFiles = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 10 * 1024 * 1024, files: 10 }
});

const MAGIC_BYTES = {
  'ffd8ffe0': 'image/jpeg',
  'ffd8ffe1': 'image/jpeg',
  'ffd8ffe2': 'image/jpeg',
  'ffd8ffee': 'image/jpeg',
  '89504e47': 'image/png',
  '52494646': 'image/webp',
  '47494638': 'image/gif',
  '25504446': 'application/pdf',
  '504b0304': 'application/msword'
};

const checkMagicBytes = async (filePath) => {
  let fileHandle;
  try {
    const buffer = Buffer.alloc(4);
    fileHandle = await fsPromises.open(filePath, 'r');
    await fileHandle.read(buffer, 0, 4, 0);

    const hex = buffer.toString('hex').toLowerCase();

    if (hex === '52494646') {
      const webpBuffer = Buffer.alloc(4);
      await fileHandle.read(webpBuffer, 0, 4, 8);
      if (webpBuffer.toString() !== 'WEBP') return false;
      return true;
    }

    return Object.keys(MAGIC_BYTES).some(signature => hex.startsWith(signature));
  } catch (error) {
    console.error('[CTO Security] Lỗi đọc Magic Bytes:', error.message);
    return false;
  } finally {
    if (fileHandle) await fileHandle.close();
  }
};

export const validateMagicBytes = async (req, res, next) => {
  const filesToCheck = [];

  if (req.file) filesToCheck.push(req.file);
  if (req.files) {
    if (Array.isArray(req.files)) {
      filesToCheck.push(...req.files);
    } else {
      Object.values(req.files).forEach(fileArray => filesToCheck.push(...fileArray));
    }
  }

  if (filesToCheck.length === 0) return next();

  try {
    for (const file of filesToCheck) {
      const isValid = await checkMagicBytes(file.path);
      if (!isValid) {
        await Promise.allSettled(filesToCheck.map(f => fsPromises.unlink(f.path)));
        return next(new AppError(`[Security Block] Cảnh báo: Định dạng file ${file.originalname} bị làm giả!`, 403));
      }
    }
    next();
  } catch (err) {
    next(err);
  }
};