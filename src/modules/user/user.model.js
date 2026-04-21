import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const pointLocationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["Point"],
      default: "Point",
    },
    coordinates: {
      type: [Number],
      default: undefined,
    },
    address: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { _id: false }
);

const organizationSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, default: "" },
    type: { type: String, trim: true, default: "" },
    website: { type: String, trim: true, default: "" },
    location: { type: pointLocationSchema, default: null },
    verifiedAt: { type: Date, default: null },
    requestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "OrganizerRequest",
      default: null,
    },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    password: { type: String, minlength: 6, select: false },
    googleId: { type: String, unique: true, sparse: true, select: false },

    avatar: {
      type: String,
      default:
        "https://www.gravatar.com/avatar/3b3be63a4c2a439b013787725dfce802?d=identicon",
    },
    avatarPublicId: { type: String, select: false },
    coverPhoto: { type: String, default: "" },
    coverPhotoPublicId: { type: String, select: false },

    fullName: { type: String, required: true, trim: true },
    phone: { type: String, trim: true, default: "" },
    location: { type: pointLocationSchema, default: null },

    headline: { type: String, trim: true, default: "" },
    about: { type: String, trim: true, default: "" },
    skills: [{ type: String, trim: true }],

    savedPosts: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Post",
      },
    ],

    followersCount: { type: Number, default: 0 },
    followingCount: { type: Number, default: 0 },
    level: { type: Number, default: 1 },
    title: { type: String, trim: true, default: "" },

    isEmailVerified: { type: Boolean, default: false },
    isVerified: { type: Boolean, default: false },

    role: {
      type: String,
      enum: ["user", "admin", "organizer"],
      default: "user",
    },

    organization: { type: organizationSchema, default: null },

    coolingPeriodEnd: {
      type: Date,
      default: null,
    },

    status: {
      type: String,
      enum: ["active", "inactive", "banned"],
      default: "active",
      index: true,
    },

    isActive: { type: Boolean, default: true },

    kyc: {
      tier: { type: Number, enum: [0, 1, 2, 3], default: 0 },
      status: {
        type: String,
        enum: ["UNVERIFIED", "PENDING", "VERIFIED", "EXPIRED", "LOCKED"],
        default: "UNVERIFIED",
      },
      verifiedAt: { type: Date, default: null },
      expiresAt: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

userSchema.index({ "kyc.status": 1, "kyc.expiresAt": 1 });

userSchema.pre("validate", function (next) {
  if (this.isNew || this.isModified("password")) {
    if (!this.googleId && !this.password) {
      this.invalidate(
        "password",
        "Password is required for email registration"
      );
    }
  }
  next();
});

userSchema.pre("save", async function (next) {
  if (!this.isModified("password") || !this.password) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model("User", userSchema);
export default User;