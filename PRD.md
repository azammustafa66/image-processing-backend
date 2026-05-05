# Product Requirements Document

## Image Processing Backend Service

**Version:** 1.2  
**Date:** 2026-05-05  
**Status:** Complete

---

## 1. Overview

A RESTful backend service for image upload, transformation, and retrieval — similar in scope to Cloudinary. Users authenticate via JWT, upload images to cloud storage, apply on-demand transformations, and fetch results in various formats.

---

## 2. Goals

- Provide a secure, authenticated API for image management.
- Support a rich set of image transformations (resize, crop, rotate, watermark, filters, etc.).
- Store images durably in cloud object storage.
- Return transformed images efficiently, with caching to avoid redundant processing.
- Rate-limit transformation requests to prevent abuse.

---

## 3. Non-Goals

- Frontend / UI (API only).
- Video processing.
- AI-based image recognition or tagging.
- Multi-tenant team/organization management.

---

## 4. Tech Stack

| Concern          | Choice                                         |
| ---------------- | ---------------------------------------------- |
| Runtime          | Bun                                            |
| Framework        | Express.js v5                                  |
| Database         | MongoDB (Mongoose v9)                          |
| Image Processing | Sharp                                          |
| Cloud Storage    | AWS S3                                         |
| Auth             | JWT — access token (15m) + refresh token (10d) |
| Caching          | Redis (npm redis package)                      |
| Rate Limiting    | express-rate-limit                             |
| File Upload      | Multer (memory storage)                        |
| Validation       | Zod v4                                         |
| Password Hashing | bcryptjs (cost 10)                             |
| Email            | Nodemailer + Mailtrap + BullMQ queue           |

---

## 5. System Architecture

```text
Client
  │
  ▼
Express API  (Bun runtime)
  ├── Auth routes     (/register, /login, /refresh-token, /logout, /verify-email, ...)
  └── Image routes    (/images, /images/:id, /images/:id/transform)
        │
        ├── Multer      ──▶  AWS S3
        ├── Sharp       ──▶  Transform pipeline
        ├── Redis       ──▶  Transform result cache (24h TTL)
        ├── BullMQ      ──▶  Email job queue ──▶ Nodemailer (Mailtrap)
        └── Mongoose    ──▶  MongoDB (users, images, transformations)
```

---

## 6. Data Models

### User (Mongoose)

| Field                        | Type           | Notes                          |
| ---------------------------- | -------------- | ------------------------------ |
| name                         | String         | required                       |
| email                        | String         | required, unique, indexed      |
| password                     | String         | bcrypt hashed, pre-save hook   |
| isEmailVerified              | Boolean        | default false                  |
| emailVerificationToken       | String \| null | SHA-512 hashed                 |
| emailVerificationTokenExpiry | Date \| null   | 20 min TTL                     |
| forgotPasswordToken          | String \| null | SHA-512 hashed                 |
| forgotPasswordTokenExpiry    | Date \| null   | 20 min TTL                     |
| refreshToken                 | String \| null | stored for rotation/revocation |

#### Instance methods

- `isPasswordValid(password)` — bcrypt compare
- `generateAccessToken()` — signs `{ _id, email }`, 15m expiry
- `generateRefreshToken()` — signs `{ _id }`, 10d expiry
- `generateTempTokens()` — returns `{ unhashedToken, hashedToken, tempTokenExpiry }`

### Image (Mongoose)

| Field       | Type          | Notes                    |
| ----------- | ------------- | ------------------------ |
| owner       | ObjectId      | ref User                 |
| originalURL | String        | AWS S3 URL               |
| filename    | String        | Original filename        |
| mimetype    | ImageMimeType | e.g. `image/jpeg`        |
| size        | Number        | Bytes                    |
| width       | Number        | Pixels                   |
| height      | Number        | Pixels                   |
| createdAt   | Date          | auto                     |
| updatedAt   | Date          | auto                     |

### TransformedImage (Mongoose)

| Field           | Type     | Notes                                |
| --------------- | -------- | ------------------------------------ |
| originalImage   | ObjectId | ref Image                            |
| transformations | Mixed    | Applied transformation config (POJO) |
| resultURL       | String   | AWS S3 URL of result                 |
| outputFormat    | String   | Output format                        |
| width           | Number   | Pixels                               |
| height          | Number   | Pixels                               |
| size            | Number   | Bytes                                |
| createdAt       | Date     | auto                                 |

---

## 7. API Specification

### 7.1 Authentication — `/api/v1/auth`

| Method | Endpoint                     | Auth | Description                  |
| ------ | ---------------------------- | ---- | ---------------------------- |
| POST   | `/register`                  | —    | Register, sends verify email |
| POST   | `/login`                     | —    | Login                        |
| POST   | `/refresh-token`             | —    | Rotate refresh token         |
| POST   | `/logout`                    | ✓    | Logout                       |
| PATCH  | `/verify-email/:token`       | —    | Verify email address         |
| POST   | `/resend-email-verification` | ✓    | Resend verification email    |
| POST   | `/forgot-password`           | —    | Request password reset       |
| PATCH  | `/reset-password/:token`     | —    | Reset password               |

Refresh token is returned in `httpOnly` cookie for web clients, and additionally in the response body for mobile clients (`X-Client-Type: mobile` header or mobile User-Agent).

---

### 7.2 Image Management — `/api/v1/images`

All image endpoints require `Authorization: Bearer <accessToken>`.

| Method | Endpoint         | Description                                      |
| ------ | ---------------- | ------------------------------------------------ |
| GET    | `/`              | List images (paginated)                          |
| POST   | `/`              | Upload image (multipart `image` field)           |
| GET    | `/:id`           | Get image by ID                                  |
| DELETE | `/:id`           | Delete image + all transforms from S3 and DB     |
| POST   | `/:id/transform` | Transform image (rate limited, Redis cached)     |

**Upload:** `multipart/form-data`, field name `image`, max 25 MB. Supported types: `jpeg`, `png`, `webp`, `gif`, `tiff`, `avif`, `svg+xml`, `bmp`, `x-icon`.

**Errors:** `400` no file · `404` not found · `415` unsupported type · `429` rate limit exceeded

---

### 7.3 Rate Limits

| Endpoint                     | Limit               |
| ---------------------------- | ------------------- |
| `POST /images/:id/transform` | 10 req / min per IP |

---

## 8. Transformation Reference

| Key                 | Input                                                     | Notes                          |
| ------------------- | --------------------------------------------------------- | ------------------------------ |
| `resize`            | `{ width, height }`                                       | Fits within bounds, no enlarge |
| `crop`              | `{ width, height, x, y }`                                 | Extracts region at (x, y)      |
| `rotate`            | `number` (degrees)                                        | Non-90° angles fill background |
| `flip`              | `boolean`                                                 | Vertical flip (top ↔ bottom)   |
| `mirror`            | `boolean`                                                 | Horizontal flip (left ↔ right) |
| `format`            | `"jpeg" \| "png" \| "webp" \| "gif" \| "tiff" \| "avif"` | Re-encode output               |
| `quality`           | `1–100`                                                   | Lossy compression quality      |
| `compress`          | `boolean`                                                 | Lossless mode                  |
| `filters.grayscale` | `boolean`                                                 | Convert to grayscale           |
| `filters.sepia`     | `boolean`                                                 | Sepia tone via recomb matrix   |

---

## 9. Caching Strategy

- Before processing, the API checks Redis for a cached result URL keyed by `transform:{imageId}:{hash}` where `hash` = SHA-256 of the sorted transformation config JSON. TTL: 24 hours.
- Cache hit → `X-Cache: HIT`, returns stored S3 URL immediately, no reprocessing.
- Cache miss → `X-Cache: MISS`, runs Sharp pipeline, uploads to S3, stores URL in Redis.
- S3 key: `transforms/{ownerId}/{imageId}/{timestamp}.{format}`

---

## 10. Security

- Passwords hashed with bcryptjs (cost factor 10).
- Access token: short-lived JWT (15m), signed with `ACCESS_TOKEN_SECRET`.
- Refresh token: long-lived JWT (10d), rotation enforced — reuse of old token is rejected.
- Image ownership enforced on every request (`owner` field matched against JWT `_id`).
- File type validated by MIME type allowlist at Multer middleware level.
- Max upload size: 25 MB (configurable via `MAX_UPLOAD_SIZE_MB`).
- CORS restricted to `CORS_ORIGIN` env variable.

---

## 11. Error Response Format

```json
{
  "success": false,
  "message": "Human-readable description",
  "errors": []
}
```

---

## 12. Environment Variables

| Variable                | Description                          |
| ----------------------- | ------------------------------------ |
| `PORT`                  | Server port (default `3000`)         |
| `CORS_ORIGIN`           | Comma-separated allowed origins      |
| `MONGO_URI`             | MongoDB connection string            |
| `ACCESS_TOKEN_SECRET`   | JWT signing secret for access tokens |
| `ACCESS_TOKEN_EXPIRY`   | e.g. `15m`                           |
| `REFRESH_TOKEN_SECRET`  | JWT signing secret for refresh tokens|
| `REFRESH_TOKEN_EXPIRY`  | e.g. `10d`                           |
| `REDIS_HOST`            | Redis host                           |
| `REDIS_PORT`            | Redis port (default `6379`)          |
| `REDIS_PASSWORD`        | Redis password                       |
| `STORAGE_BUCKET`        | S3 bucket name                       |
| `STORAGE_REGION`        | S3 region (default `us-east-1`)      |
| `AWS_ACCESS_KEY_ID`     | AWS access key                       |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key                       |
| `MAX_UPLOAD_SIZE_MB`    | Upload size limit (default `25`)     |
| `MAILTRAP_HOST`         | Mailtrap SMTP host                   |
| `MAILTRAP_PORT`         | Mailtrap SMTP port (default `587`)   |
| `MAILTRAP_USER`         | Mailtrap SMTP user                   |
| `MAILTRAP_PASS`         | Mailtrap SMTP password               |
| `MAILTRAP_FROM`         | Sender email address                 |
| `APP_NAME`              | App name shown in emails             |
| `APP_URL`               | Base URL used in email links         |

---

## 13. Out-of-Scope / Future

- Watermark / text overlay on images.
- Image tagging and search.
- Signed/expiring URLs for private bucket access.
- Webhook callbacks for async transformation jobs.
- Usage billing and quotas per user tier.
- CDN integration for edge delivery.
