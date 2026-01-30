import { User } from "../entities/User";
import { Status } from "../utils/enums";
import bcrypt from "bcrypt";
import {
  encrypt_password,
  generateSixDigitCode,
  decrypt_Token,
  generateAuthToken,
  verifyAndDecodeJWT,
} from "../utils/authHelpers";
import { Request, Response } from "express";
import { queryRunnerFunc } from "../utils/query_runner";
import { Address } from "../entities/Address";
import { UserSessions } from "../entities/UserSessions";
import redisClient from "../config/redis";
interface AuthRequest extends Request {
  authenticatedUserId?: number;
}

const signup = async (req: any, res: any, next: any) => {
  try {
    const {
      full_name,
      email,
      password,
      phone_number,
      date_of_birth,
      city,
      country,
      street,
      house_number,
    } = req.body;
    
    const [existingUser, encrypted_password] = await Promise.all([
    User.findOneBy({ email }),
    encrypt_password(password)
  ]);
    if (existingUser) {
      return res.status(400).send({ message: "User already exists." });
    }

    const verificationToken = generateSixDigitCode({ emailId: email });
    const tokenExpiresAt = new Date();
    tokenExpiresAt.setMinutes(tokenExpiresAt.getMinutes() + 10);

    const newUser = await queryRunnerFunc(async (manager) => {
      const address = manager.create(Address, {
        city,
        country,
        street,
        house_number,
      });

      const user = manager.create(User, {
        full_name,
        email,
        password: encrypted_password,
        phone_number,
        token: verificationToken,
        token_expires_at: tokenExpiresAt,
        date_of_birth,
        status: Status.is_active,
        address: address,
      });

      return await manager.save(User, user);
    });

    //console.log(`Verification token sent for ${email}`);
    res.locals.user = newUser;
    return next();
  } catch (error: any) {
    console.error("Signup Error:", error);
    const status = error.status || 500;
    return res
      .status(status)
      .send({ message: error.message || "Error creating user." });
  }
};

const user_auth = async (req: any, res: any) => {
  const { email } = req.body;
  const authHeader = req.headers.authorization;
  const sentToken = authHeader?.startsWith("Bearer ")
    ? authHeader.split(" ")[1]
    : null;
  if (!email || !sentToken) {
    return res.status(400).send({ message: "Email and token are required" });
  }
  try {
    const user = await User.findOne({
      where: { email },
      select: ["id", "token", "token_expires_at", "status"],
    });

    if (!user) {
      return res.status(404).send({ message: "User not found." });
    }
    try {
      decrypt_Token(sentToken);
    } catch (e) {
      return res
        .status(400)
        .send({ message: "Invalid JWT signature or format." });
    }
    const storedToken = user.token?.trim();
    if (!storedToken || storedToken !== sentToken.trim()) {
      return res
        .status(400)
        .send({ message: "Invalid or already used token." });
    }

    if (user.token_expires_at && new Date(user.token_expires_at) < new Date()) {
      return res.status(400).send({ message: "Token expired." });
    }
    const authToken = generateAuthToken({ userId: user.id });
    const expiry = new Date();
    expiry.setHours(expiry.getHours() + 24);

    user.status = Status.is_active;
    user.token = authToken;
    user.token_expires_at = expiry;

    await user.save();

    return res.send({
      message: "User verified successfully. You can now log in.",
    });
  } catch (err) {
    console.error("Verification Error:", err);
    return res.status(500).send({ message: "Verification failed." });
  }
};

// const user_login = async (req: Request, res: Response) => {
//   const { email, password } = req.body;

//   try {
//     const user = await User.findOneBy({ email });
//     if (!user || !(await bcrypt.compare(password, user.password))) {
//       return res.status(401).json({ message: "Invalid email or password." });
//     }

//     if (user.status !== Status.is_active) {
//       return res.status(403).json({ message: "Please verify your email first." });
//     }

//     const authToken = generateAuthToken({ userId: user.id });

//     const expiry = new Date();
//     expiry.setHours(expiry.getHours() + 24);

//     const session = UserSessions.create({
//       token: authToken,
//       user: user,
//       expires_at: expiry,
//       is_valid: true
//     });
//     await session.save();

//     return res.status(200).json({
//       success: true,
//       token: authToken,
//       user: { id: user.id, full_name: user.full_name }
//     });
//   } catch (error) {
//     return res.status(500).json({ message: "Internal Server Error" });
//   }
// };
const user_login = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOneBy({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const authToken = generateAuthToken({ userId: user.id });

    const expiry = new Date();
    expiry.setHours(expiry.getHours() + 24);
    user.token = authToken;
    user.token_expires_at = expiry;
    user.status = Status.is_active;
    await user.save();
    const session = UserSessions.create({
      token: authToken,
      user: user,
      expires_at: expiry,
      is_valid: true,
    });
    await session.save();

    return res.status(200).json({
      success: true,
      token: authToken,
      user: { id: user.id, full_name: user.full_name },
    });
  } catch (error) {
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// const user_logout = async (req: AuthRequest, res: Response) => {
//   console.log("DEBUG:", {
//     paramId: req.params.userId,
//     authenticatedId: req.authenticatedUserId
//   });

//   const targetUserId = Number(req.params.userId);
//   const authUserId = Number(req.authenticatedUserId);
//   if (isNaN(targetUserId) || targetUserId !== authUserId) {
//     return res.status(403).json({
//       message: "Forbidden. You can only log out your own session."
//     });
//   }
//   const authHeader = req.headers.authorization;
//   const currentToken = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;

//   if (!currentToken) {
//     return res.status(400).json({ message: "No active session token found." });
//   }

//   try {

//     const session = await UserSessions.findOneBy({
//       token: currentToken,
//       user: { id: authUserId },
//       is_valid: true
//     });

//     if (!session) {
//       return res.status(404).json({ message: "Session already expired or not found." });
//     }
//     session.is_valid = false;
//     await session.save();

//     return res.status(200).json({
//       success: true,
//       message: "Successfully logged out. Session invalidated."
//     });

//   } catch (error) {
//     console.error("Logout Error:", error);
//     return res.status(500).json({ message: "Internal Server Error during logout." });
//   }
// };
const user_logout = async (req: AuthRequest, res: Response) => {
  const targetUserId = Number(req.params.userId);
  const authUserId = Number(req.authenticatedUserId);
  if (isNaN(targetUserId) || targetUserId !== authUserId) {
    return res
      .status(403)
      .json({ message: "Forbidden. You can only log out your own session." });
  }

  const authHeader = req.headers.authorization;
  const currentToken = authHeader?.startsWith("Bearer ")
    ? authHeader.split(" ")[1]
    : null;

  try {
    await User.update(
      { id: authUserId },
      {
        token: null,
        token_expires_at: null,
        status: Status.is_inactive,
      },
    );
    if (currentToken) {
      await UserSessions.update(
        { token: currentToken, user: { id: authUserId } },
        { is_valid: false },
      );
    }
    return res.status(200).json({
      success: true,
      message: "Successfully logged out. Your token is no longer valid.",
    });
  } catch (error) {
    console.error("Logout Error:", error);
    return res
      .status(500)
      .json({ message: "Internal Server Error during logout." });
  }
};

const get_user = async (req: AuthRequest, res: any) => {
  const targetUserId = Number(req.params.userId);
  const authUserId = Number(req.authenticatedUserId);
  console.log("DEBUG ACCESS:", {
    urlParamId: targetUserId,
    idFromMiddleware: authUserId,
    match: targetUserId === authUserId,
  });
  if (!targetUserId || targetUserId !== authUserId) {
    return res.status(403).json({ message: "Access denied." });
  }

  try {
    const user = await User.getRepository()
      .createQueryBuilder("user")
      .leftJoinAndSelect("user.transactions", "transaction")
      .leftJoinAndSelect("user.assets", "asset")
      .leftJoinAndSelect("user.address", "address")
      .select([
        "user.id",
        "user.full_name",
        "user.email",
        "user.phone_number",
        "transaction.id",
        "transaction.amount",
        "asset.id",
        "asset.name",
        "address.id",
        "address.city",
        "address.country",
        "address.street",
        "address.house_number",
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

const resend_token = async (req: Request, res: Response) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: "Email is required." });
  }

  try {
    const user = await User.findOneBy({ email });

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    const newVerificationToken = generateSixDigitCode({
      emailId: email,
      userId: user.id,
    });
    const newTokenExpiresAt = new Date();
    newTokenExpiresAt.setMinutes(newTokenExpiresAt.getMinutes() + 10);
    user.token = newVerificationToken;
    user.token_expires_at = newTokenExpiresAt;
    await user.save();

    console.log(
      `[DATABASE UPDATED] New token for ${email}: ${newVerificationToken}`,
    );
    return res.status(200).json({
      success: true,
      message: "New verification token generated and updated in your account.",
      debug_token: newVerificationToken,
    });
  } catch (error) {
    console.error("Resend Token Error:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};

const update_user = async (req: AuthRequest, res: any) => {
  const targetUserId = Number(req.params.userId);
  const authUserId = Number(req.authenticatedUserId);
  console.log("UPDATE DEBUG:", {
    urlId: targetUserId,
    tokenId: authUserId,
    types: { url: typeof targetUserId, token: typeof authUserId },
  });
  if (!targetUserId || targetUserId !== authUserId) {
    return res
      .status(400)
      .send({ message: "Unauthorized or invalid User ID." });
  }

  const {
    full_name,
    phone_number,
    date_of_birth,
    password,
    city,
    country,
    street,
    house_number,
  } = req.body;

  try {
    const result = await queryRunnerFunc(async (manager) => {
      const user = await manager.findOne(User, {
        where: { id: targetUserId },
        relations: ["address"],
      });

      if (!user)
        throw {
          status: 404,
          message: "User not found.",
        };
      if (full_name) user.full_name = full_name;
      if (phone_number) user.phone_number = phone_number;
      if (date_of_birth) user.date_of_birth = new Date(date_of_birth);
      if (password) user.password = await encrypt_password(password);
      if (user.address) {
        if (city) user.address.city = city;
        if (country) user.address.country = country;
        if (street) user.address.street = street;
        if (house_number) user.address.house_number = house_number;
      }
      return await manager.save(User, user);
    });

    return res
      .status(200)
      .json({
        message: "Profile and address updated successfully.",
        user: result,
      });
  } catch (err: any) {
    console.error(err);
    return res
      .status(err.status || 500)
      .json({ message: err.message || "Update failed." });
  }
};

const forgot_password = async (req: Request, res: Response) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: "Email is required." });
  }

  try {
    const user = await User.findOneBy({ email });
    if (!user) {
      return res
        .status(200)
        .json({ message: "If that email exists, an OTP has been sent." });
    }
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await redisClient.set(`reset_otp:${email}`, otp, { EX: 300 });
    console.log(`[REDIS] OTP for ${email}: ${otp}`);

    return res.status(200).json({
      success: true,
      message: "OTP sent successfully to your email.",
      otp: otp,
    });
  } catch (error) {
    console.error("Forgot Password Error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};
const verify_otp = async (req: Request, res: Response) => {
  const { email, otp } = req.body;

  try {
    const storedOtp = await redisClient.get(`reset_otp:${email}`);

    if (!storedOtp || storedOtp !== otp) {
      return res.status(400).json({ message: "Invalid or expired OTP." });
    }
    const user = await User.findOneBy({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }
    await redisClient.del(`reset_otp:${email}`);

    const resetToken = generateAuthToken({ userId: user.id });

    return res.status(200).json({
      success: true,
      message: "OTP verified.",
      resetToken: resetToken,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

const reset_password = async (req: Request, res: Response) => {
  const { newPassword } = req.body;
  const authHeader = req.headers.authorization;
  const resetToken = authHeader?.startsWith("Bearer ")
    ? authHeader.split(" ")[1]
    : null;

  if (!resetToken) {
    return res
      .status(401)
      .json({
        message: "Reset token is required in the Authorization header.",
      });
  }

  try {
    const decoded = verifyAndDecodeJWT(resetToken);
    const userIdFromToken = Number(decoded.userId);

    const user = await User.findOneBy({ id: userIdFromToken });
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    user.password = await encrypt_password(newPassword);
    await user.save();
    await UserSessions.update({ user: { id: user.id } }, { is_valid: false });

    return res.status(200).json({
      success: true,
      message:
        "Password reset successful. All previous sessions have been logged out.",
    });
  } catch (error) {
    console.error("Reset Password Error:", error);
    return res.status(401).json({ message: "Invalid or expired reset token." });
  }
};

const delete_user = async (req: AuthRequest, res: any) => {
  const targetUserId = Number(req.params.userId);
  const authUserId = Number(req.authenticatedUserId);

  if (targetUserId !== authUserId) {
    return res.status(403).send({ message: "Forbidden." });
  }

  try {
    await queryRunnerFunc(async (manager) => {
      const user = await manager.findOne(User, {
        where: { id: targetUserId },
        select: ["address"] 
      });

      if (!user) throw { status: 404, message: "User not found." };
      const addressId = user.address?.id;

  
      await manager.delete("Transaction", { user: { id: targetUserId } });
      await manager.delete("Asset", { user: { id: targetUserId } });
      await manager.delete("UserSessions", { user: { id: targetUserId } });
            await manager.delete(User, { id: targetUserId });
      if (addressId) {
        await manager.delete(Address, { id: addressId });
      }
    });

    return res.status(200).send({ message: "Deleted successfully." });
  } catch (error: any) {
    return res.status(error.status || 500).send({ message: error.message });
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
  user_login,
  forgot_password,
  verify_otp,
  reset_password,
};
