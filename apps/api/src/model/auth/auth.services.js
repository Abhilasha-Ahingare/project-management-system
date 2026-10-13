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
    refreshTokenRotatedAt: new Date(),
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

  const user = await User.findOne({
    email: normalizedEmail,
  }).select("+password");

  if (!user) {
    throw new ApiError(401, "Invalid email or password");
  }

  const isPasswordValid = await bcrypt.compare(password, user.password);

  if (!isPasswordValid) {
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
    refreshTokenRotatedAt: new Date(),
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
  return new Date(Date.now() + env.refreshTokenTtlMs);
};

export const refreshAccessToken = async (refreshToken) => {
  if (!refreshToken) {
    throw new ApiError(401, "Refresh token is required");
  }

  const now = new Date();
  const currentTokenHash = hashToken(refreshToken);
  const session = await Session.findOne({
    refreshTokenHash: currentTokenHash,
    revokedAt: null,
    expiresAt: { $gt: now },
  }).populate({
    path: "user",
    select: "name email role designation isActive",
  });

  if (!session || !session.user) {
    throw new ApiError(401, "Invalid or expired refresh token");
  }
  if (
    !session.refreshTokenRotatedAt &&
    now.getTime() - session.createdAt.getTime() >= env.refreshTokenTtlMs
  ) {
    session.revokedAt = now;
    session.expiresAt = now;
    await session.save();
    throw new ApiError(
      401,
      "Legacy refresh token has expired; please sign in again",
    );
  }
  if (!session.user.isActive) {
    session.revokedAt = now;
    session.expiresAt = now;
    await session.save();
    throw new ApiError(401, "Account is inactive");
  }

  const rotatedRefreshToken = generateRefreshToken();
  const rotatedSession = await Session.findOneAndUpdate(
    {
      _id: session._id,
      refreshTokenHash: currentTokenHash,
      revokedAt: null,
      expiresAt: { $gt: now },
    },
    {
      $set: {
        refreshTokenHash: hashToken(rotatedRefreshToken),
        refreshTokenRotatedAt: now,
        expiresAt: getRefreshTokenExpiry(),
      },
    },
    { new: true },
  );
  if (!rotatedSession)
    throw new ApiError(401, "Refresh token has already been used");
  const accessToken = generateAccessToken(session.user._id);

  return {
    accessToken,
    refreshToken: rotatedRefreshToken,
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
