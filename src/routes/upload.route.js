import express from 'express'
import upload from '../middlewares/upload.middleware.js'

const router = express.Router()

router.post('/', upload.single('file'), (req, res) => {
  res.json({
    filename: req.file.filename,
    url: `/uploads/${req.file.filename}`,
  })
})

export default router
