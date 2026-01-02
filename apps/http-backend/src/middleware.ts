import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken"

import { JWT_SECRET } from "@repo/backend-common/config";
import rateLimit from "express-rate-limit";

// Existing JWT middleware
export function middleware(req: Request, res: Response, next: NextFunction) {
  const token = req.headers["authorization"];

  if (!token) {
    return res.status(403).json({ message: "unauthorized" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    //@ts-ignore
    req.userId = decoded.userId;
    next();
  } catch {
    return res.status(403).json({ message: "unauthorized" });
  }
}

// NEW: signup limiter
export const signupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});
