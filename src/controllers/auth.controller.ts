import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import type { Request } from 'express';

import { User } from '../models/user.model';
import { emailQueue } from '../jobs/emailQueue';
import type { AuthenticatedRequest } from '../types';
import { APIError, APIResponse, asyncHandler, options } from '../utils';

const isMobileClient = (req: Request) =>
  req.useragent?.isMobile || req.header('X-Client-Type') === 'mobile';

export const register = asyncHandler(async (req, res) => {
  const { email, name, password } = req.body as { email: string; name: string; password: string };

  const doesExist = await User.findOne({ email });
  if (doesExist) throw new APIError(409, 'User already exists. Please login.');

  const created = await User.create({ name, email, password });
  const { hashedToken, unhashedToken, tempTokenExpiry } = created.generateTempTokens();
  const accessToken = created.generateAccessToken();
  const refreshToken = created.generateRefreshToken();

  created.refreshToken = refreshToken;
  created.emailVerificationToken = hashedToken;
  created.emailVerificationTokenExpiry = tempTokenExpiry;
  await created.save({ validateBeforeSave: false });

  const {
    password: _,
    __v,
    emailVerificationToken,
    emailVerificationTokenExpiry,
    forgotPasswordToken,
    forgotPasswordTokenExpiry,
    refreshToken: __,
    ...safeUser
  } = created.toObject();

  await emailQueue.add('SendRegisterEmail', {
    to: email,
    subject: 'Verify your email address',
    name,
    intro: 'Welcome! Please verify your email address to activate your account.',
    instructions: 'Click the button below to verify your email:',
    buttonColor: '#22BC66',
    buttonText: 'Verify Email',
    redirectLink: `${process.env.APP_URL}/api/v1/auth/verify-email/${unhashedToken}`,
  });

  return res
    .status(201)
    .cookie('accessToken', accessToken, options)
    .cookie('refreshToken', refreshToken, options)
    .json(
      new APIResponse(
        201,
        { user: safeUser, accessToken, ...(isMobileClient(req) && { refreshToken }) },
        'User created successfully',
      ),
    );
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body as { email: string; password: string };

  const user = await User.findOne({ email });
  if (!user) throw new APIError(400, 'User does not exist. Please register');

  const isPasswordValid = await user.isPasswordValid(password);
  if (!isPasswordValid) throw new APIError(400, 'Invalid credentials');

  const accessToken = user.generateAccessToken();
  const refreshToken = user.generateRefreshToken();

  user.refreshToken = refreshToken;
  await user.save({ validateBeforeSave: false });

  const {
    password: _,
    emailVerificationToken,
    emailVerificationTokenExpiry,
    forgotPasswordToken,
    forgotPasswordTokenExpiry,
    refreshToken: __,
    ...safeUser
  } = user.toObject();

  return res
    .status(200)
    .cookie('accessToken', accessToken, options)
    .cookie('refreshToken', refreshToken, options)
    .json(
      new APIResponse(
        200,
        { user: safeUser, accessToken, ...(isMobileClient(req) && { refreshToken }) },
        'User logged in successfully',
      ),
    );
});

export const logout = asyncHandler(async (req: AuthenticatedRequest, res) => {
  await User.findByIdAndUpdate(req.user._id, { $set: { refreshToken: null } });

  return res
    .status(200)
    .clearCookie('accessToken')
    .clearCookie('refreshToken')
    .json(new APIResponse(200, {}, 'User logged out succesfully'));
});

export const renewRefreshToken = asyncHandler(async (req, res) => {
  const incomingToken = req.cookies?.refreshToken ?? req.body?.refreshToken;
  if (!incomingToken) throw new APIError(401, 'Unauthorized');

  const { _id } = jwt.verify(incomingToken, process.env.REFRESH_TOKEN_SECRET as string) as {
    _id: string;
  };

  const user = await User.findById(_id);
  if (!user) throw new APIError(401, 'Invalid token. Please login again');

  // token rotation — reject if already replaced or revoked
  if (user.refreshToken !== incomingToken)
    throw new APIError(401, 'Refresh token has already been used or revoked');

  const accessToken = user.generateAccessToken();
  const refreshToken = user.generateRefreshToken();

  user.refreshToken = refreshToken;
  await user.save({ validateBeforeSave: false });

  return res
    .status(200)
    .cookie('accessToken', accessToken, options)
    .cookie('refreshToken', refreshToken, options)
    .json(
      new APIResponse(
        200,
        { accessToken, ...(isMobileClient(req) && { refreshToken }) },
        'Access token refreshed',
      ),
    );
});

export const verifyMail = asyncHandler(async (req, res) => {
  const { emailVerificationToken } = req.params as { emailVerificationToken: string };
  const hashed = crypto.createHash('sha512').update(emailVerificationToken).digest('hex');
  const user = await User.findOne({
    emailVerificationToken: hashed,
    emailVerificationTokenExpiry: { $gt: Date.now() },
  });
  if (!user) throw new APIError(400, 'Token does not match or has expired. Please try again');

  user.isEmailVerified = true;
  user.emailVerificationToken = null;
  user.emailVerificationTokenExpiry = null;
  await user.save({ validateBeforeSave: false });

  await emailQueue.add('SendRegisterEmail', {
    to: user.email,
    subject: "You've successfully verified your email address",
    name: user.name,
    intro: 'Thank you for verifying your email. Now your account is more secure',
  });

  return res.status(200).json(new APIResponse(200, {}, 'Email verified successfully'));
});

export const resendEmailVerification = asyncHandler(async (req: AuthenticatedRequest, res) => {
  if (req.user.isEmailVerified) throw new APIError(409, 'Email is already verified');

  const user = (await User.findById(req.user._id))!;

  const { unhashedToken, hashedToken, tempTokenExpiry } = user.generateTempTokens();

  user.emailVerificationToken = hashedToken;
  user.emailVerificationTokenExpiry = tempTokenExpiry;
  await user.save({ validateBeforeSave: false });

  await emailQueue.add('ResendVerificationEmail', {
    to: user.email,
    subject: 'Verify your email address',
    name: user.name,
    intro:
      'You requested a new verification email. Click the button below to verify your email address.',
    instructions: 'Click the button below to verify your email:',
    buttonColor: '#22BC66',
    buttonText: 'Verify Email',
    redirectLink: `${req.protocol}://${req.host}:${process.env.PORT}/api/v1/auth/verify-email/${unhashedToken}`,
  });

  return res.status(200).json(new APIResponse(200, {}, 'Verification email sent'));
});

export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body as { email: string };

  const user = await User.findOne({ email });
  if (!user) throw new APIError(400, 'User with the email does not exist');

  const { unhashedToken, hashedToken, tempTokenExpiry } = user.generateTempTokens();

  user.forgotPasswordToken = hashedToken;
  user.forgotPasswordTokenExpiry = tempTokenExpiry;
  await user.save({ validateBeforeSave: false });

  await emailQueue.add('ForgotPasswordEmail', {
    to: user.email,
    subject: 'Reset your password',
    name: user.name,
    intro:
      'You requested a password reset. Click the button below to set a new password. This link expires in 20 minutes.',
    instructions: 'Click the button below to reset your password:',
    buttonColor: '#FF6B6B',
    buttonText: 'Reset Password',
    redirectLink: `${req.protocol}://${req.host}:${process.env.PORT}/api/v1/auth/reset-password/${unhashedToken}`,
  });

  return res.status(200).json(new APIResponse(200, {}, 'Password reset email sent'));
});

export const resetPassword = asyncHandler(async (req, res) => {
  const { forgotPasswordToken } = req.params as { forgotPasswordToken: string };
  const { password: newPassword } = req.body as { password: string };

  const hashed = crypto.createHash('sha512').update(forgotPasswordToken).digest('hex');
  const user = await User.findOne({
    forgotPasswordToken: hashed,
    forgotPasswordTokenExpiry: { $gt: Date.now() },
  });
  if (!user) throw new APIError(400, 'Token does not match or has expired. Please try again');

  user.password = newPassword;
  user.forgotPasswordToken = null;
  user.forgotPasswordTokenExpiry = null;
  await user.save({ validateBeforeSave: true });

  await emailQueue.add('ResetPasswordSuccessMail', {
    to: user.email,
    subject: 'Your password has been reset successfully',
    name: user.name,
    intro:
      'Your password has been changed successfully. If you did not make this change, please contact support immediately.',
  });

  return res.status(200).json(new APIResponse(200, {}, 'Password changed successfully'));
});
