import crypto from 'crypto';
import sharp from 'sharp';

import { Image } from '../models/image.model';
import { TransformedImage } from '../models/transformedimage.model';
import type { AuthenticatedRequest, ImageMimeType, TransformationConfig } from '../types';
import { APIError, APIResponse, asyncHandler, client, deleteFile, uploadFile } from '../utils';

// ─── Upload ───────────────────────────────────────────────────────────────────

export const uploadImage = asyncHandler(async (req: AuthenticatedRequest, res) => {
  if (!req.file) throw new APIError(400, 'No image provided');

  // sharp reads the buffer to get dimensions — no extra network call
  const { width, height } = await sharp(req.file.buffer).metadata();
  const key = `images/${req.user._id.toString('hex')}/${Date.now()}-${req.file.originalname}`;
  const originalURL = await uploadFile(req.file.buffer, key, req.file.mimetype);

  const image = await Image.create({
    owner: req.user._id,
    originalURL,
    filename: req.file.originalname,
    mimetype: req.file.mimetype as ImageMimeType,
    size: req.file.size,
    width,
    height,
  });

  return res.status(201).json(new APIResponse(201, image, 'Image uploaded successfully'));
});

// ─── Get ──────────────────────────────────────────────────────────────────────

export const getImage = asyncHandler(async (req: AuthenticatedRequest, res) => {
  const image = await Image.findOne({ _id: req.params['id'], owner: req.user._id });
  if (!image) throw new APIError(404, 'Image not found');

  return res.status(200).json(new APIResponse(200, image, 'Image fetched successfully'));
});

// ─── List ─────────────────────────────────────────────────────────────────────

export const listImages = asyncHandler(async (req: AuthenticatedRequest, res) => {
  const page = Math.max(1, Number(req.query['page']) || 1);
  const limit = Math.min(100, Number(req.query['limit']) || 10);
  const skip = (page - 1) * limit;

  const [data, totalImages] = await Promise.all([
    Image.find({ owner: req.user._id }).skip(skip).limit(limit).sort({ createdAt: -1 }),
    Image.countDocuments({ owner: req.user._id }),
  ]);

  return res.status(200).json(
    new APIResponse(
      200,
      {
        data,
        pagination: { page, limit, totalImages, totalPages: Math.ceil(totalImages / limit) },
      },
      'Images fetched successfully',
    ),
  );
});

// ─── Transform ────────────────────────────────────────────────────────────────

export const transformImage = asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const transformations = req.body.transformations as TransformationConfig;

  const image = await Image.findOne({ _id: id, owner: req.user._id });
  if (!image) throw new APIError(404, 'Image not found');

  // deterministic cache key — same image + same config always hits the same key
  const hash = crypto
    .createHash('sha256')
    .update(JSON.stringify(transformations, Object.keys(transformations).sort()))
    .digest('hex');
  const cacheKey = `transform:${id}:${hash}`;
  const cached = await client.get(cacheKey);

  if (cached) {
    res.set('X-Cache', 'HIT');
    return res.json(new APIResponse(200, { url: cached }, 'From cache'));
  }

  const response = await fetch(image.originalURL);
  const originalBuffer = Buffer.from(await response.arrayBuffer());
  // ── Sharp pipeline ──────────────────────────────────────────────────────────

  let pipeline = sharp(originalBuffer);

  if (transformations.crop) {
    pipeline = pipeline.extract({
      left: transformations.crop.x,
      top: transformations.crop.y,
      width: transformations.crop.width,
      height: transformations.crop.height,
    });
  }

  if (transformations.resize) {
    pipeline = pipeline.resize({
      width: transformations.resize.width,
      height: transformations.resize.height,
      fit: 'inside', // maintains aspect ratio, fits within bounds
      withoutEnlargement: true,
    });
  }

  if (transformations.rotate) {
    pipeline = pipeline.rotate(transformations.rotate); // non-90° angles get background fill
  }

  if (transformations.flip) pipeline = pipeline.flip(); // vertical   (top ↔ bottom)
  if (transformations.mirror) pipeline = pipeline.flop(); // horizontal (left ↔ right) — sharp calls this flop

  if (transformations.filters?.grayscale) pipeline = pipeline.grayscale();

  if (transformations.filters?.sepia) {
    // no built-in sepia — simulate with a recomb colour matrix
    pipeline = pipeline.recomb([
      [0.3588, 0.7044, 0.1368],
      [0.299, 0.587, 0.114],
      [0.2392, 0.4696, 0.0912],
    ]);
  }

  // format + quality go together at the end of the pipeline
  const outputFormat = (transformations.format ?? image.mimetype.split('/')[1]) as
    | 'jpeg'
    | 'png'
    | 'webp'
    | 'avif'
    | 'tiff'
    | 'gif';

  pipeline = pipeline.toFormat(outputFormat, {
    quality: transformations.quality ?? 80,
    lossless: transformations.compress ?? false,
  });

  const resultBuffer = await pipeline.toBuffer();
  const { width, height, size } = await sharp(resultBuffer).metadata();

  const resultKey = `transforms/${image.owner.toString('hex')}/${image._id}/${Date.now()}.${outputFormat}`;
  const resultURL = await uploadFile(resultBuffer, resultKey, `image/${outputFormat}`);

  await client.set(cacheKey, resultURL, { EX: 86400 });

  const transformed = await TransformedImage.create({
    originalImage: image._id,
    transformations,
    resultURL,
    outputFormat,
    size,
    width,
    height,
  });

  res.set('X-Cache', 'MISS');
  return res.status(200).json(new APIResponse(200, transformed, 'Image transformed successfully'));
});

export const deleteImage = asyncHandler(async (req: AuthenticatedRequest, res) => {
  const image = await Image.findOne({ _id: req.params['id'], owner: req.user._id });
  if (!image) throw new APIError(404, 'Image not found');

  const key = image.originalURL.split('.amazonaws.com')[1] as string;

  await Promise.all([
    deleteFile(key),
    image.deleteOne(),
    TransformedImage.deleteMany({ originalImage: image._id }),
  ]);

  return res.status(200).json(new APIResponse(200, null, 'Image deleted successfully'));
});
