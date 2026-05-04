import { Router } from 'express';

import {
  deleteImage,
  getImage,
  listImages,
  transformImage,
  uploadImage,
} from '../controllers/image.controller';
import { transformRateLimit, upload, verifyJWT } from '../middlewares';

const router = Router();

router.use(verifyJWT);

router.route('/').get(listImages).post(upload.single('image'), uploadImage);
router.route('/:id/transform').post(transformRateLimit, transformImage);
router.route('/:id').get(getImage).delete(deleteImage);

export default router;
