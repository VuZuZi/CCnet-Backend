import User from './user.model.js';

class UserRepository {
  async findByEmailWithPassword(email) {
    return await User.findOne({ email }).select('+password');
  }

  async findByEmail(email) {
    return await User.findOne({ email });
  }

  async findById(id) {
    return await User.findById(id);
  }

  async findByIdWithPassword(id) {
    return await User.findById(id).select('+password');
  }

  async create(userData) {
    const user = new User(userData);
    return await user.save();
  }

  async updateById(id, updateData) {
    return await User.findByIdAndUpdate(id, updateData, { 
      new: true,
      runValidators: true 
    });
  }

  async deleteById(id) {
    return await User.findByIdAndDelete(id);
  }

  async existsByEmail(email) {
    const result = await User.exists({ email });
    return !!result; 
  }
}

export default UserRepository;