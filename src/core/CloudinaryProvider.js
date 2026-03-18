import { v2 as cloudinary } from 'cloudinary';
import { config } from '../config/index.js';
import fs from 'fs';
import { Readable } from 'stream';

cloudinary.config({
  cloud_name: config.cloudinary.cloudName,
  api_key: config.cloudinary.apiKey,
  api_secret: config.cloudinary.apiSecret
});

class CloudinaryProvider {
  async uploadImage(fileData, folder = 'general', publicId = null) {
    return new Promise((resolve, reject) => {
      const options = {
        folder: folder,
        resource_type: 'auto', 
      };
      
      if (publicId) options.public_id = publicId;

      const uploadStream = cloudinary.uploader.upload_stream(
        options,
        (error, result) => {
          if (error) return reject(error);
          resolve(result); 
        }
      );

      let readStream;
      if (Buffer.isBuffer(fileData)) {
        readStream = Readable.from(fileData);
      } else if (typeof fileData === 'string') {
        readStream = fs.createReadStream(fileData);
      } else {
        return reject(new Error('Định dạng file không hợp lệ. Yêu cầu Buffer hoặc File Path (String).'));
      }
      
      readStream.on('error', (err) => reject(new Error(`Lỗi luồng đọc file: ${err.message}`)));
      readStream.pipe(uploadStream);
    });
  }

  async deleteImage(publicId) {
    if (!publicId) return null;
    try {
      return await cloudinary.uploader.destroy(publicId);
    } catch (error) {
      console.error(`[CloudinaryProvider] Failed to delete image ${publicId}:`, error.message);
      throw error;
    }
  }

  async deleteMany(publicIds) {
      if (!publicIds || publicIds.length === 0) return;
      return await cloudinary.api.delete_resources(publicIds);
  }

  generateSignature(paramsToSign) {
    const timestamp = Math.round(new Date().getTime() / 1000);
    const signature = cloudinary.utils.api_sign_request(
      { ...paramsToSign, timestamp },
      config.cloudinary.apiSecret
    );
    return {
      signature,
      timestamp,
      cloudName: config.cloudinary.cloudName,
      apiKey: config.cloudinary.apiKey
    };
  }
}

export default CloudinaryProvider;