import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";

import User from "../users/users.model.js";
import Session from "./session.model.js";
import env from "../../config/env.js";
import ApiError from "../../utils/ApiError.js";

export const registerUser = async ({ name, email, password }) => {
  const normalizedEmail = email.toLowerCase().trim();
  const hasAdmin = await User.exists({ role: "admin" });

  if (hasAdmin) {
    throw new ApiError(
      403,
      "Public registration is disabled. An administrator must create your account.",
    );
  }

  const existingUser = await User.findOne({
    email: normalizedEmail,
  });

  if (existingUser) {
    throw new ApiError(409, "Email is already registered");
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  const user = await User.create({
    name,
    email: normalizedEmail,
    password: hashedPassword,
    role: hasAdmin ? "user" : "admin",
  });

  const accessToken = generateAccessToken(user._id);
  const refreshToken = generateRefreshToken();

  await Session.create({
    user: user._id,
    refreshTokenHash: hashToken(refreshToken),
    expiresAt: getRefreshTokenExpiry(),
  });

  return {
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      designation: user.designation,
    },
    accessToken,
    refreshToken,
  };
};

export const loginUser = async ({ email, password }) => {
  const normalizedEmail = email.toLowerCase().trim();

  console.info("[ProjectHub Auth] login attempt", { email: normalizedEmail });

  const user = await User.findOne({
    email: normalizedEmail,
  }).select("+password");

  if (!user) {
    console.warn("[ProjectHub Auth] user not found", {
      email: normalizedEmail,
    });
    throw new ApiError(401, "Invalid email or password");
  }

  const isPasswordValid = await bcrypt.compare(password, user.password);

  if (!isPasswordValid) {
    console.warn("[ProjectHub Auth] invalid password", {
      email: normalizedEmail,
    });
    throw new ApiError(401, "Invalid email or password");
  }

  if (!user.isActive) {
    console.warn("[ProjectHub Auth] inactive account", {
      email: normalizedEmail,
    });
    throw new ApiError(403, "Account is inactive");
  }

  user.lastLoginAt = new Date();
  await user.save();

  const accessToken = generateAccessToken(user._id);
  const refreshToken = generateRefreshToken();

  await Session.create({
    user: user._id,
    refreshTokenHash: hashToken(refreshToken),
    expiresAt: getRefreshTokenExpiry(),
  });

  console.info("[ProjectHub Auth] login successful", {
    userId: user._id.toString(),
  });

  return {
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      designation: user.designation,
    },
    accessToken,
    refreshToken,
  };
};

const generateAccessToken = (userId) => {
  return jwt.sign({ userId }, env.jwtSecret, {
    expiresIn: env.accessTokenExpiresIn,
  });
};

const generateRefreshToken = () => {
  return crypto.randomBytes(64).toString("hex");
};

const hashToken = (token) => {
  return crypto.createHash("sha256").update(token).digest("hex");
};

const getRefreshTokenExpiry = () => {
  const expiry = new Date();

  expiry.setDate(expiry.getDate() + 3650);

  return expiry;
};

export const refreshAccessToken = async (refreshToken) => {
  if (!refreshToken) {
    throw new ApiError(401, "Refresh token is required");
  }

  const session = await Session.findOne({
    refreshTokenHash: hashToken(refreshToken),
    revokedAt: null,
  }).populate("user");

  if (!session || !session.user) {
    throw new ApiError(401, "Invalid or expired refresh token");
  }

  const accessToken = generateAccessToken(session.user._id);
  session.expiresAt = getRefreshTokenExpiry();
  await session.save();

  return {
    accessToken,
    user: {
      id: session.user._id,
      name: session.user.name,
      email: session.user.email,
      role: session.user.role,
      designation: session.user.designation,
    },
  };
};

export const logoutUser = async (refreshToken) => {
  if (!refreshToken) {
    return;
  }

  await Session.findOneAndUpdate(
    {
      refreshTokenHash: hashToken(refreshToken),
      revokedAt: null,
    },
    {
      revokedAt: new Date(),
    },
  );
};
