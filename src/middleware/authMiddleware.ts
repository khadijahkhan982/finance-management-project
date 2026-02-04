import express, { Request, Response, NextFunction } from "express"; 
import { User } from "../entities/User"; 
import { verifyAndDecodeJWT } from "../utils/authHelpers"; 

export const protect = async (req: any, res: any, next: any) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(" ")[1];

    if (!token) return res.status(401).json({ message: "No token provided." });

    const decoded = verifyAndDecodeJWT(token);
    if (!decoded?.userId) return res.status(401).json({ message: "Invalid Token" });

    const userId = Number(decoded.userId);

    // Verify user exists and token matches (for active session tracking)
    const user = await User.findOneBy({ id: userId, token: token });

    if (!user) {
      console.log(`[PROTECT] Fail: User ${userId} not found or token mismatch.`);
      return res.status(401).json({ message: "Please login again." });
    }

    // Attach as Number
    req.authenticatedUserId = Number(user.id);
    console.log(`[PROTECT] Success: Attached ID ${req.authenticatedUserId}`);
    
    next();
  } catch (error) {
    return res.status(401).json({ message: "Session expired." });
  }
};