import Media from './media.model.js';
import User from '../user/user.model.js';

class MediaRepository {
  async create(mediaData, session = null) {
    const docs = await Media.create([mediaData], { session });
    return docs[0];
  }

  async createMany(mediaDataArray, session = null) {
    return await Media.insertMany(mediaDataArray, { session });
  }

  async findById(id) {
    return await Media.findById(id).lean().exec();
  }

  async deleteById(id, session = null) {
    return await Media.findByIdAndDelete(id, { session }).lean().exec();
  }
  
  async deleteByPublicId(publicId, session = null) {
    return await Media.findOneAndDelete({ publicId }, { session }).lean().exec();
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

  async findManyByIdsAndOwner(ids, userId, session = null) {
    if (!ids || ids.length === 0) return [];
    return await Media.find({ 
      _id: { $in: ids }, 
      uploadedBy: userId 
    }).session(session).lean().exec();
  }

  async findManyByPublicIds(publicIds, session = null) {
    if (!publicIds || publicIds.length === 0) return [];
    return await Media.find({ 
      publicId: { $in: publicIds } 
    }).session(session).lean().exec();
  }
}

export default MediaRepository;