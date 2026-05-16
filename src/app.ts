import { readFileSync } from 'fs';
import { join } from 'path';

import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import * as userAgent from 'express-useragent';

import openAPISpec from './docs/openapi';
import mainRouter from './routes';

const swaggerHtml = readFileSync(join(import.meta.dir, 'docs/swagger.html'), 'utf-8');

const app = express();

app.use(
  express.json(),
  express.urlencoded({ extended: true }),
  cors({
    origin: process.env.CORS_ORIGIN?.split(',') || 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'PUT', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Client-Type'],
    exposedHeaders: ['X-Cache'],
  }),
  cookieParser(),
  userAgent.express(),
);

app.use('/api/v1', mainRouter);
app.get('/docs', (_req, res) => res.setHeader('Content-Type', 'text/html').send(swaggerHtml));
app.get('/docs/spec', (_req, res) => res.json(openAPISpec));

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ success: false, message: err.message, errors: [] });
  }
  return res.status(err.statusCode ?? 500).json({
    success: false,
    message: err.message ?? 'Internal Server Error',
    errors: err.errors ?? [],
  });
});

app.get('/', (_req, res, _next) => res.status(200).json({ message: 'Server up and running' }));

export default app;
