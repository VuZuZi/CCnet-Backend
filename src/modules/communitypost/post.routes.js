import express from 'express'
import { authenticate } from '../../middlewares/auth.middleware.js'
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

router.post('/', authenticate, (req, res, next) => {
  const { cradle } = getContainer()
  return cradle.postController.createPost(req, res, next)
})

export default router
