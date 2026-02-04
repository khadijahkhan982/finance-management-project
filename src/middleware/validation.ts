import { Request, Response, NextFunction } from 'express';
import { ZodError, ZodTypeAny, ZodIssue } from 'zod';

export const validate = (schema: ZodTypeAny) => 
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      return next();
    } catch (error: unknown) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          status: 'fail',
          errors: error.issues.map((err: ZodIssue) => ({
            field: err.path.length > 1 ? err.path[1] : err.path[0],
            message: err.message
          })),
        });
      }
      return res.status(500).json({ message: "Internal server error during validation" });
    }
  };

export const validateOwnership = (req: any, res: Response, next: NextFunction) => {
  const targetId = Number(req.params.userId);
  const authId = Number(req.authenticatedUserId);

  console.log(`[OWNERSHIP] Target: ${targetId} | Auth: ${authId}`);

  if (!authId) {
    return res.status(500).json({ message: "Auth ID missing. Is 'protect' middleware applied?" });
  }

  if (targetId !== authId) {
    return res.status(403).json({ message: "Forbidden: Not your account." });
  }

  return next();
};