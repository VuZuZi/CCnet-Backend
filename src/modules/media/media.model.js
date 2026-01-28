import mongoose from 'mongoose';

const mediaSchema = new mongoose.Schema(
  {
    originalName: { type: String, required: true },
    publicId: { type: String, required: true, unique: true }, 
    url: { type: String, required: true }, 
    mimetype: { type: String, required: true },
    size: { type: Number, required: true }, 
    width: { type: Number, required: true },  
    height: { type: Number, required: true }, 
    blurHash: { type: String, default: null }, 
    uploadedBy: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User', 
      required: true 
    },
    context: { 
      type: String, 
      enum: ['avatar', 'post', 'comment', 'general'], 
      default: 'general' 
    }
  },
  { timestamps: true }
);

const Media = mongoose.model('Media', mediaSchema);
export default Media;