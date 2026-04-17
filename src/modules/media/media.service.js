import sharp from 'sharp';
import exifr from 'exifr';
import { encode } from 'blurhash';
import { v4 as uuidv4 } from 'uuid';
import AppError from '../../core/AppError.js';

class MediaService {
  constructor({ mediaRepository, cloudinaryProvider, jobQueue }) {
    this.mediaRepository = mediaRepository;
    this.cloudinaryProvider = cloudinaryProvider;
    this.jobQueue = jobQueue;
  }

  async _extractMetadata(buffer, clientLocation = null) {
    let metadata = { lat: null, lng: null, capturedAt: null, source: 'NONE' };

    try {
      const exifData = await exifr.parse(buffer, { gps: true, exif: true });
      if (exifData && exifData.latitude && exifData.longitude) {
        metadata.lat = exifData.latitude;
        metadata.lng = exifData.longitude;
        metadata.capturedAt = exifData.DateTimeOriginal || exifData.CreateDate || new Date();
        metadata.source = 'EXIF';
      }
    } catch (error) {
      console.warn('[CTO Media Warning]: Không thể parse EXIF, file không có metadata hoặc bị lỗi.', error.message);
    }

    if (metadata.source === 'NONE' && clientLocation && clientLocation.lat && clientLocation.lng) {
      metadata.lat = Number(clientLocation.lat);
      metadata.lng = Number(clientLocation.lng);
      metadata.capturedAt = new Date();
      metadata.source = 'CLIENT';
    }
    else if (metadata.source === 'EXIF' && clientLocation && clientLocation.lat) {
      metadata.source = 'MIXED';
    }

    return metadata;
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

  async uploadSingle(file, userId, context = 'general', clientLocation = null) {
    if (!file) throw new AppError('Không tìm thấy file để xử lý', 400);
    const sourceData = file.buffer || file.path;

    const captureMetadata = await this._extractMetadata(sourceData, clientLocation);

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
      captureMetadata,
      uploadedBy: userId,
      context
    };

    return await this.mediaRepository.create(mediaData);
  }

  async uploadMultiple(files, userId, context = 'post', clientLocation = null) {
    if (!files || files.length === 0) return [];
    const results = [];

    for (const file of files) {
      const result = await this.uploadSingle(file, userId, context, clientLocation);
      results.push(result);
    }
    return results;
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

  async syncMediaRecord(userId, payload) {
    const mediaData = {
      ...payload,
      uploadedBy: userId
    };
    return await this.mediaRepository.create(mediaData);
  }

  async uploadSmartMultiple(files, userId, context = 'general', clientLocation = null) {
    if (!files || files.length === 0) return [];

    const results = [];

    for (const file of files) {
      try {
        const isImage = file.mimetype.startsWith('image/');
        const sourceData = file.path || file.buffer;

        let optimizedBuffer = sourceData;
        let finalWidth = 0;
        let finalHeight = 0;
        let blurHash = null;
        let finalMimetype = file.mimetype;
        let captureMetadata = null;

        if (isImage) {
          captureMetadata = await this._extractMetadata(sourceData, clientLocation);

          const processed = await this._processImage(sourceData);
          optimizedBuffer = processed.buffer;
          finalWidth = processed.width;
          finalHeight = processed.height;
          finalMimetype = 'image/webp';
          blurHash = await this._generateBlurHash(optimizedBuffer);
        }

        const folder = `users/${userId}/${context}`;

        const uploadResult = await this.cloudinaryProvider.uploadImage(optimizedBuffer, folder, uuidv4());

        const mediaData = {
          originalName: file.originalname || 'unknown',
          publicId: uploadResult.public_id,
          url: uploadResult.secure_url,
          mimetype: finalMimetype,
          size: uploadResult.bytes,
          width: finalWidth,
          height: finalHeight,
          blurHash: blurHash,
          captureMetadata,
          uploadedBy: userId,
          context
        };

        const newMedia = await this.mediaRepository.create(mediaData);
        results.push(newMedia);
      } catch (error) {
        console.error(`[CTO Error] Lỗi upload smart file:`, error);
        throw new AppError(`Tải lên tệp thất bại trong quá trình xử lý`, 500);
      }
    }

    return results;
  }

  async deleteMedia(mediaId, userId, userRole) {
    const media = await this.mediaRepository.findById(mediaId);

    if (!media) {
      throw new AppError('Không tìm thấy file media', 404);
    }

    if (String(media.uploadedBy) !== String(userId) && userRole !== 'admin') {
      throw new AppError('Bạn không có quyền xóa file media này', 403);
    }

    await this.mediaRepository.deleteById(mediaId);

    if (media.publicId) {
      if (this.jobQueue) {
        this.jobQueue.addJob('media-cleanup', 'delete-cloudinary', { publicId: media.publicId })
          .catch(err => console.error('[CTO Warning] Lỗi đẩy job xóa media vào Queue:', err.message));
      } else {
        this.cloudinaryProvider.deleteImage(media.publicId)
          .catch(err => console.error('[CTO Warning] Lỗi xóa media nền Cloudinary:', err.message));
      }
    }

    return true;
  }
}

export default MediaService;