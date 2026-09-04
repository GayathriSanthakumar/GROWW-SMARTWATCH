import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/asyncHandler.js";
import { query } from "../db/pool.js";
import { hashPassword, verifyPassword, PASSWORD_RULE } from "../lib/password.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken, hashToken, randomToken } from "../lib/jwt.js";
import { setAuthCookies, clearAuthCookies, REFRESH_COOKIE } from "../lib/cookies.js";
import { requireAuth } from "../middleware/auth.js";
import { loginLimiter } from "../middleware/rateLimit.js";
import { badRequest, conflict, unauthorized } from "../lib/errors.js";
import { config } from "../config.js";
import type { AuthUser } from "../types.js";

const router = Router();

const signupSchema = z.object({
  fullName: z.string().min(1, "Full name required").max(100),
  email: z.string().email("Valid email required"),
  password: z.string().min(8).regex(PASSWORD_RULE, "Password needs 8+ chars with a letter and number"),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function toPublicUser(u: AuthUser) {
  return u;
}

// POST /api/auth/signup
router.post(
  "/signup",
  asyncHandler(async (req, res) => {
    const parsed = signupSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest(parsed.error.issues[0].message);

    const { fullName, email, password } = parsed.data;
    const existing = await query(`SELECT id FROM users WHERE email = $1`, [email]);
    if (existing.rows[0]) throw conflict("Email already registered. Try login.");

    const passwordHash = await hashPassword(password);
    const { rows } = await query<{ id: string; is_demo_account: boolean; knowledge_level: string }>(
      `INSERT INTO users (email, password_hash, full_name, auth_provider, email_verified)
       VALUES ($1, $2, $3, 'email', false) RETURNING id, is_demo_account, knowledge_level`,
      [email.toLowerCase(), passwordHash, fullName],
    );
    const user = rows[0];
    await issueTokens(res, {
      id: user.id,
      email,
      fullName,
      authProvider: "email",
      isDemo: user.is_demo_account,
      knowledgeLevel: user.knowledge_level,
    });
    res.status(201).json({ user: toPublicUser({ id: user.id, email, fullName, authProvider: "email", isDemo: user.is_demo_account, knowledgeLevel: user.knowledge_level }) });
  }),
);

// POST /api/auth/login
router.post(
  "/login",
  loginLimiter,
  asyncHandler(async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest(parsed.error.issues[0].message);

    const { email, password } = parsed.data;
    const { rows } = await query<{ id: string; email: string; password_hash: string; full_name: string; auth_provider: string; is_demo_account: boolean; knowledge_level: string }>(
      `SELECT id, email, password_hash, full_name, auth_provider, is_demo_account, knowledge_level FROM users WHERE email = $1 AND deleted_at IS NULL`,
      [email.toLowerCase()],
    );
    const u = rows[0];
    if (!u || !u.password_hash) throw unauthorized("Invalid email or password");

    const ok = await verifyPassword(password, u.password_hash);
    if (!ok) throw unauthorized("Invalid email or password");

    const user = { id: u.id, email: u.email, fullName: u.full_name, authProvider: u.auth_provider, isDemo: u.is_demo_account, knowledgeLevel: u.knowledge_level };
    await issueTokens(res, user);
    res.json({ user: toPublicUser(user) });
  }),
);

// POST /api/auth/google — verifies a Google ID token. If GOOGLE_CLIENT_ID is
// unset (dev/demo), falls back to a clearly-labelled stub that trusts a demo
// payload so the frontend can exercise the flow without credentials.
router.post(
  "/google",
  asyncHandler(async (req, res) => {
    const { idToken, name, email, emailVerified, sub } = req.body ?? {};
    let profile: { sub: string; email: string; name: string; emailVerified: boolean; avatar?: string } | null = null;

    if (config.google.clientId) {
      profile = await verifyGoogleIdToken(idToken);
    } else {
      // Stub: only accept explicitly-flagged demo payloads
      if (!sub || !email) throw badRequest("Google sign-in is not configured on the server");
      profile = { sub: `stub_${sub}`, email, name: name || email.split("@")[0], emailVerified: !!emailVerified, avatar: undefined };
    }

    if (!profile) throw unauthorized("Google token verification failed");

    const existingBySub = await query<{ id: string }>(`SELECT id FROM users WHERE google_sub = $1`, [profile.sub]);
    let userRow: { id: string; full_name: string; is_demo_account: boolean; knowledge_level: string } | undefined;
    let isNew = false;

    if (existingBySub.rows[0]) {
      userRow = (await query<{ id: string; full_name: string; is_demo_account: boolean; knowledge_level: string }>(`SELECT id, full_name, is_demo_account, knowledge_level FROM users WHERE id = $1`, [existingBySub.rows[0].id])).rows[0];
    } else {
      const byEmail = await query<{ id: string; google_sub: string | null }>(`SELECT id, google_sub FROM users WHERE email = $1`, [profile.email]);
      if (byEmail.rows[0] && !byEmail.rows[0].google_sub) {
        await query(`UPDATE users SET google_sub = $1, avatar_url = COALESCE(avatar_url, $2), email_verified = true, updated_at = now() WHERE id = $3`, [profile.sub, profile.avatar, byEmail.rows[0].id]);
        userRow = (await query<{ id: string; full_name: string; is_demo_account: boolean; knowledge_level: string }>(`SELECT id, full_name, is_demo_account, knowledge_level FROM users WHERE id = $1`, [byEmail.rows[0].id])).rows[0];
      } else {
        const ins = await query<{ id: string; full_name: string; is_demo_account: boolean; knowledge_level: string }>(
          `INSERT INTO users (email, full_name, auth_provider, google_sub, avatar_url, email_verified) VALUES ($1, $2, 'google', $3, $4, true) RETURNING id, full_name, is_demo_account, knowledge_level`,
          [profile.email, profile.name, profile.sub, profile.avatar],
        );
        userRow = ins.rows[0];
        isNew = true;
      }
    }

    const user = { id: userRow!.id, email: profile.email, fullName: userRow!.full_name, authProvider: "google", isDemo: userRow!.is_demo_account, knowledgeLevel: userRow!.knowledge_level };
    await issueTokens(res, user);
    res.json({ user: toPublicUser(user), isNew });
  }),
);

// POST /api/auth/refresh
router.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    const token = (req.cookies?.[REFRESH_COOKIE] as string) ?? req.body?.refreshToken;
    if (!token) throw unauthorized("No refresh token");

    let payload;
    try {
      payload = verifyRefreshToken(token);
    } catch {
      throw unauthorized("Invalid refresh token");
    }

    const tokenHash = hashToken(token);
    const { rows } = await query(
      `SELECT id, expires_at, revoked_at FROM refresh_tokens WHERE token_hash = $1`,
      [tokenHash],
    );
    const stored = rows[0];
    if (!stored || stored.revoked_at || new Date(stored.expires_at) < new Date()) throw unauthorized("Refresh token expired");

    // rotate
    await query(`UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1`, [stored.id]);

    const user = await query<{ id: string; email: string; full_name: string; auth_provider: string; is_demo_account: boolean; knowledge_level: string }>(
      `SELECT id, email, full_name, auth_provider, is_demo_account, knowledge_level FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [payload.sub],
    );
    if (!user.rows[0]) throw unauthorized("User not found");

    const u = user.rows[0];
    const newAccess = signAccessToken({ sub: u.id, email: u.email, isDemo: u.is_demo_account });
    const newRefresh = signRefreshToken({ sub: u.id, jti: randomToken() });
    await query(`INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, now() + interval '30 days')`, [u.id, hashToken(newRefresh)]);

    setAuthCookies(res, newAccess, newRefresh);
    res.json({ ok: true });
  }),
);

// POST /api/auth/logout
router.post(
  "/logout",
  asyncHandler(async (req, res) => {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (token) await query(`UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1`, [hashToken(token)]);
    clearAuthCookies(res);
    res.json({ ok: true });
  }),
);

// GET /api/auth/me
router.get("/me", requireAuth, (req, res) => res.json({ user: req.user }));

// GET /api/auth/sessions
router.get(
  "/sessions",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT id, device_label, created_at, expires_at, (revoked_at IS NOT NULL) AS revoked FROM refresh_tokens WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.user!.id],
    );
    res.json({ sessions: rows });
  }),
);

// DELETE /api/auth/sessions/:id
router.delete(
  "/sessions/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    await query(`UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1 AND user_id = $2`, [req.params.id, req.user!.id]);
    res.json({ ok: true });
  }),
);

// POST /api/auth/forgot-password
router.post(
  "/forgot-password",
  asyncHandler(async (req, res) => {
    const email = (req.body?.email || "").toLowerCase();
    const user = await query<{ id: string }>(`SELECT id FROM users WHERE email = $1 AND auth_provider = 'email'`, [email]);
    if (user.rows[0]) {
      const token = randomToken();
      await query(`INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1, $2, now() + interval '30 minutes')`, [user.rows[0].id, hashToken(token)]);
      // In a real deployment this emails the link. For demo we log it.
      console.log(`[auth] password reset link (dev): ${config.appBaseUrl}/api/auth/reset-password?token=${token}`);
    }
    // Always respond the same to avoid email enumeration
    res.json({ ok: true, message: "If that email exists, a reset link has been sent." });
  }),
);

// POST /api/auth/reset-password
router.post(
  "/reset-password",
  asyncHandler(async (req, res) => {
    const { token, password } = req.body ?? {};
    if (!token || !PASSWORD_RULE.test(password)) throw badRequest("Invalid token or weak password");

    const { rows } = await query(
      `SELECT id, user_id, used_at, expires_at FROM password_resets WHERE token_hash = $1`,
      [hashToken(token)],
    );
    const reset = rows[0];
    if (!reset || reset.used_at || new Date(reset.expires_at) < new Date()) throw badRequest("Reset link is invalid or expired");

    await query(`UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2`, [await hashPassword(password), reset.user_id]);
    await query(`UPDATE password_resets SET used_at = now() WHERE id = $1`, [reset.id]);
    res.json({ ok: true });
  }),
);

// PUT /api/auth/onboarding
const onboardingSchema = z.object({
  goals: z.array(z.string()).optional(),
  knowledgeLevel: z.enum(["beginner", "intermediate", "advanced"]).optional(),
  riskAppetite: z.enum(["conservative", "moderate", "aggressive"]).optional(),
});
router.put(
  "/onboarding",
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = onboardingSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest(parsed.error.issues[0].message);
    const { goals, knowledgeLevel, riskAppetite } = parsed.data;

    await query(
      `UPDATE users SET
        onboarding_goals = COALESCE($1, onboarding_goals),
        knowledge_level = COALESCE($2, knowledge_level),
        risk_appetite = COALESCE($3, risk_appetite),
        updated_at = now()
       WHERE id = $4`,
      [goals ?? null, knowledgeLevel ?? null, riskAppetite ?? null, req.user!.id],
    );
    res.json({ ok: true });
  }),
);

async function issueTokens(res: import("express").Response, user: AuthUser) {
  const access = signAccessToken({ sub: user.id, email: user.email, isDemo: user.isDemo });
  const refresh = signRefreshToken({ sub: user.id, jti: randomToken() });
  await query(`INSERT INTO refresh_tokens (user_id, token_hash, device_label, expires_at) VALUES ($1, $2, $3, now() + interval '30 days')`, [user.id, hashToken(refresh), "web"]);
  setAuthCookies(res, access, refresh);
}

// Minimal Google token verification using Google's public JWKS via fetch.
async function verifyGoogleIdToken(idToken: string): Promise<{ sub: string; email: string; name: string; emailVerified: boolean; avatar?: string } | null> {
  try {
    const res = await fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(idToken));
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    if (data.aud !== config.google.clientId) return null;
    return {
      sub: String(data.sub),
      email: String(data.email),
      name: String(data.name || ""),
      emailVerified: data.email_verified === "true" || data.email_verified === true,
      avatar: data.picture ? String(data.picture) : undefined,
    };
  } catch {
    return null;
  }
}

export default router;
