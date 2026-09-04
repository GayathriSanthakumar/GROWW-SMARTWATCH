import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../lib/jwt.js";
import { unauthorized } from "../lib/errors.js";
import { query } from "../db/pool.js";

// Attaches req.user and sets the Postgres RLS context variable for this request.
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = extractBearer(req) ?? extractCookie(req, "smartwatch_access");
    if (!token) throw unauthorized("No authentication token");

    const payload = verifyAccessToken(token);
    const { rows } = await query<{ id: string; email: string; full_name: string; auth_provider: string; is_demo_account: boolean; knowledge_level: string }>(
      `SELECT id, email, full_name, auth_provider, is_demo_account, knowledge_level FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [payload.sub],
    );
    if (!rows[0]) throw unauthorized("User not found");

    req.user = {
      id: rows[0].id,
      email: rows[0].email,
      fullName: rows[0].full_name,
      authProvider: rows[0].auth_provider,
      isDemo: rows[0].is_demo_account,
      knowledgeLevel: rows[0].knowledge_level,
    };

    // RLS context (no-op when connected as superuser, enforced otherwise)
    await query(`SELECT set_config('app.current_user_id', $1, true)`, [rows[0].id]);
    next();
  } catch (e) {
    next(e instanceof Error && (e as Error).name === "JsonWebTokenError" ? unauthorized("Invalid token") : e);
  }
}

export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const token = extractBearer(req) ?? extractCookie(req, "smartwatch_access");
  if (token) {
    try {
      const payload = verifyAccessToken(token);
      const { rows } = await query<{ id: string; email: string; full_name: string; auth_provider: string; is_demo_account: boolean; knowledge_level: string }>(
        `SELECT id, email, full_name, auth_provider, is_demo_account, knowledge_level FROM users WHERE id = $1 AND deleted_at IS NULL`,
        [payload.sub],
      );
      if (rows[0]) {
        req.user = {
          id: rows[0].id,
          email: rows[0].email,
          fullName: rows[0].full_name,
          authProvider: rows[0].auth_provider,
          isDemo: rows[0].is_demo_account,
          knowledgeLevel: rows[0].knowledge_level,
        };
        await query(`SELECT set_config('app.current_user_id', $1, true)`, [rows[0].id]);
      }
    } catch {
      /* ignore invalid optional token */
    }
  }
  next();
}

function extractBearer(req: Request) {
  const h = req.headers.authorization;
  if (h?.startsWith("Bearer ")) return h.slice(7);
  return null;
}

function extractCookie(req: Request, name: string) {
  return req.cookies?.[name] as string | undefined;
}
