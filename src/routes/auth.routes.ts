import { Router } from 'express';
import {
  forgotPassword,
  login,
  logout,
  register,
  renewRefreshToken,
  resendEmailVerification,
  resetPassword,
  verifyMail,
} from '../controllers/auth.controller';

import { validate, verifyJWT } from '../middlewares';
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from '../validators';

const router = Router();

router.route('/register').post(validate(registerSchema), register);
router.route('/login').post(validate(loginSchema), login);
router.route('/refresh-token').post(renewRefreshToken);
router.route('/forgot-password').post(validate(forgotPasswordSchema), forgotPassword);
router
  .route('/reset-password/:forgotPasswordToken')
  .patch(validate(resetPasswordSchema), resetPassword);
router.route('/verify-email/:emailVerificationToken').patch(verifyMail);

// protected
router.route('/logout').post(verifyJWT, logout);
router.route('/resend-email-verification').post(verifyJWT, resendEmailVerification);

export default router;
