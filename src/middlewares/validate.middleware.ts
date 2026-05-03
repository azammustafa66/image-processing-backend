import type { ZodType } from 'zod';

import { APIError, asyncHandler } from '../utils';

export const validate = (schema: ZodType, target: 'body' | 'params' | 'query' = 'body') =>
  asyncHandler(async (req, _res, next) => {
    const result = schema.safeParse(req[target]);
    if (!result.success) throw new APIError(400, 'Validation failed', result.error.issues);
    req[target] = result.data;
    next();
  });
