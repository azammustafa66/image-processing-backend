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
import { verifyJWT } from '../middlewares/auth.middleware';

const router = Router();

router.route('/register').post(register);
router.route('/login').post(login);
router.route('/refresh-token').post(renewRefreshToken);
router.route('/forgot-password').post(forgotPassword);
router.route('/reset-password/:forgotPasswordToken').patch(resetPassword);
router.route('/verify-email/:emailVerificationToken').patch(verifyMail);

// protected
router.route('/logout').post(verifyJWT, logout);
router.route('/resend-email-verification').post(verifyJWT, resendEmailVerification);

export default router;
