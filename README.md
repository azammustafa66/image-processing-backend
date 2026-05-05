# Image Processing Backend

A Cloudinary-like image processing backend built with Bun, Express, MongoDB, AWS S3, and Redis.

## Tech Stack

- **Runtime** — Bun
- **Framework** — Express v5
- **Database** — MongoDB with Mongoose
- **Storage** — AWS S3
- **Cache** — Redis
- **Image Processing** — Sharp
- **Auth** — JWT (access + refresh tokens)
- **Validation** — Zod v4
- **Queue** — BullMQ (email jobs)

## Features

- JWT auth with access (15m) + refresh (10d) token rotation
- Mobile vs web client detection — refresh token in body for mobile, httpOnly cookie for web
- Email verification and forgot password flows
- Image upload to S3 with Sharp metadata extraction
- Image transformations — resize, crop, rotate, flip, mirror, grayscale, sepia, format conversion, quality control
- Redis caching for transforms — same image + same config returns instantly with `X-Cache: HIT`
- Pagination on image listing
- Rate limiting on the transform endpoint (10 req/min)
- Multer file validation — type and size limits

## Project Structure

```text
├── index.ts                    # Entry point
└── src/
    ├── app.ts                  # Express app, middleware, error handler
    ├── controllers/
    │   ├── auth.controller.ts
    │   └── image.controller.ts
    ├── db/
    │   └── index.ts            # MongoDB connection
    ├── jobs/
    │   └── emailQueue.ts       # BullMQ email queue and worker
    ├── middlewares/
    │   ├── auth.middleware.ts  # JWT verification
    │   ├── multer.middleware.ts
    │   ├── rateLimit.middleware.ts
    │   └── validate.middleware.ts
    ├── models/
    │   ├── user.model.ts
    │   ├── image.model.ts
    │   └── transformedimage.model.ts
    ├── routes/
    │   ├── index.ts
    │   ├── auth.routes.ts
    │   └── image.routes.ts
    ├── types/
    │   └── index.ts
    ├── utils/
    │   ├── apiError.ts
    │   ├── apiResponse.ts
    │   ├── asyncHandler.ts
    │   ├── constants.ts
    │   ├── redis.ts
    │   └── storage.ts          # S3 upload, delete, presigned URL
    └── validators/
        └── index.ts            # Zod schemas
```

## Environment Variables

```env
PORT=3000
CORS_ORIGIN=http://localhost:5173

# MongoDB
MONGO_URI=mongodb://...

# JWT
ACCESS_TOKEN_SECRET=
ACCESS_TOKEN_EXPIRY=15m
REFRESH_TOKEN_SECRET=
REFRESH_TOKEN_EXPIRY=10d

# AWS S3
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
STORAGE_REGION=us-east-1
STORAGE_BUCKET=

# Redis
REDIS_HOST=
REDIS_PORT=6379
REDIS_PASSWORD=

# Multer
MAX_UPLOAD_SIZE_MB=25
```

## Getting Started

```bash
bun install
bun index.ts
```

## API Reference

### Auth — `/api/v1/auth`

| Method | Endpoint                     | Auth | Description               |
| ------ | ---------------------------- | ---- | ------------------------- |
| POST   | `/register`                  | —    | Register new user         |
| POST   | `/login`                     | —    | Login                     |
| POST   | `/refresh-token`             | —    | Rotate refresh token      |
| POST   | `/logout`                    | ✓    | Logout                    |
| PATCH  | `/verify-email/:token`       | —    | Verify email              |
| POST   | `/resend-email-verification` | ✓    | Resend verification email |
| POST   | `/forgot-password`           | —    | Request password reset    |
| PATCH  | `/reset-password/:token`     | —    | Reset password            |

### Images — `/api/v1/images`

All image routes require a Bearer token.

| Method | Endpoint         | Description                                      |
| ------ | ---------------- | ------------------------------------------------ |
| GET    | `/`              | List images (paginated)                          |
| POST   | `/`              | Upload image (multipart `image` field)           |
| GET    | `/:id`           | Get image by ID                                  |
| DELETE | `/:id`           | Delete image + all its transforms from S3 and DB |
| POST   | `/:id/transform` | Transform image                                  |

### Transform Request Body

```json
{
  "transformations": {
    "resize": { "width": 800, "height": 600 },
    "crop": { "width": 400, "height": 400, "x": 0, "y": 0 },
    "rotate": 90,
    "flip": true,
    "mirror": false,
    "format": "webp",
    "quality": 80,
    "compress": false,
    "filters": {
      "grayscale": false,
      "sepia": true
    }
  }
}
```

### Pagination

```http
GET /api/v1/images?page=1&limit=10
```

Response includes:

```json
{
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 42,
    "totalPages": 5
  }
}
```

### Supported Image Formats

Upload: `jpeg`, `png`, `webp`, `gif`, `tiff`, `avif`, `svg+xml`, `bmp`, `x-icon`

Transform output: `jpeg`, `png`, `webp`, `avif`, `tiff`, `gif`

## Caching

Transformed images are cached in Redis for 24 hours. The response includes an `X-Cache` header:

- `X-Cache: HIT` — served from cache
- `X-Cache: MISS` — freshly processed and cached
