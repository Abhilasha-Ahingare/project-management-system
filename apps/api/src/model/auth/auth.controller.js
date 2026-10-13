import asyncHandler from "../../utils/asyncHandler.js";
import ApiResponse from "../../utils/ApiResponse.js";
import env from "../../config/env.js";

import {
  registerUser,
  loginUser,
  refreshAccessToken,
  logoutUser,
} from "./auth.services.js";

const refreshTokenCookieOptions = {
  httpOnly: true,
  secure: env.nodeEnv === "production",
  sameSite: "lax",
  maxAge: env.refreshTokenTtlMs,
  path: "/",
};

export const register = asyncHandler(async (req, res) => {
  const result = await registerUser(req.body);

  res.cookie(
    env.refreshTokenCookieName,
    result.refreshToken,
    refreshTokenCookieOptions,
  );

  delete result.refreshToken;

  res
    .status(201)
    .json(new ApiResponse(201, result, "User registered successfully"));
});

export const login = asyncHandler(async (req, res) => {
  const result = await loginUser(req.body);

  res.cookie(
    env.refreshTokenCookieName,
    result.refreshToken,
    refreshTokenCookieOptions,
  );

  delete result.refreshToken;

  res.status(200).json(new ApiResponse(200, result, "Login successful"));
});

export const refresh = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies[env.refreshTokenCookieName];

  const result = await refreshAccessToken(refreshToken);

  res.cookie(
    env.refreshTokenCookieName,
    result.refreshToken,
    refreshTokenCookieOptions,
  );

  delete result.refreshToken;

  res
    .status(200)
    .json(new ApiResponse(200, result, "Token refreshed successfully"));
});

export const logout = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies[env.refreshTokenCookieName];

  await logoutUser(refreshToken);

  res.clearCookie(env.refreshTokenCookieName, {
    httpOnly: refreshTokenCookieOptions.httpOnly,
    secure: refreshTokenCookieOptions.secure,
    sameSite: refreshTokenCookieOptions.sameSite,
    path: refreshTokenCookieOptions.path,
  });

  res.status(200).json(new ApiResponse(200, null, "Logout successful"));
});
