import { model, Schema, Types } from 'mongoose';
import { type ITransformedImage } from '../types';

const transformedImageSchema = new Schema<ITransformedImage>(
  {
    originalImage: { type: Types.ObjectId, ref: 'Image', required: true },
    transformations: { type: Schema.Types.Mixed, required: true },
    resultURL: { type: String, required: true },
    outputFormat: { type: String, required: true, default: '' },
    size: { type: Number, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
  },
  { timestamps: true },
);

export const TransformedImage = model('TransformedImage', transformedImageSchema);
