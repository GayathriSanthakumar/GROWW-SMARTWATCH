import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/asyncHandler.js";
import { query } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { badRequest } from "../lib/errors.js";

const router = Router();
router.use(requireAuth);

// GET /api/me
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const rows = await query(
      `SELECT id, email, email_verified, full_name, avatar_url, auth_provider, knowledge_level, onboarding_goals, risk_appetite, is_demo_account, created_at
       FROM users WHERE id = $1`,
      [req.user!.id],
    );
    const u = rows.rows[0];
    res.json({
      user: {
        id: u.id, email: u.email, emailVerified: u.email_verified, fullName: u.full_name, avatarUrl: u.avatar_url,
        authProvider: u.auth_provider, knowledgeLevel: u.knowledge_level, goals: u.onboarding_goals,
        riskAppetite: u.risk_appetite, isDemo: u.is_demo_account, createdAt: u.created_at,
      },
    });
  }),
);

const patchSchema = z.object({
  fullName: z.string().min(1).max(100).optional(),
  avatarUrl: z.string().nullable().optional(),
  knowledgeLevel: z.enum(["beginner", "intermediate", "advanced"]).optional(),
  goals: z.array(z.string()).optional(),
  riskAppetite: z.enum(["conservative", "moderate", "aggressive"]).optional(),
});

// PATCH /api/me
router.patch(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest(parsed.error.issues[0].message);
    const d = parsed.data;
    const sets: string[] = [];
    const params: unknown[] = [];
    const map: Record<string, string> = { fullName: "full_name", avatarUrl: "avatar_url", knowledgeLevel: "knowledge_level", goals: "onboarding_goals", riskAppetite: "risk_appetite" };
    for (const [k, v] of Object.entries(d)) {
      if (v === undefined) continue;
      params.push(v);
      sets.push(`${map[k]} = $${params.length}`);
    }
    if (sets.length) {
      params.push(req.user!.id);
      await query(`UPDATE users SET ${sets.join(", ")}, updated_at = now() WHERE id = $${params.length}`, params);
    }
    res.json({ ok: true });
  }),
);

// GET /api/me/entitlements
router.get(
  "/entitlements",
  asyncHandler(async (req, res) => {
    const rows = await query(`SELECT plan, status, trial_ends_at, current_period_end FROM subscriptions WHERE user_id = $1`, [req.user!.id]);
    const sub = rows.rows[0] || { plan: "free", status: "active" };
    const plan = sub.plan;
    res.json({
      plan,
      status: sub.status,
      trialEndsAt: sub.trial_ends_at,
      entitlements: {
        unlimitedWatchlists: plan !== "free",
        aiAnalystChat: plan !== "free",
        wealthBlueprint: plan !== "free",
        alphaGrowthScore: plan !== "free",
        etfSharia: plan !== "free",
        priorityAlerts: plan !== "free",
      },
    });
  }),
);

// DELETE /api/me — soft delete (30-day grace)
router.delete(
  "/",
  asyncHandler(async (req, res) => {
    await query(`UPDATE users SET deleted_at = now(), email = email || '_deleted_' || id::text WHERE id = $1`, [req.user!.id]);
    await query(`UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1`, [req.user!.id]);
    res.json({ ok: true });
  }),
);

export default router;
