import path from "path";
import AppError from "../../core/AppError.js";

export const CHAT_UPLOAD_LIMITS = {
  maxFiles: 10,
  maxImageSizeBytes: 10 * 1024 * 1024,
  maxVideoSizeBytes: 20 * 1024 * 1024,
  maxFileSizeBytes: 25 * 1024 * 1024,
  maxGroupAvatarSizeBytes: 5 * 1024 * 1024,
};

export const CHAT_CLOUDINARY_FOLDERS = {
  attachments: "ccnet/chat/attachments",
  groupAvatars: "ccnet/chat/group-avatars",
};

export const CHAT_UPLOAD_ALLOWED_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "bmp",
  "svg",
  "mp4",
  "webm",
  "mov",
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "txt",
  "zip",
  "rar",
]);

export const CHAT_UPLOAD_ALLOWED_MIME_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "application/zip",
  "application/x-zip-compressed",
  "application/x-rar-compressed",
  "application/vnd.rar",
]);

export function getFileExtension(filename = "") {
  return path.extname(String(filename || "")).replace(".", "").toLowerCase();
}

export function isImageMimeType(mimetype = "") {
  return String(mimetype || "").toLowerCase().startsWith("image/");
}

export function isVideoMimeType(mimetype = "") {
  return String(mimetype || "").toLowerCase().startsWith("video/");
}

export function isAllowedChatUploadFile(file) {
  const extension = getFileExtension(file?.originalname || file?.filename || "");
  const mimeType = String(file?.mimetype || "").toLowerCase();

  if (isImageMimeType(mimeType) || isVideoMimeType(mimeType)) {
    return true;
  }

  return (
    CHAT_UPLOAD_ALLOWED_EXTENSIONS.has(extension) ||
    CHAT_UPLOAD_ALLOWED_MIME_TYPES.has(mimeType)
  );
}

export function assertAllowedChatUploadFile(file) {
  if (!isAllowedChatUploadFile(file)) {
    throw new AppError(
      `File "${file?.originalname || "unknown"}" is not a supported format`,
      400
    );
  }
}

export function assertValidChatUploadFiles(files = []) {
  const safeFiles = Array.isArray(files) ? files : [];

  if (safeFiles.length > CHAT_UPLOAD_LIMITS.maxFiles) {
    throw new AppError(
      `You can upload a maximum of ${CHAT_UPLOAD_LIMITS.maxFiles} files per message`,
      400
    );
  }

  safeFiles.forEach((file) => {
    assertAllowedChatUploadFile(file);

    if (
      isImageMimeType(file?.mimetype) &&
      Number(file?.size || 0) > CHAT_UPLOAD_LIMITS.maxImageSizeBytes
    ) {
      throw new AppError(
        `Image "${file.originalname}" exceeds ${Math.floor(
          CHAT_UPLOAD_LIMITS.maxImageSizeBytes / (1024 * 1024)
        )}MB`,
        400
      );
    }

    if (
      isVideoMimeType(file?.mimetype) &&
      Number(file?.size || 0) > CHAT_UPLOAD_LIMITS.maxVideoSizeBytes
    ) {
      throw new AppError(
        `Video "${file.originalname}" exceeds ${Math.floor(
          CHAT_UPLOAD_LIMITS.maxVideoSizeBytes / (1024 * 1024)
        )}MB`,
        400
      );
    }

    if (
      !isImageMimeType(file?.mimetype) &&
      !isVideoMimeType(file?.mimetype) &&
      Number(file?.size || 0) > CHAT_UPLOAD_LIMITS.maxFileSizeBytes
    ) {
      throw new AppError(
        `File "${file.originalname}" exceeds ${Math.floor(
          CHAT_UPLOAD_LIMITS.maxFileSizeBytes / (1024 * 1024)
        )}MB`,
        400
      );
    }
  });
}

export function assertValidGroupAvatarFile(file) {
  if (!file) return;

  if (!isImageMimeType(file?.mimetype)) {
    throw new AppError("Group avatar must be an image", 400);
  }

  if (Number(file?.size || 0) > CHAT_UPLOAD_LIMITS.maxGroupAvatarSizeBytes) {
    throw new AppError(
      `Group avatar exceeds ${Math.floor(
        CHAT_UPLOAD_LIMITS.maxGroupAvatarSizeBytes / (1024 * 1024)
      )}MB`,
      400
    );
  }
}