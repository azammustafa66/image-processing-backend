import multer from 'multer';

import type { ImageMimeType } from '../types';
import { APIError } from '../utils';

const ALLOWED_MIME_TYPES: ImageMimeType[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/tiff',
  'image/avif',
  'image/svg+xml',
  'image/bmp',
  'image/x-icon',
];

const MAX_SIZE_BYTES = Number(process.env.MAX_UPLOAD_SIZE_MB ?? 25) * 1024 * 1024;

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_SIZE_BYTES,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype as ImageMimeType)) {
      cb(null, true);
    } else {
      cb(new APIError(415, `Unsupported file type: ${file.mimetype}. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`));
    }
  },
});
