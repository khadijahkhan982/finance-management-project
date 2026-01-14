import { User } from "../entities/User";
import express, { Request, Response, NextFunction } from "express";
import { Status } from "../utils/enums";
import { AppDataSource } from "../index";
import {
  encrypt_password,
  generateSixDigitCode,
  decrypt_Token,
} from "../utils/authHelpers";

const signup = async (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  const { full_name, email, password, phone_number, date_of_birth } = req.body;
  const queryRunner = AppDataSource.createQueryRunner();

  try {
    await queryRunner.connect();
    const encrypted_password = await encrypt_password(password);
    const verificationToken = generateSixDigitCode({ emailId: email });
    const tokenExpiresAt = new Date();
    tokenExpiresAt.setMinutes(tokenExpiresAt.getMinutes() + 10);
    const sql = `INSERT INTO "user" (full_name, email, password, phone_number, date_of_birth, token, token_expires_at, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`;
    const result = await queryRunner.query(sql, [
      full_name,
      email,
      encrypted_password,
      phone_number,
      date_of_birth,
      verificationToken,
      tokenExpiresAt,
      Status.is_active,
    ]);
    const newUser = result[0];
    console.log("User created via Query Runner:", newUser);
    console.log(`Verification token for ${email}: ${verificationToken}`);

    res.locals.user = newUser;
    return next();
  } catch (error) {
    console.error("Error creating user:", error);
    return res.status(500).send({ message: "Error creating user." });
  } finally {
    await queryRunner.release();
  }
};

const user_auth = async (req: Request, res: Response) => {
  const { email } = req.body;
  let token = "";
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1];
  }
  if (!email || !token) {
    return res.status(400).send({ message: "Email and token are required" });
  }
  const queryRunner = AppDataSource.createQueryRunner();
  try {
    await queryRunner.connect();
    const userResult = await queryRunner.query(
      `SELECT id, token, token_expires_at, status FROM "user" WHERE email = $1 LIMIT 1`,
      [email]
    );
    if (userResult.length === 0) {
      return res.status(404).send({ message: "User not found." });
    }
    const user = userResult[0];
    try {
      decrypt_Token(token);
    } catch (e) {
      return res
        .status(400)
        .send({ message: "Invalid JWT token signature or format." });
    }
    const sentToken = String(token).trim();
    const storedToken = user.token ? String(user.token).trim() : null;
    if (!storedToken || storedToken !== sentToken) {
      return res.status(400).send({
        message: "Invalid token. Note: Tokens are one-time use.",
      });
    }
    if (user.token_expires_at && new Date(user.token_expires_at) < new Date()) {
      return res.status(400).send({ message: "Token expired." });
    }
    const activeStatus = "active";
    await queryRunner.query(
      `UPDATE "user" SET status = $1, token = NULL WHERE id = $2`,
      [activeStatus, user.id]
    );
    return res.send({ message: "User verified successfully." });
  } catch (err) {
    console.error("Auth QueryRunner Error:", err);
    return res.status(500).send({ message: "Verification failed." });
  } finally {
    await queryRunner.release();
  }
};

const user_logout = async (req: Request, res: Response) => {
  const authenticatedUserId = (req as any).authenticatedUserId;
  const userIdString = req.params.userId;
  const targetUserId = Number(userIdString);

  if (isNaN(targetUserId)) {
    return res.status(400).send({ message: "A valid User ID is required." });
  }
  if (targetUserId !== authenticatedUserId) {
    return res.status(403).send({
      message: "Forbidden. You are not allowed to logout another user.",
    });
  }

  const queryRunner = AppDataSource.createQueryRunner();

  try {
    await queryRunner.connect();

    const sql = `
      UPDATE "user" 
      SET token = NULL, 
          token_expires_at = NULL, 
          status = $1 
      WHERE id = $2
    `;
    const inactiveStatus = "inactive";

    const result = await queryRunner.query(sql, [inactiveStatus, targetUserId]);
    return res.status(200).send({
      message: `Successful logout for user ID ${targetUserId}.`,
    });
  } catch (error) {
    console.error("Logout QueryRunner Error:", error);
    return res
      .status(500)
      .send({ message: "Internal Server Error during logout." });
  } finally {
    await queryRunner.release();
  }
};

const get_user = async (req: Request, res: Response) => {
  const authenticatedUserId = (req as any).authenticatedUserId;

  const userIdString = req.params.userId;
  const targetUserId = Number(userIdString);

  if (isNaN(targetUserId) || !userIdString) {
    return res
      .status(400)
      .send({ message: "A valid User ID is required in the URL." });
  }
  if (targetUserId !== authenticatedUserId) {
    return res.status(403).json({
      message: "Forbidden. You are not authorized to view another user's data.",
    });
  }
  const queryRunner = AppDataSource.createQueryRunner();
  try {
    await queryRunner.connect();
    const sql = `SELECT id, full_name, email, phone_number, date_of_birth FROM "user" WHERE id = $1 LIMIT 1`;
    const result = await queryRunner.query(sql, [targetUserId]);

    if (!result || result.length === 0) {
      return res.status(404).json({
        message: "User not found.",
      });
    }
    return res.status(200).send(result[0]);
  } catch (error) {
    console.error("Error retrieving user data:", error);
    return res.status(500).json({ message: "Internal server error." });
  } finally {
    await queryRunner.release();
  }
};

const resend_token = async (req: Request, res: Response) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).send({
      message: "Email is required to resend the verification token.",
    });
  }

  const queryRunner = AppDataSource.createQueryRunner();

  try {
    await queryRunner.connect();
    const userResult = await queryRunner.query(
      `SELECT id FROM "user" WHERE email = $1 LIMIT 1`,
      [email]
    );

    if (userResult.length === 0) {
      return res.status(404).send({ message: "User not found." });
    }
    const userId = userResult[0].id;
    const newVerificationToken = generateSixDigitCode({ emailId: email });
    const newTokenExpiresAt = new Date();
    newTokenExpiresAt.setMinutes(newTokenExpiresAt.getMinutes() + 10);
    const statusValue = "active";
    const updateSql = `
      UPDATE "user" 
      SET 
        token = $1, 
        token_expires_at = $2, 
        status = $3 
      WHERE id = $4
    `;

    await queryRunner.query(updateSql, [
      newVerificationToken,
      newTokenExpiresAt,
      statusValue,
      userId,
    ]);

    console.log(`New Verification token generated for ${email}`);

    return res.status(200).send({
      message:
        "New verification token generated and successfully updated. Please check your email.",
    });
  } catch (error) {
    console.error("Error generating new token via QueryRunner:", error);
    return res.status(500).send({ message: "Error processing token request." });
  } finally {
    await queryRunner.release();
  }
};

const update_user = async (req: express.Request, res: express.Response) => {
  const targetUserId = Number(req.params.userId);
  if (isNaN(targetUserId)) {
    return res
      .status(400)
      .send({ message: "A valid numeric User ID is required in the URL." });
  }
  const { full_name, phone_number, date_of_birth, password } = req.body;
  const updates: any = [];
  const params: any[] = [];
  let paramIndex = 1;
  if (full_name) {
    updates.push(`full_name = $${paramIndex++}`);
    params.push(full_name);
  }
  if (phone_number) {
    updates.push(`phone_number = $${paramIndex++}`);
    params.push(phone_number);
  }
  if (date_of_birth) {
    updates.push(`date_of_birth = $${paramIndex++}`);
    params.push(date_of_birth);
  }
  if (password) {
    const hashed = await encrypt_password(password);
    updates.push(`password = $${paramIndex++}`);
    params.push(hashed);
  }
  if (updates.length === 0) {
    return res.status(400).send({ message: "No valid fields to update." });
  }
  const queryRunner = AppDataSource.createQueryRunner();

  const authenticatedUserId = (req as any).authenticatedUserId;
  if (authenticatedUserId !== targetUserId) {
    return res.status(403).send({
      message:
        "Forbidden. You are not authorized to update another user's profile.",
    });
  }

  try {
    await queryRunner.connect();
    const checkSql = `SELECT id FROM "user" WHERE id = $1`;
    const existing = await queryRunner.query(checkSql, [targetUserId]);

    if (existing.length === 0) {
      return res.status(404).send({ message: "User not found." });
    }
    params.push(targetUserId);
    const updateSql = `
      UPDATE "user" 
      SET ${updates.join(", ")} 
      WHERE id = $${paramIndex} 
      RETURNING *`;
    const result = await queryRunner.query(updateSql, params);

    return res.status(200).send({
      message: "User updated successfullyy",
      user: result[0],
    });
  } catch (err) {
    console.error(err);
    return res.status(500).send({ message: "Update failed." });
  } finally {
    await queryRunner.release();
  }
};

const delete_user = async (req: Request, res: Response) => {
  const authenticatedUserId = (req as any).authenticatedUserId;

  const userIdString = req.params.userId;
  const targetUserId = Number(userIdString);
  if (isNaN(targetUserId) || !userIdString) {
    return res
      .status(400)
      .send({ message: "A valid User ID is required in the URL." });
  }
  if (targetUserId !== authenticatedUserId) {
    return res.status(403).send({
      message: "Forbidden. You are ONLY allowed to delete your own account.",
    });
  }
  const queryRunner = AppDataSource.createQueryRunner();

  try {
    await queryRunner.connect();
    const checkSql = `SELECT id FROM "user" WHERE id = $1`;
    const existing = await queryRunner.query(checkSql, [targetUserId]);

    if (existing.length === 0) {
      return res.status(404).send({ message: "User not found." });
    }
    const deleteSql = `DELETE FROM "user" WHERE id = $1`;
    await queryRunner.query(deleteSql, [targetUserId]);
    return res.status(200).send({
      message: `User account with ID ${targetUserId} successfully deleted.`,
    });
  } catch (error) {
    console.error("QueryRunner deletion failed:", error);
    return res
      .status(500)
      .send({ message: "Could not delete user. Internal server error" });
  } finally {
    await queryRunner.release();
  }
};

export {
  signup,
  user_auth,
  user_logout,
  get_user,
  delete_user,
  resend_token,
  update_user,
};
