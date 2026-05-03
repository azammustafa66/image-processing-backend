import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { model, Schema } from 'mongoose';
import jwt from 'jsonwebtoken';

import { type IUser } from '../types';

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, unique: true, index: true },
    password: { type: String, required: true },
    role: { type: String, required: true, default: 'user' },
    isEmailVerified: { type: Boolean, default: false },
    emailVerificationToken: { type: String, default: null },
    emailVerificationTokenExpiry: { type: Date, default: null },
    forgotPasswordToken: { type: String, default: null },
    forgotPasswordTokenExpiry: { type: Date, default: null },
    refreshToken: { type: String, default: null },
  },
  { timestamps: true },
);

userSchema.pre('save', async function (this) {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 10);
});

userSchema.method('isPasswordValid', async function (password: string) {
  return await bcrypt.compare(password, this.password);
});

userSchema.method('generateAccessToken', function () {
  return jwt.sign(
    { _id: this._id.toString(), email: this.email },
    process.env.ACCESS_TOKEN_SECRET as string,
    {
      expiresIn: '15m',
    },
  );
});

userSchema.method('generateRefreshToken', function () {
  return jwt.sign({ _id: this._id.toString() }, process.env.REFRESH_TOKEN_SECRET as string, {
    expiresIn: '10d',
  });
});

userSchema.method('generateTempTokens', function () {
  const unhashedToken = crypto.randomBytes(20).toString('hex');
  const hashedToken = crypto.createHash('sha512').update(unhashedToken).digest('hex');
  const tempTokenExpiry = new Date(Date.now() + 15 * 60 * 1000); // expires in 15 mins.

  return { unhashedToken, hashedToken, tempTokenExpiry };
});

export const User = model('User', userSchema);
