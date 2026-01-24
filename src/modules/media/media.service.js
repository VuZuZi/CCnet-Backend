import AppError from '../../core/AppError.js';

class MediaService {
  constructor({ mediaRepository, cloudinaryProvider }) {
    this.mediaRepository = mediaRepository;
    this.cloudinaryProvider = cloudinaryProvider;
  }

  async uploadSingle(file, userId, context = 'general') {
    if (!file) throw new AppError('No file provided', 400);

    const folder = `users/${userId}/${context}`;
    const uploadResult = await this.cloudinaryProvider.uploadImage(file.buffer, folder);

    const mediaData = {
      originalName: file.originalname,
      url: uploadResult.secure_url,
      publicId: uploadResult.public_id,
      mimetype: file.mimetype,
      size: file.size,
      uploadedBy: userId,
      context: context
    };

    return await this.mediaRepository.create(mediaData);
  }

  async deleteMedia(mediaId, userId) {
    const media = await this.mediaRepository.findById(mediaId);
    if (!media) throw new AppError('Media not found', 404);
    
    if (media.uploadedBy.toString() !== userId) {
        throw new AppError('Forbidden: You do not own this media', 403);
    }

    await this.cloudinaryProvider.deleteImage(media.publicId);

    await this.mediaRepository.deleteById(mediaId);
    
    return { success: true };
  }
}

export default MediaService;
