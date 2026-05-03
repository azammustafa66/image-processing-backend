import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import type { Request } from 'express';

import { User } from '../models/user.model';
import type { AuthenticatedRequest } from '../types';
import { APIError, APIResponse, options } from '../utils';
import { asyncHandler } from '../utils/asyncHandler';

const isMobileClient = (req: Request) =>
  req.useragent?.isMobile || req.header('X-Client-Type') === 'mobile';

export const register = asyncHandler(async (req, res) => {
  const { email, name, password } = req.body as {
    email?: string;
    name?: string;
    password?: string;
  };
  if (!email || !name || !password) throw new APIError(400, 'Please fill in all the details');

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

  // TODO: Implement bullmq and send a welcome mail and a verify email

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
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) throw new APIError(400, 'Provide all the required details');

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
  await User.findByIdAndUpdate(
    req.user._id,
    { $set: { refreshToken: null } },
    { returnDocument: 'after' },
  );

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

  return res.status(200).json(new APIResponse(200, {}, 'Email verified successfully'));
});

export const resendEmailVerification = asyncHandler(async (req: AuthenticatedRequest, res) => {
  if (req.user.isEmailVerified) throw new APIError(409, 'Email is already verified');

  const user = (await User.findById(req.user._id))!;

  const { unhashedToken: _unhashedToken, hashedToken, tempTokenExpiry } = user.generateTempTokens();

  user.emailVerificationToken = hashedToken;
  user.emailVerificationTokenExpiry = tempTokenExpiry;
  await user.save({ validateBeforeSave: false });

  // TODO: send verification email containing unhashedToken

  return res.status(200).json(new APIResponse(200, {}, 'Verification email sent'));
});

export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body as { email?: string };
  if (!email) throw new APIError(400, 'Please send valid credentials');

  const user = await User.findOne({ email });
  if (!user) throw new APIError(400, 'User with the email does not exist');

  const { unhashedToken: _unhashedToken, hashedToken, tempTokenExpiry } = user.generateTempTokens();

  user.forgotPasswordToken = hashedToken;
  user.forgotPasswordTokenExpiry = tempTokenExpiry;
  await user.save({ validateBeforeSave: false });

  // TODO: send forgot password email containing unhashedToken

  return res.status(200).json(new APIResponse(200, {}, 'Verification email sent'));
});

export const resetPassword = asyncHandler(async (req, res) => {
  const { forgotPasswordToken } = req.params as { forgotPasswordToken: string };
  const { password: newPassword } = req.body as { password?: string };
  if (!newPassword) throw new APIError(400, 'Password is required to change existing one');

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

  // TODO: send password reset successfull email

  return res.status(200).json(new APIResponse(200, {}, 'Password changed successfully'));
});
