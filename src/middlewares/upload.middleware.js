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

const IMAGE_MIME_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif'
];

const DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword'
];

const FEED_VIDEO_MIME_TYPES = [
  'video/mp4', 'video/webm', 'video/quicktime'
];

const ALLOWED_MIME_TYPES = [
  ...IMAGE_MIME_TYPES,
  ...DOCUMENT_MIME_TYPES
];

const ALLOWED_MEDIA_TYPES = [
  ...IMAGE_MIME_TYPES,
  ...FEED_VIDEO_MIME_TYPES
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

// Media upload (images and videos) for feed posts
const mediaFileFilter = (req, file, cb) => {
  if (ALLOWED_MEDIA_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new AppError(`Định dạng file không hợp lệ: ${file.mimetype}. Chỉ cho phép ảnh JPEG, PNG, WEBP, GIF hoặc video MP4, WEBM, MOV.`, 400), false);
  }
};

export const uploadMedia = multer({
  storage: storage,
  fileFilter: mediaFileFilter,
  limits: { fileSize: 50 * 1024 * 1024, files: 1 }
});

const detectMagicMimeTypes = async (filePath) => {
  let fileHandle;
  try {
    const buffer = Buffer.alloc(64);
    fileHandle = await fsPromises.open(filePath, 'r');
    const { bytesRead } = await fileHandle.read(buffer, 0, 64, 0);
    const header = buffer.subarray(0, bytesRead);
    const hex = header.toString('hex').toLowerCase();

    if (hex.startsWith('ffd8ff')) return ['image/jpeg'];
    if (hex.startsWith('89504e470d0a1a0a')) return ['image/png'];
    if (header.subarray(0, 6).toString('ascii') === 'GIF87a') return ['image/gif'];
    if (header.subarray(0, 6).toString('ascii') === 'GIF89a') return ['image/gif'];
    if (
      header.subarray(0, 4).toString('ascii') === 'RIFF' &&
      header.subarray(8, 12).toString('ascii') === 'WEBP'
    ) {
      return ['image/webp'];
    }
    if (header.subarray(0, 4).toString('ascii') === '%PDF') {
      return ['application/pdf'];
    }
    if (hex.startsWith('504b0304')) {
      return [
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword'
      ];
    }
    if (hex.startsWith('d0cf11e0')) return ['application/msword'];
    if (header.indexOf(Buffer.from('ftyp')) >= 4) {
      return ['video/mp4', 'video/quicktime'];
    }
    if (['moov', 'mdat', 'wide', 'free', 'skip'].includes(
      header.subarray(4, 8).toString('ascii')
    )) {
      return ['video/mp4', 'video/quicktime'];
    }
    if (hex.startsWith('1a45dfa3')) return ['video/webm'];

    return [];
  } catch (error) {
    console.error('[CTO Security] Lỗi đọc Magic Bytes:', error.message);
    return [];
  } finally {
    if (fileHandle) await fileHandle.close();
  }
};

const checkMagicBytes = async (file) => {
  const detectedMimeTypes = await detectMagicMimeTypes(file.path);
  return detectedMimeTypes.includes(file.mimetype);
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
      const isValid = await checkMagicBytes(file);
      if (!isValid) {
        await Promise.allSettled(filesToCheck.map(f => fsPromises.unlink(f.path)));
        return next(new AppError(`Định dạng file ${file.originalname} không khớp nội dung thực tế. Vui lòng chọn ảnh hoặc video hợp lệ.`, 415));
      }
    }
    next();
  } catch (err) {
    next(err);
  }
};
