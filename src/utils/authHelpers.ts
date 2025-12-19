// src/utils/authHelpers.ts (Suggested New File)
import * as jwt from "jsonwebtoken";
const bcrypt = require("bcrypt");

const slat = 10;

export async function encrypt_password(password: string): Promise<string> {
  return bcrypt.hashSync(password, slat);
}

export function generateSixDigitCode(emailObject: any): string {
  return jwt.sign(emailObject, process.env.JWT_SECRET!, { expiresIn: '10m' }).toString();
}

export function decrypt_Token(code: string): any {
  return jwt.verify(code, process.env.JWT_SECRET!);
}

export function verifyAndDecodeJWT(token: string): any {
  try {
    return jwt.verify(token, process.env.JWT_SECRET!);
  } catch (error) {
    throw new Error("Invalid or expired access token.");
  }
}