# Product Requirements Document

## Image Processing Backend Service

**Version:** 1.1  
**Date:** 2026-05-03  
**Status:** In Progress

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
| Framework        | Express.js                                     |
| Database         | MongoDB (Mongoose)                             |
| Image Processing | Sharp                                          |
| Cloud Storage    | AWS S3 / Cloudflare R2 / GCS                   |
| Auth             | JWT — access token (15m) + refresh token (10d) |
| Caching          | Bun.redis                                      |
| Rate Limiting    | express-rate-limit + Bun.redis store           |
| File Upload      | Multer                                         |
| Password Hashing | bcryptjs                                       |
| Queue (optional) | BullMQ                                         |

---

## 5. System Architecture

```
Client
  │
  ▼
Express API  (Bun runtime)
  ├── Auth routes     (/register, /login, /refresh-token, /logout)
  └── Image routes    (/images, /images/:id, /images/:id/transform)
        │
        ├── Multer      ──▶  Cloud Storage (S3/R2/GCS)
        ├── Sharp       ──▶  Transform pipeline
        ├── Bun.redis   ──▶  Transform result cache + rate limit store
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
| role                         | String         | `'user'` \| `'admin'`          |
| isEmailVerified              | Boolean        | default false                  |
| emailVerificationToken       | String \| null | SHA-512 hashed                 |
| emailVerificationTokenExpiry | Date \| null   | 15 min TTL                     |
| forgotPasswordToken          | String \| null | SHA-512 hashed                 |
| forgotPasswordTokenExpiry    | Date \| null   | 15 min TTL                     |
| refreshToken                 | String \| null | stored for rotation/revocation |

**Instance methods**

- `isPasswordValid(password)` — bcrypt compare
- `generateAccessToken()` — signs `{ _id, email, role }`, 15m expiry
- `generateRefreshToken()` — signs `{ _id }`, 10d expiry
- `generateTemporaryToken()` — returns `{ unhashedToken, hashedToken, tempTokenExpiry }`

### Image (Mongoose)

| Field       | Type     | Notes             |
| ----------- | -------- | ----------------- |
| userId      | ObjectId | ref User          |
| originalUrl | String   | Cloud storage URL |
| filename    | String   | Original filename |
| mimeType    | String   | e.g. `image/jpeg` |
| size        | Number   | Bytes             |
| width       | Number   | Pixels            |
| height      | Number   | Pixels            |
| createdAt   | Date     | auto              |
| updatedAt   | Date     | auto              |

### TransformedImage (Mongoose)

| Field           | Type     | Notes                                |
| --------------- | -------- | ------------------------------------ |
| imageId         | ObjectId | ref Image                            |
| transformations | Mixed    | Applied transformation config (POJO) |
| resultUrl       | String   | Cloud storage URL of result          |
| format          | String   | Output format                        |
| width           | Number   |                                      |
| height          | Number   |                                      |
| size            | Number   | Bytes                                |
| createdAt       | Date     | auto                                 |

---

## 7. API Specification

### 7.1 Authentication

#### `POST /register`

Register a new user.

**Request**

```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123"
}
```

**Response `201`**

```json
{
  "user": { "_id": "...", "name": "John Doe", "email": "john@example.com", "role": "user" },
  "accessToken": "<JWT>",
  "refreshToken": "<JWT>"
}
```

**Errors:** `400` missing fields / weak password · `409` email already taken

---

#### `POST /login`

Authenticate an existing user.

**Request**

```json
{
  "email": "john@example.com",
  "password": "password123"
}
```

**Response `200`** — same shape as register.

**Errors:** `400` missing fields · `401` invalid credentials

---

#### `POST /refresh-token`

Issue a new access token using a valid refresh token.

**Request** — send refresh token in `Authorization: Bearer <token>` or `httpOnly` cookie.

**Response `200`**

```json
{ "accessToken": "<new JWT>" }
```

---

#### `POST /logout`

Revoke the refresh token stored on the user document.

**Auth:** Required  
**Response `200`** — clears refresh token in DB and cookie.

---

### 7.2 Image Management

All image endpoints require `Authorization: Bearer <accessToken>`.

---

#### `POST /images`

Upload a new image.

**Request:** `multipart/form-data`, field `image` (JPEG, PNG, WebP, GIF, TIFF — max 10 MB).

**Response `201`**

```json
{
  "_id": "...",
  "url": "https://storage.example.com/...",
  "filename": "photo.jpg",
  "mimeType": "image/jpeg",
  "size": 204800,
  "width": 1920,
  "height": 1080,
  "createdAt": "..."
}
```

**Errors:** `400` no file / unsupported format · `413` file too large

---

#### `GET /images`

List all images uploaded by the authenticated user (paginated).

**Query Params:** `page` (default 1) · `limit` (default 10, max 100)

**Response `200`**

```json
{
  "data": [
    {
      "_id": "...",
      "url": "...",
      "filename": "...",
      "width": 1920,
      "height": 1080,
      "size": 204800,
      "createdAt": "..."
    }
  ],
  "pagination": { "page": 1, "limit": 10, "total": 42, "totalPages": 5 }
}
```

---

#### `GET /images/:id`

Retrieve metadata and URL for a single image owned by the authenticated user.

**Response `200`**

```json
{
  "_id": "...",
  "url": "...",
  "filename": "photo.jpg",
  "mimeType": "image/jpeg",
  "size": 204800,
  "width": 1920,
  "height": 1080,
  "createdAt": "...",
  "transformations": [
    { "_id": "...", "resultUrl": "...", "transformations": {}, "createdAt": "..." }
  ]
}
```

**Errors:** `404` not found or not owned by user

---

#### `POST /images/:id/transform`

Apply one or more transformations. Results are cached by transformation config hash.

**Request**

```json
{
  "transformations": {
    "resize": { "width": 800, "height": 600 },
    "crop": { "width": 400, "height": 300, "x": 100, "y": 50 },
    "rotate": 90,
    "flip": true,
    "mirror": true,
    "format": "webp",
    "quality": 80,
    "compress": true,
    "filters": { "grayscale": false, "sepia": true },
    "watermark": { "text": "© MyBrand", "position": "bottom-right", "opacity": 0.6 }
  }
}
```

All fields optional; at least one must be provided.

**Response `200`**

```json
{
  "_id": "...",
  "originalImageId": "...",
  "url": "https://storage.example.com/transformed/...",
  "width": 800,
  "height": 600,
  "format": "webp",
  "size": 51200,
  "createdAt": "..."
}
```

**Errors:** `400` no transformations / invalid values · `404` source image not found · `429` rate limit

---

### 7.3 Rate Limits

| Endpoint                     | Limit                  |
| ---------------------------- | ---------------------- |
| `POST /images/:id/transform` | 20 req / min per user  |
| `POST /images`               | 50 req / hour per user |
| Auth endpoints               | 10 req / 15 min per IP |

---

## 8. Transformation Reference

| Key                  | Input                                                                      | Notes                                           |
| -------------------- | -------------------------------------------------------------------------- | ----------------------------------------------- |
| `resize`             | `{ width, height }`                                                        | Maintains aspect ratio if one dimension omitted |
| `crop`               | `{ width, height, x, y }`                                                  | Extracts region at (x, y)                       |
| `rotate`             | `number` (degrees)                                                         | Non-90° angles fill background                  |
| `flip`               | `boolean`                                                                  | Vertical flip                                   |
| `mirror`             | `boolean`                                                                  | Horizontal flip                                 |
| `format`             | `"jpeg" \| "png" \| "webp" \| "gif" \| "tiff" \| "avif"`                   | Re-encode output                                |
| `quality`            | `1–100`                                                                    | Lossy compression quality                       |
| `compress`           | `boolean`                                                                  | Lossless compression                            |
| `filters.grayscale`  | `boolean`                                                                  | Convert to grayscale                            |
| `filters.sepia`      | `boolean`                                                                  | Apply sepia tone                                |
| `watermark.text`     | `string`                                                                   | Text overlay                                    |
| `watermark.position` | `"top-left" \| "top-right" \| "bottom-left" \| "bottom-right" \| "center"` | Placement                                       |
| `watermark.opacity`  | `0.0–1.0`                                                                  | Transparency                                    |

---

## 9. Caching Strategy

- Transformed images are stored in cloud storage with a deterministic key:  
  `transforms/{userId}/{imageId}/{hash}.{format}`  
  where `hash` = SHA-256 of the normalized transformation config.
- Before processing, the API checks `Bun.redis` for a cached result URL keyed by `transform:{imageId}:{hash}`. TTL: 24 hours.
- Cache hit → return stored URL immediately, no reprocessing.

---

## 10. Security Requirements

- Passwords hashed with bcryptjs (cost factor 10).
- Access token: short-lived JWT (15m), signed with `ACCESS_TOKEN_SECRET`.
- Refresh token: long-lived JWT (10d), stored hashed in MongoDB for revocation.
- Image ownership enforced on every request.
- File type validated by magic bytes on upload (not extension alone).
- Max upload size enforced at Multer middleware level (10 MB default).
- CORS restricted to `CORS_ORIGIN` env variable.
- All endpoints served over HTTPS in production.

---

## 11. Error Response Format

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable description",
    "details": {}
  }
}
```

---

## 12. Environment Variables

| Variable                | Description                                 |
| ----------------------- | ------------------------------------------- |
| `PORT`                  | Server port (default `3000`)                |
| `CORS_ORIGIN`           | Comma-separated allowed origins             |
| `MONGO_URI`             | MongoDB connection string                   |
| `ACCESS_TOKEN_SECRET`   | JWT signing secret for access tokens        |
| `ACCESS_TOKEN_EXPIRY`   | e.g. `15m`                                  |
| `REFRESH_TOKEN_SECRET`  | JWT signing secret for refresh tokens       |
| `REFRESH_TOKEN_EXPIRY`  | e.g. `10d`                                  |
| `REDIS_HOST`            | Redis host                                  |
| `REDIS_PORT`            | Redis port                                  |
| `REDIS_PASSWORD`        | Redis password                              |
| `STORAGE_PROVIDER`      | `s3`, `r2`, or `gcs`                        |
| `STORAGE_BUCKET`        | Bucket name                                 |
| `STORAGE_REGION`        | Cloud region                                |
| `AWS_ACCESS_KEY_ID`     | Storage access key                          |
| `AWS_SECRET_ACCESS_KEY` | Storage secret                              |
| `MAX_UPLOAD_SIZE_MB`    | Upload size limit (default `10`)            |
| `MAILTRAP_API_KEY`      | Email service key (for verification emails) |

---

## 13. Known Issues in Current Codebase

| File                                 | Issue                                                                        |
| ------------------------------------ | ---------------------------------------------------------------------------- |
| `src/app.ts:8`                       | `express.json` not invoked — should be `express.json()`                      |
| `src/models/user.model.ts:22`        | `isModified(this.password)` should be `isModified('password')`               |
| `src/models/user.model.ts:27`        | JWT payload is bare string (`this.email`) — should be `{ _id, email, role }` |
| `index.ts`                           | Entry point not wired to `src/app.ts`                                        |
| `src/controllers/auth.controller.ts` | Empty — not implemented                                                      |
| `src/middlewares/auth.middleware.ts` | Empty — not implemented                                                      |
| `src/routes/auth.routes.ts`          | Empty — not implemented                                                      |
| `src/routes/index.ts`                | Empty — not implemented                                                      |

---

## 14. Implementation Order

1. Fix bugs in `src/app.ts` and `src/models/user.model.ts`
2. Wire `index.ts` entry point → start server + connect MongoDB
3. Implement `src/routes/index.ts` + `src/routes/auth.routes.ts`
4. Implement `src/controllers/auth.controller.ts` (register, login, refresh, logout)
5. Implement `src/middlewares/auth.middleware.ts` (JWT verify)
6. Add image model (`src/models/image.model.ts`)
7. Add image routes + controller (upload, list, get)
8. Install Sharp; implement transformation pipeline
9. Integrate cloud storage (S3/R2/GCS)
10. Add Redis caching for transforms
11. Add rate limiting

---

## 15. Out-of-Scope / Future

- Image tagging and search.
- Signed/expiring URLs for private access.
- Webhook callbacks for async transformation jobs.
- Usage billing and quotas per user tier.
- CDN integration for edge delivery.
