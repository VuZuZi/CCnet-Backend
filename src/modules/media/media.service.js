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
      const image = sharp(buffer, { failOn: 'truncated' });
      const metadata = await image.metadata();

      let pipeline = image;
      if (metadata.width > 1920 || metadata.height > 1920) {
        pipeline = pipeline.resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true });
      }

      const processedBuffer = await pipeline
        .webp({ quality: 80, effort: 3 })
        .toBuffer();

      const newMetadata = await sharp(processedBuffer).metadata();

      return {
          buffer: processedBuffer,
          width: newMetadata.width,
          height: newMetadata.height 
      };
    } catch (error) {
      console.error('[CTO Media Error]: Xử lý ảnh thất bại', error.message);
      throw new AppError('Định dạng ảnh không hợp lệ hoặc file bị lỗi cấu trúc', 422);
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
      console.error("[CTO Warning] BlurHash lỗi, trả về null để không đứt luồng chính:", error);
      return null;
    }
  }

  async uploadMultiple(files, userId, context = 'post') {
    if (!files || files.length === 0) return [];

    const results = [];
    
    for (const file of files) {
        try {
            const sourceData = file.path || file.buffer; 
            const { buffer: optimizedBuffer, width, height } = await this._processImage(sourceData);

            const folder = `users/${userId}/${context}`;
            
            const [uploadResult, blurHash] = await Promise.all([
                this.cloudinaryProvider.uploadImage(optimizedBuffer, folder, uuidv4()),
                this._generateBlurHash(optimizedBuffer)
            ]);

            const mediaData = {
                originalName: file.originalname || 'unknown',
                publicId: uploadResult.public_id,
                url: uploadResult.secure_url, 
                mimetype: 'image/webp',
                size: uploadResult.bytes,
                width: width,
                height: height,
                blurHash: blurHash, 
                uploadedBy: userId,
                context
            };

            const newMedia = await this.mediaRepository.create(mediaData);
            results.push(newMedia);
        } catch (error) {
            console.error(`[CTO Error] Lỗi upload batch file:`, error);
            throw new AppError(`Tải lên hình ảnh thất bại trong quá trình xử lý`, 500);
        }
    }

    return results;
  }

  async uploadSingle(file, userId, context = 'general') {
      if (!file) throw new AppError('Không tìm thấy file để xử lý', 400);
      const [result] = await this.uploadMultiple([file], userId, context);
      return result;
  }

  getUploadSignature(userId, context = 'project_cover') {
    const folder = `projects/${userId}/${context}`;
    
    const paramsToSign = {
      folder: folder,
      tags: userId.toString() 
    };

    const sigData = this.cloudinaryProvider.generateSignature(paramsToSign);
    
    return {
      ...sigData,
      folder,
      tags: userId.toString()
    };
  }
}

export default MediaService;