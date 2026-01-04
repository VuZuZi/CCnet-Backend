import path from 'path'
import crypto from 'crypto'
import multer from 'multer'

const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) // ✅ IMPORTANT
    const name = crypto.randomBytes(16).toString('hex') + ext
    cb(null, name)
  },
})

const upload = multer({ storage })
export default upload
