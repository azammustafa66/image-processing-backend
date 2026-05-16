const openAPISpec = {
  openapi: '3.0.3',
  info: {
    title: 'Image Processing API',
    description:
      'A Cloudinary-like REST API for image upload, transformation, and retrieval. Built with Bun, Express, MongoDB, AWS S3, and Redis.',
    version: '1.0.0',
  },
  servers: [{ url: '/api/v1', description: 'API v1' }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
    schemas: {
      APIResponse: {
        type: 'object',
        properties: {
          statusCode: { type: 'integer' },
          data: { type: 'object' },
          message: { type: 'string' },
          success: { type: 'boolean' },
        },
      },
      APIError: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          message: { type: 'string' },
          errors: { type: 'array', items: { type: 'object' } },
        },
      },
      User: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          name: { type: 'string' },
          email: { type: 'string', format: 'email' },
          isEmailVerified: { type: 'boolean' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      Image: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          owner: { type: 'string' },
          originalURL: { type: 'string', format: 'uri' },
          filename: { type: 'string' },
          mimetype: { type: 'string', example: 'image/jpeg' },
          size: { type: 'integer', description: 'Size in bytes' },
          width: { type: 'integer' },
          height: { type: 'integer' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      TransformedImage: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          originalImage: { type: 'string' },
          resultURL: { type: 'string', format: 'uri' },
          outputFormat: { type: 'string', enum: ['jpeg', 'png', 'webp', 'avif', 'tiff', 'gif'] },
          width: { type: 'integer' },
          height: { type: 'integer' },
          size: { type: 'integer' },
          transformations: { type: 'object' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      TransformationConfig: {
        type: 'object',
        properties: {
          resize: {
            type: 'object',
            properties: {
              width: { type: 'integer' },
              height: { type: 'integer' },
            },
          },
          crop: {
            type: 'object',
            properties: {
              width: { type: 'integer' },
              height: { type: 'integer' },
              x: { type: 'integer' },
              y: { type: 'integer' },
            },
          },
          rotate: { type: 'number', description: 'Degrees' },
          flip: { type: 'boolean', description: 'Vertical flip' },
          mirror: { type: 'boolean', description: 'Horizontal flip' },
          format: { type: 'string', enum: ['jpeg', 'png', 'webp', 'avif', 'tiff', 'gif'] },
          quality: { type: 'integer', minimum: 1, maximum: 100 },
          compress: { type: 'boolean', description: 'Lossless compression' },
          filters: {
            type: 'object',
            properties: {
              grayscale: { type: 'boolean' },
              sepia: { type: 'boolean' },
            },
          },
        },
      },
    },
  },
  paths: {
    // ─── Auth ──────────────────────────────────────────────────────────────────
    '/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Register a new user',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'email', 'password'],
                properties: {
                  name: { type: 'string', minLength: 3 },
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string', minLength: 8, maxLength: 20 },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'User registered. Verification email sent.' },
          409: { description: 'Email already registered' },
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Login',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Login successful, tokens set in cookies' },
          400: { description: 'Invalid credentials' },
        },
      },
    },
    '/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'Logout',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Logged out, cookies cleared' },
          401: { description: 'Unauthorized' },
        },
      },
    },
    '/auth/refresh-token': {
      post: {
        tags: ['Auth'],
        summary: 'Rotate refresh token',
        description: 'Send refresh token in cookie or request body (mobile)',
        responses: {
          200: { description: 'New access token issued' },
          401: { description: 'Invalid or expired refresh token' },
        },
      },
    },
    '/auth/verify-email/{emailVerificationToken}': {
      patch: {
        tags: ['Auth'],
        summary: 'Verify email address',
        parameters: [
          {
            name: 'emailVerificationToken',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          200: { description: 'Email verified' },
          400: { description: 'Token invalid or expired' },
        },
      },
    },
    '/auth/resend-email-verification': {
      post: {
        tags: ['Auth'],
        summary: 'Resend verification email',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Verification email sent' },
          409: { description: 'Email already verified' },
        },
      },
    },
    '/auth/forgot-password': {
      post: {
        tags: ['Auth'],
        summary: 'Request password reset email',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email'],
                properties: { email: { type: 'string', format: 'email' } },
              },
            },
          },
        },
        responses: {
          200: { description: 'Reset email sent' },
          400: { description: 'User not found' },
        },
      },
    },
    '/auth/reset-password/{forgotPasswordToken}': {
      patch: {
        tags: ['Auth'],
        summary: 'Reset password',
        parameters: [
          {
            name: 'forgotPasswordToken',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['password'],
                properties: { password: { type: 'string', minLength: 8, maxLength: 20 } },
              },
            },
          },
        },
        responses: {
          200: { description: 'Password reset successful' },
          400: { description: 'Token invalid or expired' },
        },
      },
    },

    // ─── Images ────────────────────────────────────────────────────────────────
    '/images': {
      get: {
        tags: ['Images'],
        summary: 'List images (paginated)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10, maximum: 100 } },
        ],
        responses: {
          200: {
            description: 'Paginated list of images',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: { type: 'array', items: { $ref: '#/components/schemas/Image' } },
                    pagination: {
                      type: 'object',
                      properties: {
                        page: { type: 'integer' },
                        limit: { type: 'integer' },
                        total: { type: 'integer' },
                        totalPages: { type: 'integer' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Images'],
        summary: 'Upload an image',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['image'],
                properties: {
                  image: { type: 'string', format: 'binary' },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description: 'Image uploaded',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Image' },
              },
            },
          },
          400: { description: 'No file provided' },
          415: { description: 'Unsupported file type' },
        },
      },
    },
    '/images/{id}': {
      get: {
        tags: ['Images'],
        summary: 'Get image by ID',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: {
            description: 'Image metadata',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Image' },
              },
            },
          },
          404: { description: 'Image not found' },
        },
      },
      delete: {
        tags: ['Images'],
        summary: 'Delete image and all its transforms',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Image and transforms deleted from S3 and DB' },
          404: { description: 'Image not found' },
        },
      },
    },
    '/images/{id}/transform': {
      post: {
        tags: ['Images'],
        summary: 'Transform an image',
        description:
          'Rate limited to 10 req/min. Results cached in Redis for 24h. Check `X-Cache` header for HIT/MISS.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['transformations'],
                properties: {
                  transformations: { $ref: '#/components/schemas/TransformationConfig' },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Transformed image',
            headers: {
              'X-Cache': {
                schema: { type: 'string', enum: ['HIT', 'MISS'] },
                description: 'Whether result was served from Redis cache',
              },
            },
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/TransformedImage' },
              },
            },
          },
          404: { description: 'Image not found' },
          429: { description: 'Rate limit exceeded' },
        },
      },
    },
  },
};

export default openAPISpec;
