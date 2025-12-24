import AppError from '../../core/AppError.js';

class UserService {
  constructor({ userRepository }) {
    this.userRepository = userRepository;
  }

  async getUserById(id) {
    const user = await this.userRepository.findById(id);
    if (!user) {
      throw new AppError('User not found', 404);
    }
    return user;
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

  async checkEmailExists(email) {
    return await this.userRepository.existsByEmail(email);
  }
}

export default UserService;