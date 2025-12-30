import mongoose from 'mongoose'

const postSchema = new mongoose.Schema(
  {
    content: {
      type: String,
      required: true,
    },

    images: [
      {
        type: String, 
      },
    ],

    links: [
      {
        type: String, 
      },
    ],

    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
)

export default mongoose.model('Post', postSchema)
