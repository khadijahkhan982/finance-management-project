import { User } from "../entities/User";
import { HttpStatusCode, Status } from "../utils/enums";
import bcrypt from "bcrypt";
import {
  encrypt_password,
  generateSixDigitCode,
  generateAuthToken,
  verifyAndDecodeJWT,
} from "../utils/authHelpers";
import { Request, Response } from "express";
import { queryRunnerFunc } from "../utils/query_runner";
import { Address } from "../entities/Address";
import { UserSessions } from "../entities/UserSessions";
import redisClient from "../config/redis";
import { sendOTPEmail, sendOTPForPasswordReset } from "../utils/emailHelper";
import { APIError } from "../errors/api-error";
import { create_json_response, handleError } from "../utils/helper";
import { UnauthenticatedError } from "../errors/unauthentication-error";
interface AuthRequest extends Request {
  authenticatedUserId?: number;
}

const signup = async (req: any, res: any, next: any) => {
  try {
    const {
      // full_name,
      email,
      password,
      // phone_number,
      // date_of_birth,
      // city,
      // country,
      // street,
      // house_number,
    } = req.body;

    const existingUser = await User.findOneBy({ email });

    if (existingUser) {
      throw new APIError(
        "ConflictError",
        HttpStatusCode.CONFLICT,
        true,
        "User with this email already exists",
        "User with this email already exists",
      );
    }
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const encrypted_password = await encrypt_password(password);
    const pendingUserData = {
      ...req.body,
      password: encrypted_password,
      otp,
    };
    await redisClient.set(
      `temp_user:${email}`,
      JSON.stringify(pendingUserData),
      { EX: 600 },
    );
    try {
      await sendOTPEmail(email, otp);
      console.log(`[REDIS] OTP for ${email}: ${otp}`);
    } catch (mailError) {
      console.error("Mail Delivery Failed:", mailError);
      return res
        .status(HttpStatusCode.INTERNAL_SERVER)
        .json(
          create_json_response({}, false, "Failed to send verification email."),
        );
    }

    return res
      ?.status(HttpStatusCode.CREATED)
      ?.json(
        create_json_response(
          { email },
          true,
          "OTP generated and sent to your email. Please verify.",
        ),
      );
  } catch (error: any) {
    return handleError(error, res, "signup");
  }
};

const verifySignup = async (req: any, res: any) => {
  try {
    const { email, otp } = req.body;
    const cachedData = await redisClient.get(`temp_user:${email}`);
    if (!cachedData) {
      throw new APIError(
        "Invalid Token",
        HttpStatusCode.BAD_REQUEST,
        true,
        "OTP expired or not found",
        "OTP expired or not found",
      );
    }

    const userData = JSON.parse(cachedData);

    if (userData.otp !== otp)
      throw new APIError(
        "InvalidToken",
        HttpStatusCode.BAD_REQUEST,
        true,
        "The OTP provided is incorrect.",
        "The OTP provided is incorrect.",
      );
    const newUser = await queryRunnerFunc(async (manager) => {
      const address = manager.create(Address, {
        city: userData.city,
        country: userData.country,
        street: userData.street,
        house_number: userData.house_number,
      });
      const savedAddress = await manager.save(Address, address);

      const user = manager.create(User, {
        full_name: userData.full_name,
        email: userData.email,
        password: userData.password,
        phone_number: userData.phone_number,
        date_of_birth: userData.date_of_birth,
        status: Status.is_inactive,
        address: savedAddress,
      });

      return await manager.save(User, user);
    });

    await redisClient.del(`temp_user:${email}`);
    return res?.status(HttpStatusCode.CREATED)?.json(
      create_json_response(
        {
          user_id: newUser.id,
          email: newUser.email,
        },
        true,
        "Account verified and created successfully!",
      ),
    );
  } catch (error: any) {
    return handleError(error, res, "verify-signup");
  }
};

const user_login = async (req: Request, res: Response) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOneBy({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      throw new UnauthenticatedError("Invalid email or password");
    }
    user.status = Status.is_active;
    const authToken = generateAuthToken({ userId: user.id });

    const expiry = new Date();
    expiry.setHours(expiry.getHours() + 24);
    user.token = authToken;
    user.token_expires_at = expiry;
    user.status = Status.is_active;
    await user.save();
    const session = UserSessions?.create({
      token: authToken,
      user: user,
      expires_at: expiry,
      is_valid: true,
    });
    await session?.save();

    return res?.status(HttpStatusCode.CREATED)?.json(
      create_json_response(
        {
          user: { id: user.id, full_name: user.full_name },
          token: authToken,
        },
        true,
        "Login successful",
      ),
    );
  } catch (error) {
    return handleError(error, res, "login");
  }
};

const user_logout = async (req: AuthRequest, res: Response) => {
  const authUserId = req.authenticatedUserId;
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
    return res
      ?.status(HttpStatusCode.CREATED)
      ?.json(create_json_response({}, true, "Logout successful"));
  } catch (error) {
    return handleError(error, res, "logout");
  }
};

const get_user = async (req: AuthRequest, res: any) => {
  const userId = req.authenticatedUserId;
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
      .where("user.id = :id", { id: userId })
      .getOne();

    if (!user) {
      throw new APIError(
        "NotFoundError",
        HttpStatusCode.NOT_FOUND,
        true,
        "User not found.",
        "User not found.",
      );
    }

    return res
      ?.status(HttpStatusCode.CREATED)
      ?.json(
        create_json_response(
          { user },
          true,
          "User data retrieved successfully",
        ),
      );
  } catch (error: any) {
    return handleError(error, res, "get-user");
  }
};

const resend_token = async (req: Request, res: Response) => {
  const { email } = req.body;

  if (!email) {
    throw new APIError(
      "NoEmail",
      HttpStatusCode.BAD_REQUEST,
      true,
      "Email not provided",
      "Email not provided",
    );
  }

  try {
    const user = await User.findOneBy({ email });

    if (!user) {
      throw new APIError(
        "NotFoundError",
        HttpStatusCode.NOT_FOUND,
        true,
        "User not found",
        "User not found",
      );
    }

    if (user.status === Status.is_inactive) {
      return res.status(HttpStatusCode.UNAUTHORIZED).json({
        message:
          "Your session has expired or you are logged out. Please login again to receive a new token.",
      });
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

    return res?.status(HttpStatusCode.CREATED)?.json(
      create_json_response(
        { debug_token: newVerificationToken },

        true,
        "New verification token generated and updated in your account.",
      ),
    );
  } catch (error: any) {
    return handleError(error, res, "resend-token");
  }
};

const update_user = async (req: AuthRequest, res: any) => {
  const targetUserId = req.authenticatedUserId;
  const { password, date_of_birth, ...otherData } = req.body;

  try {
    const result = await queryRunnerFunc(async (manager) => {
      const user = await manager.findOne(User, {
        where: { id: targetUserId },
        relations: ["address"],
      });

      if (!user) {
        throw new APIError(
          "NotFoundError",
          HttpStatusCode.NOT_FOUND,
          true,
          "User not found.",
          "User not found.",
        );
      }
      Object.assign(user, otherData);

      if (user.address) {
        Object.assign(user.address, otherData);
      }
      if (date_of_birth) {
        user.date_of_birth = new Date(date_of_birth);
      }

      if (password) {
        user.password = await encrypt_password(password);
      }

      return await manager.save(User, user);
    });

    return res
      ?.status(HttpStatusCode.CREATED)
      ?.json(
        create_json_response(
          { user: result },
          true,
          "Profile and address updated successfully.",
        ),
      );
  } catch (error: any) {
    return handleError(error, res, "update-user");
  }
};

const forgot_password = async (req: Request, res: Response) => {
  const { email } = req.body;

  if (!email) {
    throw new APIError(
      "EmailNeeded",
      HttpStatusCode.BAD_REQUEST,
      true,
      "Email required.",
      "Email required",
    );
  }

  try {
    const user = await User.findOneBy({ email });
    if (!user) {
      return res
        .status(HttpStatusCode.OK)
        .json(
          create_json_response(
            {},
            true,
            "If that email exists, an OTP has been sent.",
          ),
        );
    }
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await redisClient.set(`reset_otp:${email}`, otp, { EX: 300 });
    console.log(`[REDIS] OTP for ${email}: ${otp}`);

    try {
      await sendOTPForPasswordReset(email, otp);
    } catch (mailError) {
      console.error("Mail Delivery Failed:", mailError);
      throw new APIError(
        "MailError",
        HttpStatusCode.INTERNAL_SERVER,
        true,
        "Failed to send reset email",
        "Failed to send reset email",
      );
    }

    return res
      ?.status(HttpStatusCode.CREATED)
      ?.json(
        create_json_response(
          { email },
          true,
          "OTP sent successfully to your email.",
        ),
      );
  } catch (error: any) {
    return handleError(error, res, "forgot-password");
  }
};
const verify_otp = async (req: Request, res: Response) => {
  const { email, otp } = req.body;

  try {
    const storedOtp = await redisClient.get(`reset_otp:${email}`);

    if (!storedOtp || storedOtp !== otp) {
      throw new APIError(
        "Invalid Token",
        HttpStatusCode.BAD_REQUEST,
        true,
        "Invalid or expired OTP",
        "Invalid or expired OTP",
      );
    }

    const user = await User.findOneBy({ email });
    if (!user) {
      throw new APIError(
        "NotFoundError",
        HttpStatusCode.NOT_FOUND,
        true,
        "User not found.",
        "User not found.",
      );
    }

    await redisClient.del(`reset_otp:${email}`);
    if (!user.token) {
      throw new APIError(
        "UnauthorizedError",
        HttpStatusCode.UNAUTHORIZED,
        true,
        "No active session found. Please login first.",
        "No active session found. Please login first.",
      );
    }

    return res
      ?.status(HttpStatusCode.CREATED)
      ?.json(create_json_response({ email }, true, "OTP verified."));
  } catch (error: any) {
    return handleError(error, res, "verify-otp");
  }
};

const reset_password = async (req: Request, res: Response) => {
  const { newPassword } = req.body;
  const authHeader = req.headers.authorization;
  const tokenFromHeader = authHeader?.startsWith("Bearer ")
    ? authHeader.split(" ")[1]
    : null;

  if (!tokenFromHeader) {
    throw new APIError(
      "UnauthorizedError",
      HttpStatusCode.UNAUTHORIZED,
      true,
      "Token is required",
      "Token is required",
    );
  }

  try {
    const decoded = verifyAndDecodeJWT(tokenFromHeader);
    const userIdFromToken = Number(decoded.userId);

    const user = await User.findOneBy({ id: userIdFromToken });
    if (!user || user.token !== tokenFromHeader) {
      throw new APIError(
        "UnauthorizedError",
        HttpStatusCode.UNAUTHORIZED,
        true,
        "Invalid or mismatched session token",
        "Invalid or mismatched session token",
      );
    }
    user.password = await encrypt_password(newPassword);

    user.token = null;
    user.token_expires_at = null;
    user.status = Status.is_inactive;

    await user.save();
    await UserSessions.update({ user: { id: user.id } }, { is_valid: false });

    return res?.status(HttpStatusCode.CREATED)?.json(
      create_json_response(
        {},
        true,
        "Password reset successful. Please login with your new password.",
      ),
      //   {
      //   success: true,
      //   message:
      //     "Password reset successful. Please login with your new password.",
      // }
    );
  } catch (error: any) {
    return handleError(error, res, "reset-password");
  }
};

const delete_user = async (req: any, res: any) => {
  const targetUserId = Number(req.params.userId);

  try {
    await queryRunnerFunc(async (manager) => {
      const user = await manager.findOne(User, {
        where: { id: targetUserId },
        relations: ["address"],
      });

      if (!user) {
        throw new APIError(
          "NotFoundError",
          HttpStatusCode.NOT_FOUND,
          true,
          "User not found.",
          "User not found.",
        );
      }

      const addressId = user.address?.id;

      await manager.delete("Transaction", { user: { id: targetUserId } });
      await manager.delete("Asset", { user: { id: targetUserId } });
      await manager.delete("UserSessions", { user: { id: targetUserId } });
      await manager.delete(User, { id: targetUserId });

      if (addressId) {
        await manager.delete(Address, { id: addressId });
      }
    });

    return res?.status(HttpStatusCode.CREATED)?.json(
      // { message: "Deleted successfully." }
      create_json_response({}, true, "Deleted successfully"),
    );
  } catch (error: any) {
    return handleError(error, res, "delete-user");
  }
};
export {
  signup,
  verifySignup,
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
