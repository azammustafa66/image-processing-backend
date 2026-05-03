import jwt from 'jsonwebtoken';

import { User } from '../models/user.model';
import type { AuthenticatedRequest } from '../types';
import { APIError, asyncHandler } from '../utils';

export const verifyJWT = asyncHandler<AuthenticatedRequest>(async (req, _res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '') ?? req.cookies?.accessToken;

  if (!token) throw new APIError(401, 'Unauthorized');

  const { _id } = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET as string) as {
    _id: string;
  };

  const user = await User.findById(_id).select(
    '-password -refreshToken -forgotPasswordToken -forgotPasswordTokenExpiry -emailVerificationToken -emailVerificationTokenExpiry',
  );
  if (!user) throw new APIError(401, 'Invalid token. Please login again');

  req.user = user;
  next();
});
