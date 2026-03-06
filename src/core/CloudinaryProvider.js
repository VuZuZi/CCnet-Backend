import { v2 as cloudinary } from 'cloudinary';
import { config } from '../config/index.js';

cloudinary.config({
  cloud_name: config.cloudinary.cloudName,
  api_key: config.cloudinary.apiKey,
  api_secret: config.cloudinary.apiSecret
});

class CloudinaryProvider {
  async uploadImage(fileBuffer, folder = 'general', publicId = null) {
    return new Promise((resolve, reject) => {
      const options = {
        folder: folder,
        resource_type: 'image',
      };
      
      if (publicId) options.public_id = publicId;

      const uploadStream = cloudinary.uploader.upload_stream(
        options,
        (error, result) => {
          if (error) return reject(error);
          resolve(result); 
        }
      );
      uploadStream.end(fileBuffer);
    });
  }

  async deleteMany(publicIds) {
      if (!publicIds || publicIds.length === 0) return;
      return await cloudinary.api.delete_resources(publicIds);
  }
}

export default CloudinaryProvider;