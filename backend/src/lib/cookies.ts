import type { Response } from "express";
import { config } from "../config.js";
import { accessTtlSeconds } from "./jwt.js";

export const ACCESS_COOKIE = "smartwatch_access";
export const REFRESH_COOKIE = "smartwatch_refresh";

const isProd = config.nodeEnv === "production";

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string) {
  res.cookie(ACCESS_COOKIE, accessToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: "strict",
    maxAge: accessTtlSeconds() * 1000,
  });
  res.cookie(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: "strict",
    maxAge: config.jwt.refreshTtlDays * 24 * 3600 * 1000,
  });
}

export function clearAuthCookies(res: Response) {
  res.clearCookie(ACCESS_COOKIE);
  res.clearCookie(REFRESH_COOKIE);
}
