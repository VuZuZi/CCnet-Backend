import AppError from '../../core/AppError.js';

class UserService {
  constructor({ userRepository }) {
    this.userRepository = userRepository;
  }

  sanitizeUser(user) {
    if (!user) return null;
    const obj = user.toObject();
    delete obj.password;
    obj.hasPassword = !!user.password;
    return obj;
  }

  async getUserById(id) {
    const user = await this.userRepository.findById(id);
    if (!user) {
      throw new AppError('User not found', 404);
    }
    return user;
  }

  async getProfile(userId) {
    const user = await this.userRepository.findByIdWithPassword(userId);
    if (!user) {
      throw new AppError('User not found', 404);
    }
    return this.sanitizeUser(user);
  }

  async getUserByEmail(email) {
    return await this.userRepository.findByEmailWithPassword(email);
  }

  async createUser(userData) {
    const exists = await this.userRepository.existsByEmail(userData.email);
    if (exists) {
      throw new AppError('Email already registered', 409);
    }
    return await this.userRepository.create(userData);
  }

  async updateUser(id, updateData) {
    if (updateData.password) {
      delete updateData.password;
    }

    const user = await this.userRepository.updateById(id, updateData);
    if (!user) {
      throw new AppError('User not found to update', 404);
    }
    return user;
  }

  async updateProfile(id, updateData) {
    const allowedFields = ['fullName', 'phone', 'location', 'bio', 'avatar', 'skills'];
    const safePayload = {};
    for (const field of allowedFields) {
      if (updateData[field] !== undefined) {
        safePayload[field] = updateData[field];
      }
    }

    const user = await this.userRepository.updateById(id, safePayload);
    if (!user) {
      throw new AppError('User not found to update', 404);
    }
    const fresh = await this.userRepository.findByIdWithPassword(id);
    return this.sanitizeUser(fresh);
  }

  async changePassword(id, currentPassword, newPassword) {
    const user = await this.userRepository.findByIdWithPassword(id);
    if (!user) throw new AppError('User not found', 404);
    if (!user.password) throw new AppError('This account does not have a password to change', 400);

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) throw new AppError('Current password is incorrect', 400);

    user.password = newPassword;
    await user.save();
    return this.sanitizeUser(user);
  }

  async checkEmailExists(email) {
    return await this.userRepository.existsByEmail(email);
  }
}

export default UserService;