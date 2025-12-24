import Token from './token.model.js';

class TokenRepository {
  async saveToken(token, userId, expiresAt) {
    const tokenDoc = new Token({
      token,
      userId,
      type: 'refresh',
      expiresAt
    });
    await tokenDoc.save();
    return tokenDoc;
  }

  async findToken(token) {
    return await Token.findOne({ token });
  }

  async deleteToken(token) {
    return await Token.findOneAndDelete({ token });
  }

  async deleteAllByUserId(userId) {
    return await Token.deleteMany({ userId });
  }
  async countByUserId(userId) {
    return await Token.countDocuments({ userId });
  }
  async findByUserId(userId) {
    return await Token.find({ userId }).sort({ createdAt: -1 });
  }
  async findByRefreshToken(token) {
     return await Token.findOne({ token }).populate('userId'); 
  }
}

export default TokenRepository;