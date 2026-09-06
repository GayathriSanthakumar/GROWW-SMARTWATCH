import type { Response } from "express";
import { config } from "../config.js";

export const ACCESS_COOKIE = "smartwatch_access";
export const REFRESH_COOKIE = "smartwatch_refresh";

const isProd = config.nodeEnv === "production";
const sameSite = config.cookieSameSite;
const secure = isProd || sameSite === "none"; // SameSite=None requires Secure

// Session cookies (no Max-Age): the authenticated session lives for the browser
// session and ends when the browser closes. Reopening the site always shows the
// Sign In page — no silent auto-login — while the DB account + data persist.
// (Account != session: logout only clears the cookie/session, never the user.)
export function setAuthCookies(res: Response, accessToken: string, refreshToken: string) {
  res.cookie(ACCESS_COOKIE, accessToken, {
    httpOnly: true,
    secure,
    sameSite,
  });
  res.cookie(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure,
    sameSite,
  });
}

export function clearAuthCookies(res: Response) {
  res.clearCookie(ACCESS_COOKIE);
  res.clearCookie(REFRESH_COOKIE);
}
