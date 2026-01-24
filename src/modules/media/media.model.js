import mongoose from 'mongoose';

const mediaSchema = new mongoose.Schema(
  {
    originalName: { type: String, required: true },
    url: { type: String, required: true }, 
    publicId: { type: String, required: true, unique: true }, 
    mimetype: { type: String, required: true },
    size: { type: Number, required: true }, 
    uploadedBy: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User', 
      required: true 
    },
    context: { 
      type: String, 
      enum: ['avatar', 'post', 'general'], 
      default: 'general' 
    }
  },
  { timestamps: true }
);

const Media = mongoose.model('Media', mediaSchema);
export default Media;