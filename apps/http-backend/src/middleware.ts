import { NextFunction, Request, Response } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";

import { JWT_SECRET } from "@repo/backend-common/config";
import rateLimit from "express-rate-limit";

// Augment Express's Request so `req.userId` is typed (no more @ts-ignore).
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

// JWT auth middleware
export function middleware(req: Request, res: Response, next: NextFunction) {
  const token = req.headers["authorization"];

  if (!token) {
    return res.status(403).json({ message: "unauthorized" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    req.userId = decoded.userId as string;
    next();
  } catch {
    return res.status(403).json({ message: "unauthorized" });
  }
}

// Signup rate limiter
export const signupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});
