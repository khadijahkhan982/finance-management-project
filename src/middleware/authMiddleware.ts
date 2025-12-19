import express from "express";
import { User } from "../entities/User"; 
import { verifyAndDecodeJWT } from "../utils/authHelpers"; 

export const protect = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    let authenticatedUser: User | null = null;
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).send({ message: "No authentication token provided." });
    }
    const token = authHeader.split(" ")[1];

    try {
        const decodedPayload = verifyAndDecodeJWT(token);
        
        authenticatedUser = await User.getRepository().findOneBy({
            email: decodedPayload.emailId,
        });

    } catch (e) {
        return res.status(401).send({ message: (e as Error).message || "Invalid or expired access token." });
    }

    if (!authenticatedUser) {
        return res.status(401).send({ message: "Authentication failure: User not found." });
    }

  
    (req as any).authenticatedUserId = Number(authenticatedUser.id);
    (req as any).authenticatedUserEmail = authenticatedUser.email;

    return next(); 
};