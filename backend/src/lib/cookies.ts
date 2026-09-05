import type { Response } from "express";
import { config } from "../config.js";
import { accessTtlSeconds } from "./jwt.js";

export const ACCESS_COOKIE = "smartwatch_access";
export const REFRESH_COOKIE = "smartwatch_refresh";

const isProd = config.nodeEnv === "production";
const sameSite = config.cookieSameSite;
const secure = isProd || sameSite === "none"; // SameSite=None requires Secure

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string) {
  res.cookie(ACCESS_COOKIE, accessToken, {
    httpOnly: true,
    secure,
    sameSite,
    maxAge: accessTtlSeconds() * 1000,
  });
  res.cookie(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure,
    sameSite,
    maxAge: config.jwt.refreshTtlDays * 24 * 3600 * 1000,
  });
}

export function clearAuthCookies(res: Response) {
  res.clearCookie(ACCESS_COOKIE);
  res.clearCookie(REFRESH_COOKIE);
}
