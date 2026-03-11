import Media from './media.model.js';

class MediaRepository {
  async create(mediaData) {
    return await Media.create(mediaData);
  }

  async findById(id) {
    return await Media.findById(id).lean().exec();
  }

  async deleteById(id) {
    return await Media.findByIdAndDelete(id).lean().exec();
  }
  
  async deleteByPublicId(publicId) {
    return await Media.findOneAndDelete({ publicId }).lean().exec();
  }

  async findByPublicId(publicId) {
    return await Media.findOne({ publicId }).lean().exec();
  }

  async updateCounters(userId, counters) {
    return await User.findByIdAndUpdate(
      userId,
      { $inc: counters },
      { new: true }
    ).lean().exec();
  }
}

export default MediaRepository;