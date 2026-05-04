import rateLimit from 'express-rate-limit';

export const transformRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  message: { success: false, message: 'Too many transform requests' },
  standardHeaders: true,
  legacyHeaders: false,
});
