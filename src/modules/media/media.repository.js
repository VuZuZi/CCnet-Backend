import Media from './media.model.js';

class MediaRepository {
  async create(mediaData) {
    const media = new Media(mediaData);
    return await media.save();
  }

  async findById(id) {
    return await Media.findById(id).lean();
  }

  async deleteById(id) {
    return await Media.findByIdAndDelete(id);
  }
  
  async findByPublicId(publicId) {
    return await Media.findOne({ publicId });
  }
}

export default MediaRepository;