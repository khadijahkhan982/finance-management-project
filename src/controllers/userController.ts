import { User } from "../entities/User";
import { Status } from "../utils/enums";
import {
  encrypt_password,
  generateSixDigitCode,
  decrypt_Token,
} from "../utils/authHelpers";
import { AppDataSource } from "../index";
import { Request, Response} from "express";
interface AuthRequest extends Request {
  authenticatedUserId?: number;
}

const signup = async (req: any, res: any, next: any) => {
  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();
  try {
      const { full_name, email, password, phone_number, date_of_birth } = req.body;

    const encrypted_password = await encrypt_password(password);
    const verificationToken = generateSixDigitCode({ emailId: email });
    const tokenExpiresAt = new Date();
    tokenExpiresAt.setMinutes(tokenExpiresAt.getMinutes() + 10);
    const existing = await queryRunner.query(
      `SELECT id FROM "user" WHERE email = $1`, [email]
    );
    if (existing.length > 0) throw new Error("User exists");

    const user = User.create({
      full_name,
      email,
      password: encrypted_password,
      phone_number,
      token: verificationToken,
      token_expires_at: tokenExpiresAt,
      date_of_birth,
      status: Status.is_active,
    });
    await user.save();
    console.log(`Verification token sent for ${email}`);
    res.locals.user = user;
    return next();
  } catch (error) {
    console.error(error);
    return res.status(500).send({ message: "Error creating user." });
  } finally {
    await queryRunner.release();
  }
};

const user_auth = async (req: any, res: any) => {
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
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
const user = await queryRunner.manager
      .createQueryBuilder(User, "user")
      .where("user.email = :email", { email })
      .select(["user.id", "user.token", "user.token_expires_at", "user.status"])
      .getOne();
    if (!user) {
      await queryRunner.rollbackTransaction();
      return res.status(404).send({ message: "User not found." });
    }

    let emailObject: any;
    try {
      emailObject = decrypt_Token(token);
    } catch (e) {
      await queryRunner.rollbackTransaction();
      return res
        .status(400)
        .send({ message: "Invalid JWT token signature or format." });
    }
    const sentToken = String(token).trim();
    const storedToken = user.token ? String(user.token).trim() : null;

    if (!storedToken || storedToken !== sentToken) {
      return res.status(400).send({
        message: "Invalid token (JWT mismatch). Note: Tokens are one-time use.",
      });
    }
    if (user.token_expires_at && new Date(user.token_expires_at) < new Date()) {
      await queryRunner.rollbackTransaction();
      return res.status(400).send({ message: "Token expired." });
    }
    await queryRunner.manager.update(User, user.id, {
      status: Status.is_active,
      token: null, 
      token_expires_at: null
    });
await queryRunner.commitTransaction();

    return res.send({ message: "User verified successfully." });
  } catch (err) {
    await queryRunner.rollbackTransaction();
    console.error(err);
    return res.status(500).send({ message: "Verification failed." });
  } finally{
    await queryRunner.release();
  }
};

const user_logout = async (req: AuthRequest, res: Response) => {
const userIdParam = req.params.userId;
  const targetUserId = Number(userIdParam);
  const authUserId = req.authenticatedUserId;

  if (!userIdParam || isNaN(targetUserId)) {
    return res
      .status(400)
      .send({ message: "A valid User ID is required in the URL." });
  }

  if (targetUserId !== authUserId) {
    return res.status(403).send({
      message: "Forbidden. You are not allowed to logout another user.",
    });
  }
const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();
  try {
    const updateResult = await queryRunner.manager.createQueryBuilder().update(User)
    .set({
        token: null,
        token_expires_at: null,
        status: Status.is_inactive,
    })
    .where("id = :id", { id: targetUserId })
    .execute();

    if (updateResult.affected === 0) {
      return res
        .status(404)
        .send({ message: `User with ID ${targetUserId} not found.` });
    }
await queryRunner.commitTransaction();
    return res.status(200).send({
      message: `Successful logout for user ID ${targetUserId}.`,
      affectedRows: updateResult.affected,
    });
  } catch (error) {
    await queryRunner.rollbackTransaction();
    console.error("Database update failed:", error);
    return res.status(500).send({ message: "Could not update user." });
  } finally {
    await queryRunner.release();
  }
};

const get_user = async (req: |AuthRequest, res: any) => {
const targetUserId = Number(req.params.userId);
  const authUserId = req.authenticatedUserId;

  if (!targetUserId || targetUserId !== authUserId) {
    return res.status(403).json({ message: "Access denied." });
  }

  try {
    const user = await User.getRepository()
      .createQueryBuilder("user")
      .leftJoinAndSelect("user.transactions", "transaction")
      .leftJoinAndSelect("user.assets", "asset")
      .select([
        "user.id",
        "user.full_name",
        "user.email",
        "user.phone_number",
        "transaction.id",
        "transaction.amount",
        "asset.name"
      ])
      .where("user.id = :id", { id: targetUserId })
      .getOne();

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    return res.status(200).json(user);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to fetch user data." });
  }
};

const resend_token = async (req: AuthRequest, res: any) => {
  const { email } = req.body;

  if (!email) {
    return res
      .status(400)
      .send({ message: "Email is required to resend the verification token." });
  }
const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
const user = await queryRunner.manager
      .createQueryBuilder(User, "user")
      .where("user.email = :email", { email })
      .select(["user.id"])
      .getOne();
    if (!user) {
      return res.status(404).send({ message: "User not found." });
    }

    const newVerificationToken = generateSixDigitCode({ emailId: email });
    const newTokenExpiresAt = new Date();
    newTokenExpiresAt.setMinutes(newTokenExpiresAt.getMinutes() + 10);
    await queryRunner.manager.update(User, user.id, {
      token: newVerificationToken,
      token_expires_at: newTokenExpiresAt,
    });
await queryRunner.commitTransaction();
    console.log(`NEW Verification token for ${email} has been sent.`);

    return res.status(200).send({
      message:
        "New verification token generated and successfully updated.",
    });
  } catch (error) {
    await queryRunner.rollbackTransaction();
    console.error("Error generating new token:", error);
    return res.status(500).send({ message: "Error processing token request." });
  } finally {
    await queryRunner.release();
  }
};

const update_user = async (req: AuthRequest, res: any) => {
  const targetUserId = Number(req.params.userId);
  const authUserId = req.authenticatedUserId;
  if (!targetUserId || targetUserId !== authUserId) {
    return res
      .status(400)
      .send({ message: "A valid numeric User ID is required in the URL." });
  }

  const { full_name, phone_number, date_of_birth, password } = req.body;
  const updates: Partial<User> = {}; //means this object is related to user and all properties are optional

  if (full_name) updates.full_name = full_name;
  if (phone_number) updates.phone_number = phone_number;
  if (date_of_birth) updates.date_of_birth = new Date(date_of_birth);
  if (password) updates.password = await encrypt_password(password);

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ message: "No fields provided for update." });
  }

  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    const result = await queryRunner.manager
      .createQueryBuilder()
      .update(User)
      .set(updates)
      .where("id = :id", { id: targetUserId })
      .execute();

    if (result.affected === 0) {
      await queryRunner.rollbackTransaction();
      return res.status(404).json({ message: "User not found." });
    }

    await queryRunner.commitTransaction();
    return res.status(200).json({ message: "Profile updated successfully." });
  } catch (err) {
    await queryRunner.rollbackTransaction();
    console.error(err);
    return res.status(500).send({ message: "Update failed." });
  } finally {
    await queryRunner.release();
  }
};
const delete_user = async (req: AuthRequest, res: any) => {
const targetUserId = Number(req.params.userId);
  const authUserId = req.authenticatedUserId;

  if (!targetUserId || isNaN(targetUserId)) {
    return res
      .status(400)
      .send({ message: "A valid User ID is required in the URL." });
  }

  if (targetUserId !== authUserId) {
    return res.status(403).send({
      message: "Forbidden. You are only allowed to delete your own account.",
    });
  }
  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
   const deleteResult = await queryRunner.manager
      .createQueryBuilder()
      .delete()
      .from(User)
      .where("id = :id", { id: targetUserId })
      .execute();

    if (deleteResult.affected === 0) {
      return res
        .status(404)
        .send({ message: `User with ID ${targetUserId} not found.` });
    }
    await queryRunner.commitTransaction();
    return res.status(200).send({
      message: `User account with ID ${targetUserId} successfully deleted.`,
      affectedRows: deleteResult.affected,
    });
  } catch (error) {
    await queryRunner.rollbackTransaction();
    console.error("Database deletion failed:", error);
    return res.status(500).send({ message: "Could not delete user." });
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
