import express from "express";
import { User } from "../entities/User";
import { protect } from "../middleware/authMiddleware";
import { Status } from "../utils/enums";
import {
  encrypt_password,
  generateSixDigitCode,
  decrypt_Token,
} from "../utils/authHelpers";
const router = express.Router();


const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const signup = async (req: any, res: any, next: any) => {
  const { full_name, email, password, phone_number, date_of_birth } = req.body;
  try {
    const encrypted_password = await encrypt_password(password);
    const verificationToken = generateSixDigitCode({ emailId: email });
    const tokenExpiresAt = new Date();
    tokenExpiresAt.setMinutes(tokenExpiresAt.getMinutes() + 10);

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
    console.log(`Verification token for ${email}: ${verificationToken}`);
    res.locals.user = user;
    return next();
  } catch (error) {
    console.error(error);
    return res.status(500).send({ message: "Error creating user." });
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

  try {
    const user = await User.getRepository().findOneBy({ email });

    if (!user) {
      return res.status(404).send({ message: "User not found." });
    }

    let emailObject: any;
    try {
      emailObject = decrypt_Token(token);
    } catch (e) {
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
      return res.status(400).send({ message: "Token expired." });
    }
    user.status = Status.is_active;
    await user.save();

    return res.send({ message: "User verified successfully." });
  } catch (err) {
    console.error(err);
    return res.status(500).send({ message: "Verification failed." });
  }
};

const user_logout = async (req: any, res: any) => {
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
      message: "Forbidden. You are not allowed to logout another user.",
    });
  }

  try {
    const updateResult = await User.getRepository().update(
      { id: targetUserId },
      {
        token: null,
        token_expires_at: null,
        status: Status.is_inactive,
      }
    );

    if (updateResult.affected === 0) {
      return res
        .status(404)
        .send({ message: `User with ID ${targetUserId} not found.` });
    }

    return res.status(200).send({
      message: `Successful logout for user ID ${targetUserId}.`,
      affectedRows: updateResult.affected,
    });
  } catch (error) {
    console.error("Database update failed:", error);
    return res.status(500).send({ message: "Could not update user." });
  }
};


const get_user = async (req: any, res: any) => {
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

  try {
    const existing_user = await User.getRepository().findOne({
      select: ["id", "full_name", "email", "phone_number", "date_of_birth"],
      where: { id: targetUserId },
    });

    if (!existing_user) {
      return res.status(404).json({
        message: "User not found.",
      });
    }
    return res.status(200).json(existing_user);
  } catch (error) {
    console.error("Error retrieving user data:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};


const resend_token = async (req: any, res: any) => {
  const { email } = req.body;

  if (!email) {
    return res
      .status(400)
      .send({ message: "Email is required to resend the verification token." });
  }

  try {
    const user = await User.getRepository().findOneBy({ email });

    if (!user) {
      return res.status(404).send({ message: "User not found." });
    }

    const newVerificationToken = generateSixDigitCode({ emailId: email });
    const newTokenExpiresAt = new Date();
    newTokenExpiresAt.setMinutes(newTokenExpiresAt.getMinutes() + 10);
    await User.getRepository().update(
      { id: user.id },
      {
        token: newVerificationToken,
        token_expires_at: newTokenExpiresAt,
        status: Status.is_active,
      }
    );

    console.log(`NEW Verification token for ${email}: ${newVerificationToken}`);

    return res.status(200).send({
      message:
        "New verification token generated and successfully updated. Please use the new token to verify your account.",
    });
  } catch (error) {
    console.error("Error generating new token:", error);
    return res.status(500).send({ message: "Error processing token request." });
  }
};



const update_user = async (req: any, res: any) => {
  const targetUserId = Number(req.params.userId);
  if (isNaN(targetUserId)) {
    return res
      .status(400)
      .send({ message: "A valid numeric User ID is required in the URL." });
  }

  const authenticatedUserId = (req as any).authenticatedUserId;
  if (authenticatedUserId !== targetUserId) {
    return res.status(403).send({
      message:
        "Forbidden. You are not authorized to update another user's profile.",
    });
  }

  try {
    const user = await User.getRepository().findOneBy({ id: targetUserId });

    if (!user) return res.status(404).send({ message: "User not found." });

    const { full_name, phone_number, date_of_birth, password } = req.body;
    const updates: any = {};

    if (full_name) updates.full_name = full_name;
    if (phone_number) updates.phone_number = phone_number;
    if (date_of_birth) updates.date_of_birth = new Date(date_of_birth);

    if (password) {
      const hashed = await encrypt_password(password);
      updates.password = hashed;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).send({ message: "No valid fields to update." });
    }
    await User.getRepository().update({ id: targetUserId }, updates);

    return res
      .status(200)
      .send({ message: `User ID ${targetUserId} updated successfully.` });
  } catch (err) {
    console.error(err);
    return res.status(500).send({ message: "Update failed." });
  }
};
const delete_user = async (req: any, res: any) => {
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
      message: "Forbidden. You are only allowed to delete your own account.",
    });
  }

  try {
    const deleteResult = await User.getRepository().delete({
      id: targetUserId,
    });

    if (deleteResult.affected === 0) {
      return res
        .status(404)
        .send({ message: `User with ID ${targetUserId} not found.` });
    }
    return res.status(200).send({
      message: `User account with ID ${targetUserId} successfully deleted.`,
      affectedRows: deleteResult.affected,
    });
  } catch (error) {
    console.error("Database deletion failed:", error);
    return res.status(500).send({ message: "Could not delete user." });
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
