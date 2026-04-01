import fs from 'fs';
import path from 'path';

export default class ChatFileService {
  getUploadDir() {
    return path.resolve(process.cwd(), 'uploads');
  }

  resolveSafeUploadPath(filename) {
    const uploadDir = this.getUploadDir();
    const filePath = path.resolve(uploadDir, filename);

    if (!filePath.startsWith(uploadDir)) {
      const error = new Error('Invalid file path');
      error.statusCode = 400;
      throw error;
    }

    return filePath;
  }

  assertFileExists(filePath) {
    if (!fs.existsSync(filePath)) {
      const error = new Error('File not found');
      error.statusCode = 404;
      throw error;
    }
  }

  getDownloadPath(filename) {
    const filePath = this.resolveSafeUploadPath(filename);
    this.assertFileExists(filePath);
    return filePath;
  }
}