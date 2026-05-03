import type { Request } from 'express';
import { Document } from 'mongoose';

export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  role: 'user' | 'admin';
  isEmailVerified: boolean;
  emailVerificationToken: string | null;
  emailVerificationTokenExpiry: Date | null;
  forgotPasswordToken: string | null;
  forgotPasswordTokenExpiry: Date | null;
  refreshToken: string | null;

  isPasswordValid(password: string): Promise<boolean>;
  generateAccessToken(): string;
  generateRefreshToken(): string;
  generateTempTokens(): { unhashedToken: string; hashedToken: string; tempTokenExpiry: Date };
}


export type TemporaryToken = {
  unhashedToken: string;
  hashedToken: string;
  tempTokenExpiry: Date;
};

export type DecodedToken = {
  _id: string;
  email: string;
};

export interface AuthenticatedRequest extends Request {
  user: IUser;
}
