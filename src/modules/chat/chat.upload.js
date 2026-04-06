import multer from "multer";
import AppError from "../../core/AppError.js";
import {
  CHAT_UPLOAD_LIMITS,
  isAllowedChatUploadFile,
  isImageMimeType,
} from "./chat.upload.constants.js";

const storage = multer.memoryStorage();

function fileFilter(req, file, cb) {
  if (file.fieldname === "groupAvatar") {
    if (!isImageMimeType(file?.mimetype)) {
      return cb(new AppError("Group avatar must be an image", 400));
    }

    return cb(null, true);
  }

  if (!isAllowedChatUploadFile(file)) {
    return cb(
      new AppError(
        `File "${file?.originalname || "unknown"}" is not a supported format`,
        400
      )
    );
  }

  return cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: {
    files: CHAT_UPLOAD_LIMITS.maxFiles,
    fileSize: CHAT_UPLOAD_LIMITS.maxFileSizeBytes,
  },
});

export const groupAvatarUpload = upload.single("groupAvatar");

export const messageUpload = upload.fields([
  { name: "attachments", maxCount: CHAT_UPLOAD_LIMITS.maxFiles },
  { name: "files", maxCount: CHAT_UPLOAD_LIMITS.maxFiles },
]);