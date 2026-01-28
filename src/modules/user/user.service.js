import AppError from '../../core/AppError.js';
import { toUserResponse } from './user.dto.js';

class UserService {
  constructor({ userRepository , mediaRepository, cloudinaryProvider,jobQueue}) {
    this.userRepository = userRepository;
    this.mediaRepository = mediaRepository;
    this.cloudinaryProvider = cloudinaryProvider;
    this.jobQueue = jobQueue;
  }

  async getUserById(id) {
    const user = await this.userRepository.findById(id);
    if (!user) {
      throw new AppError('User not found', 404);
    }
    return user;
  }

  async getProfile(userId) {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new AppError('User not found', 404);
    
    return toUserResponse(user);
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

  async updateProfile(userId, updateData) {
    const user = await this.userRepository.findByIdWithPassword(userId); 
    if (!user) throw new AppError('User not found', 404);
    
    const allowedFields = ['fullName', 'phone', 'location', 'bio', 'avatar', 'skills'];
    
    allowedFields.forEach(field => {
        if (updateData[field] !== undefined) {
            user[field] = updateData[field];
        }
    });

    const updatedUser = await user.save();
    
    return toUserResponse(updatedUser);
  }

  async changePassword(id, currentPassword, newPassword) {
        const user = await this.userRepository.findByIdWithPassword(id);
        if (!user) throw new AppError('User not found', 404);
        if (!user.password) throw new AppError('This account does not have a password to change', 400);

        const isMatch = await user.comparePassword(currentPassword);
        if (!isMatch) throw new AppError('Current password is incorrect', 400);

        user.password = newPassword;
        await user.save();
        return toUserResponse(user);
    }
  
  async changeAvatar(userId, file) {
    if (!file) throw new AppError('Please upload an image', 400);

    const user = await this.userRepository.findByIdWithPassword(userId); 
    if (!user) throw new AppError('User not found', 404);

    const uploadResult = await this.cloudinaryProvider.uploadImage(
        file.buffer, 
        `users/${userId}/avatar`
    );

    const newMedia = await this.mediaRepository.create({
        originalName: file.originalname,
        url: uploadResult.secure_url,
        publicId: uploadResult.public_id,
        mimetype: file.mimetype,
        size: file.size,
        width: uploadResult.width,   
        height: uploadResult.height, 
        uploadedBy: userId,
        context: 'avatar'
    });

    if (user.avatarPublicId) {
        this.cloudinaryProvider.deleteImage(user.avatarPublicId)
            .catch(err => console.error(`[Cleanup] Failed to delete old avatar ${user.avatarPublicId}:`, err));
        this.mediaRepository.deleteById(user.avatarPublicId) 
             .catch(() => {}); 
    }

    user.avatar = newMedia.url;
    user.avatarPublicId = newMedia.publicId; 
    
    await user.save();
    await this.jobQueue.addJob('user-updates', 'sync-profile', {
        userId: user._id,
        fullName: user.fullName,
        avatar: user.avatar,
        username: user.email.split('@')[0] 
    });

    return toUserResponse(user);
  }
    
}

export default UserService;