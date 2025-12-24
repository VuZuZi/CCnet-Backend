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

// Logic Validate Conditional (Giữ nguyên - Rất tốt)
userSchema.pre('validate', function(next) {
  if (!this.googleId && !this.password) {
    this.invalidate('password', 'Password is required for email registration');
  }
  next();
});

// Logic Hash Password (Giữ nguyên)
userSchema.pre('save', async function (next) {
  if (!this.isModified('password') || !this.password) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  // [Safety] Nếu user này reg bằng Google -> password null -> Return false luôn
  if (!this.password) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

// [Security] Đảm bảo không bao giờ lộ field nhạy cảm khi response trả về JSON
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  // delete obj.googleId; // Có thể ẩn luôn nếu muốn
  return obj;
};

const User = mongoose.model('User', userSchema);
export default User;