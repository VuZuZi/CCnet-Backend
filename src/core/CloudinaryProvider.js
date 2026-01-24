import { v2 as cloudinary } from 'cloudinary';
import { config } from '../config/index.js';

cloudinary.config({
  cloud_name: config.cloudinary.cloudName,
  api_key: config.cloudinary.apiKey,
  api_secret: config.cloudinary.apiSecret
});

class CloudinaryProvider {
  async uploadImage(fileBuffer, folder = 'avatars') {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { folder: folder },
        (error, result) => {
          if (error) return reject(error);
          resolve(result);
        }
      );
      uploadStream.end(fileBuffer);
    });
  }

  async deleteImage(publicId) {
    if (!publicId) return;
    return await cloudinary.uploader.destroy(publicId);
  }
}

export default CloudinaryProvider;