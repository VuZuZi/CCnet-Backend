import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String, 
      required: true, 
      unique: true, 
      lowercase: true, 
      trim: true,
      index: true
    },
    password: {
      type: String,
      minlength: 6,
      select: false 
    },
    googleId: {
      type: String,
      unique: true,
      sparse: true, 
      select: false
    },
    avatar: {
      type: String,
      default: 'https://www.gravatar.com/avatar/3b3be63a4c2a439b013787725dfce802?d=identicon' 
    },
    avatarPublicId: { 
      type: String, 
      select: false },
    phone: {
      type: String,
      trim: true,
      default: ''
    },
    location: {
      type: String,
      trim: true,
      default: ''
    },
    bio: {
      type: String,
      trim: true,
      default: ''
    },
    skills: [{
      type: String,
      trim: true
    }],
    fullName: {
      type: String, 
      required: true, 
      trim: true
    },
    isEmailVerified: { type: Boolean, default: false },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

userSchema.pre('validate', function(next) {
  if (this.isNew || this.isModified('password')) {
    if (!this.googleId && !this.password) {
      this.invalidate('password', 'Password is required for email registration');
    }
  }
  next();
});

userSchema.pre('save', async function (next) {
  if (!this.isModified('password') || !this.password) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model('User', userSchema);
export default User;