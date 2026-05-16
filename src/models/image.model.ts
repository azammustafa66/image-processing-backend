import { model, Schema, Types } from 'mongoose';

import { type IImage } from '../types';

const imageSchema = new Schema<IImage>(
  {
    owner: { type: Types.ObjectId, ref: 'User', required: true, index: true },
    originalURL: { type: String, required: true, trim: true },
    filename: { type: String, required: true },
    mimetype: { type: String, required: true, default: 'image/jpeg' },
    size: { type: Number, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
  },
  { timestamps: true },
);

export const Image = model('Image', imageSchema);
