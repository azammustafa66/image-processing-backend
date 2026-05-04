import { Router } from 'express';

import authRouter from './auth.routes';
import imageRouter from './image.routes';

const router = Router();

router.use('/auth', authRouter);
router.use('/images', imageRouter);

export default router;
