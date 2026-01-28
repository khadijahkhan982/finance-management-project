import express, { Request, Response, NextFunction } from "express"; 
import { User } from "../entities/User"; 
import { verifyAndDecodeJWT } from "../utils/authHelpers"; 

export const protect = async (req: any, res: any, next: any) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;

    if (!token) return res.status(401).json({ message: "No token provided." });

    const decoded = verifyAndDecodeJWT(token);
    
    if (!decoded || !decoded.userId) {
      console.log("DECODED ID: undefined - Blocking request");
      return res.status(401).json({ message: "Invalid token payload: userId missing." });
    }

    const userId = Number(decoded.userId);
    if (isNaN(userId)) {
      return res.status(401).json({ message: "Invalid User ID format in token." });
    }
    const user = await User.findOneBy({ id: userId, token: token });

    if (!user) {
      return res.status(401).json({ message: "User not found or session replaced." });
    }

    req.authenticatedUserId = user.id; 
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token." });
  }
};