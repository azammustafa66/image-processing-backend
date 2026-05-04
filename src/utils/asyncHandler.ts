import type { Request, Response, NextFunction, RequestHandler } from 'express';

// T defaults to Request if no custom type is provided
export const asyncHandler = <T = Request>(
  fn: (req: T, res: Response, next: NextFunction) => Promise<any>,
): RequestHandler => {
  return (req, res, next) => {
    // We cast req to T here once, so you don't have to do it in your routes
    fn(req as unknown as T, res, next).catch(next);
  };
};
