import type { Request } from 'express';
import { Document, Types } from 'mongoose';

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

export type ImageMimeType =
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'image/gif'
  | 'image/tiff'
  | 'image/avif'
  | 'image/svg+xml'
  | 'image/bmp'
  | 'image/x-icon';

export interface IImage extends Document {
  owner: Types.ObjectId;
  originalURL: string;
  filename: string;
  mimetype: ImageMimeType;
  size: number;
  width: number;
  height: number;
}

export interface TransformationConfig {
  resize?: { width: number; height: number };
  crop?: { width: number; height: number; x: number; y: number };
  rotate?: number;
  flip?: boolean;
  mirror?: boolean;
  format?: string;
  quality?: number;
  compress?: boolean;
  filters?: { grayscale?: boolean; sepia?: boolean };
  watermark?: { text: string; position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center'; opacity: number };
}

export interface ITransformedImage extends Document {
  originalImage: Types.ObjectId;
  transformations: TransformationConfig;
  resultURL: string;
  outputFormat: string;
  size: number;
  width: number;
  height: number;
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
