import sharp from 'sharp';
import { encode } from 'blurhash'; 
import { v4 as uuidv4 } from 'uuid';
import AppError from '../../core/AppError.js';

class MediaService {
  constructor({ mediaRepository, cloudinaryProvider }) {
    this.mediaRepository = mediaRepository;
    this.cloudinaryProvider = cloudinaryProvider;
  }

  async _processImage(buffer) {
    try {
      const image = sharp(buffer);
      const metadata = await image.metadata();

      let pipeline = image;
      if (metadata.width > 1920) {
        pipeline = pipeline.resize({ width: 1920, fit: 'inside' });
      }

      const processedBuffer = await pipeline
        .webp({ quality: 80, effort: 3 })
        .toBuffer();

      return {
          buffer: processedBuffer,
          width: metadata.width > 1920 ? 1920 : metadata.width,
          height: metadata.height 
      };
    } catch (error) {
      throw new AppError('Image processing failed', 422);
    }
  }

  async _generateBlurHash(buffer) {
    try {
      const { data, info } = await sharp(buffer)
        .raw()
        .ensureAlpha()
        .resize(32, 32, { fit: 'inside' })
        .toBuffer({ resolveWithObject: true });
        
      return encode(new Uint8ClampedArray(data), info.width, info.height, 4, 4);
    } catch (error) {
      console.error("BlurHash error:", error);
      return null;
    }
  }

  async uploadMultiple(files, userId, context = 'post') {
    if (!files || files.length === 0) return [];

    const uploadTasks = files.map(async (file) => {
        const { buffer: optimizedBuffer } = await this._processImage(file.buffer);

        const folder = `users/${userId}/${context}`;
        
        const [uploadResult, blurHash] = await Promise.all([
            this.cloudinaryProvider.uploadImage(optimizedBuffer, folder, uuidv4()),
            this._generateBlurHash(optimizedBuffer)
        ]);

        const mediaData = {
            originalName: file.originalname,
            publicId: uploadResult.public_id,
            url: uploadResult.secure_url, 
            mimetype: 'image/webp',
            size: uploadResult.bytes,
            width: uploadResult.width,
            height: uploadResult.height,
            blurHash: blurHash, 
            uploadedBy: userId,
            context
        };

        const newMedia = await this.mediaRepository.create(mediaData);
        return newMedia;
    });

    try {
      return await Promise.all(uploadTasks);
    } catch (error) {
      console.error("Batch upload failed:", error);
      throw new AppError('Image upload failed during processing', 500);
    }
  }

  async uploadSingle(file, userId, context = 'general') {
      if (!file) throw new AppError('No file provided', 400);
      const [result] = await this.uploadMultiple([file], userId, context);
      return result;
  }
}

export default MediaService;