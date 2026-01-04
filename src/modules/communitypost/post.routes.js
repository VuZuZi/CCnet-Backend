import express from 'express'
import { authenticate } from '../../middlewares/auth.middleware.js'
import upload from '../../middlewares/upload.middleware.js'
import { getContainer } from '../../container/index.js'

const router = express.Router()


router.get('/', (req, res, next) => {
  const { cradle } = getContainer()
  return cradle.postController.getAllPosts(req, res, next)
})

router.get('/:id', (req, res, next) => {
  const { cradle } = getContainer()
  return cradle.postController.getPostById(req, res, next)
})


router.post(
  '/',
  authenticate,
  upload.array('images', 5), 
  (req, res, next) => {
    const { cradle } = getContainer()
    return cradle.postController.createPost(req, res, next)
  }
)

router.post('/:id/like', authenticate, (req, res, next) => {
  const { cradle } = getContainer()
  return cradle.postController.toggleLike(req, res, next)
})

router.post('/:id/dislike', authenticate, (req, res, next) => {
  const { cradle } = getContainer()
  return cradle.postController.toggleDislike(req, res, next)
})


router.post('/:id/comment', authenticate, (req, res, next) => {
  const { cradle } = getContainer()
  return cradle.postController.addComment(req, res, next)
})

export default router
