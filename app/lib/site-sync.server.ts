// Pulls members from the sign-up site's CRM (club.crosscourt.social, a separate Worker
// with a KV member store) into this app. The site is the source of truth for who has
// signed up and paid; this app is the source of truth for padel level, group and role.
//
// Rules:
//  - paid            → member exists and is active (pending → active)
//  - started         → member exists as pending (they began checkout; admin can approve)
//  - lapsed          → member paused
//  - prospect/contacted (leads who never started) are ignored
//  - profile fields only fill blanks; nothing an admin or the member set is overwritten
//  - padel level is never set from the site; the self-declared level is kept for the coach
import { eq } from "drizzle-orm";
import { getDb, newId, schema } from "./db.server";
import { createLoginLink, normalizeEmail } from "./auth.server";
import { sendEmail } from "./email.server";
import { notifyUsers } from "./push.server";

export type SiteMember = {
  id: string;
  created?: string;
  source?: string;
  name?: string;
  email?: string;
  phone?: string;
  plan?: string;
  status?: string;
  paid_at?: string;
  level?: string;
  gender?: string;
  hand?: string;
  side?: string;
  session?: string;
  instagram?: string;
  profile_notes?: string;
  profile_at?: string;
};

export function siteSyncConfigured(env: Env) {
  return Boolean(env.SITE_CRM_KEY);
}

export async function fetchSiteMembers(env: Env): Promise<SiteMember[]> {
  const base = (env.SITE_URL || "https://club.crosscourt.social").replace(/\/$/, "");
  const res = await fetch(`${base}/api/crm/members?refresh=1`, { headers: { "x-crm-key": env.SITE_CRM_KEY! } });
  if (!res.ok) throw new Error(`Site CRM responded ${res.status}`);
  const data = (await res.json()) as { ok: boolean; members: SiteMember[] };
  if (!data.ok) throw new Error("Site CRM returned an error");
  return data.members;
}

const PLAN_LABELS: Record<string, string> = {
  fullAnnual: "Full · Yearly",
  fullMonthly: "Full · Monthly",
  associate: "Associate",
};

export type SyncResult = { created: number; updated: number; activated: number; paused: number; skipped: number; invited: number; errors: string[] };

export type UpsertOutcome = { userId: string; email: string; name: string; created: boolean; activated: boolean; paused: boolean } | { skipped: true };

const emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Creates or updates one app member from a site CRM record. Used by the hourly sync and the site's signup webhook. */
export async function upsertSiteMember(env: Env, m: SiteMember): Promise<UpsertOutcome> {
  const db = getDb(env);
  const email = normalizeEmail(m.email ?? "");
  const status = m.status ?? "prospect";
  if (!emailRe.test(email) || !["started", "paid", "lapsed"].includes(status)) return { skipped: true };
  const now = new Date().toISOString();
  const existing = await db.select().from(schema.users).where(eq(schema.users.email, email)).get();
  const gender = m.gender === "female" ? "female" : m.gender === "male" ? "male" : m.gender === "na" ? "other" : null;
  const sessionPref = m.session === "ladies" || m.session === "mixed" || m.session === "both" ? m.session : null;
  const memberType = gender === "male" ? "mixed" : sessionPref === "ladies" ? "female" : "mixed";
  const patch = {
    siteMemberId: m.id,
    siteStatus: status,
    siteSyncedAt: now,
    membershipPlan: PLAN_LABELS[m.plan ?? ""] ?? m.plan ?? null,
  };

  if (!existing) {
    if (status === "lapsed") return { skipped: true };
    const id = newId("u");
    await db.insert(schema.users).values({
      id,
      email,
      name: (m.name ?? "").trim(),
      phone: m.phone || null,
      gender,
      memberType,
      handedness: m.hand === "left" || m.hand === "right" ? m.hand : null,
      preferredSide: m.side === "left" || m.side === "right" || m.side === "either" ? m.side : null,
      instagram: m.instagram || null,
      selfLevel: m.level ?? null,
      sessionPref,
      onboardingNotes: m.profile_notes || null,
      status: status === "paid" ? "active" : "pending",
      ...patch,
    });
    return { userId: id, email, name: m.name ?? "", created: true, activated: status === "paid", paused: false };
  }

  // Existing member: fill blanks only, and follow payment status transitions.
  const set: Partial<typeof existing> = { ...patch };
  if (!existing.name && m.name) set.name = m.name.trim();
  if (!existing.phone && m.phone) set.phone = m.phone;
  if (!existing.gender && gender) {
    set.gender = gender;
    if (gender === "male") set.memberType = "mixed";
  }
  if (!existing.handedness && (m.hand === "left" || m.hand === "right")) set.handedness = m.hand;
  if (!existing.preferredSide && (m.side === "left" || m.side === "right" || m.side === "either")) set.preferredSide = m.side;
  if (!existing.instagram && m.instagram) set.instagram = m.instagram;
  if (!existing.selfLevel && m.level) set.selfLevel = m.level;
  if (!existing.sessionPref && sessionPref) set.sessionPref = sessionPref;
  if (!existing.onboardingNotes && m.profile_notes) set.onboardingNotes = m.profile_notes;
  let activated = false;
  let paused = false;
  if (existing.role !== "admin") {
    if (status === "paid" && existing.status === "pending") {
      set.status = "active";
      activated = true;
    } else if (status === "lapsed" && existing.status === "active") {
      set.status = "paused";
      paused = true;
    }
  }
  await db.update(schema.users).set(set).where(eq(schema.users.id, existing.id));
  return { userId: existing.id, email, name: existing.name || m.name || "", created: false, activated, paused };
}

export async function syncFromSite(env: Env, origin: string): Promise<SyncResult> {
  const db = getDb(env);
  const result: SyncResult = { created: 0, updated: 0, activated: 0, paused: 0, skipped: 0, invited: 0, errors: [] };
  const members = await fetchSiteMembers(env);
  const newlyActive: { id: string; email: string; name: string }[] = [];

  for (const m of members) {
    try {
      const r = await upsertSiteMember(env, m);
      if ("skipped" in r) {
        result.skipped++;
        continue;
      }
      if (r.created) result.created++;
      else result.updated++;
      if (r.activated) {
        result.activated++;
        newlyActive.push({ id: r.userId, email: r.email, name: r.name });
      }
      if (r.paused) result.paused++;
    } catch (err) {
      result.errors.push(`${m.email ?? m.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Welcome newly active members by email when email is configured; otherwise admins send a WhatsApp link.
  if (env.RESEND_API_KEY) {
    for (const u of newlyActive) {
      if (await sendWelcomeEmail(env, origin, u.id, u.email, u.name)) result.invited++;
    }
  }
  await notifyAdminsOfNewMembers(env, newlyActive);
  return result;
}

/**
 * The one welcome email: "your app is ready" with a one-time sign-in link. Sent at most once per
 * member (welcomeEmailAt). Pass `link` to reuse a link already handed to the member (creating a
 * new one would invalidate it).
 */
export async function sendWelcomeEmail(env: Env, origin: string, userId: string, email: string, name: string, link?: string): Promise<boolean> {
  if (!env.RESEND_API_KEY) return false;
  const db = getDb(env);
  const row = await db.select({ welcomeEmailAt: schema.users.welcomeEmailAt }).from(schema.users).where(eq(schema.users.id, userId)).get();
  if (row?.welcomeEmailAt) return false;
  link ??= await createLoginLink(env, origin, email);
  const first = name.split(" ")[0] || "there";
  const r = await sendEmail(
    env,
    email,
    "Your Crosscourt Social app is ready",
    `<div style="font-family:Inter,Segoe UI,system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#0E1020;background:#F5F1EA">
      <p style="letter-spacing:.22em;text-transform:uppercase;font-size:12px;margin:0 0 24px">Crosscourt Social</p>
      <h1 style="font-size:24px;margin:0 0 12px">Hola ${first}, you're in.</h1>
      <p style="margin:0 0 20px;color:#45475C">Book your hosted sessions, find a partner at your level, see events and member perks. Tap below to open the app and set up your player profile.</p>
      <p><a href="${link}" style="display:inline-block;background:#0E1020;color:#F5F1EA;padding:12px 20px;border-radius:12px;text-decoration:none;font-weight:600">Open the app</a></p>
      <p style="font-size:13px;color:#6E7082;margin-top:24px">This link works once and expires in 7 days. After that, sign in with your email and we'll send a code.</p>
    </div>`,
    `Hola ${first}, your Crosscourt Social app is ready. Open it here (works once, valid 7 days): ${link}`,
  );
  if (r.ok) await db.update(schema.users).set({ welcomeEmailAt: new Date().toISOString() }).where(eq(schema.users.id, userId));
  return r.ok;
}

export async function notifyAdminsOfNewMembers(env: Env, newlyActive: { id: string; email: string; name: string }[]) {
  if (newlyActive.length === 0) return;
  const db = getDb(env);
  const admins = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.role, "admin"));
  await notifyUsers(
    env,
    admins.map((a) => a.id),
    {
      title: `${newlyActive.length} new member${newlyActive.length === 1 ? "" : "s"} from the club site`,
      body: `${newlyActive.map((u) => u.name || u.email).slice(0, 4).join(", ")}${newlyActive.length > 4 ? "…" : ""}. Set their padel level when they've played.`,
      url: "/admin/members?f=unassessed",
      kind: "admin",
    },
  );
}

/**
 * Webhook called by the sign-up site right after a payment succeeds (and by its reminder job):
 * upserts the member and returns a one-time sign-in link that lands them in onboarding.
 */
export async function handleSiteSignup(request: Request, env: Env): Promise<Response> {
  if (!env.SITE_CRM_KEY) return Response.json({ ok: false, error: "not_configured" }, { status: 501 });
  if (request.headers.get("x-site-key") !== env.SITE_CRM_KEY) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  let body: { member?: SiteMember };
  try {
    body = (await request.json()) as { member?: SiteMember };
  } catch {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  if (!body.member?.email) return Response.json({ ok: false, error: "email_required" }, { status: 400 });
  const r = await upsertSiteMember(env, body.member);
  if ("skipped" in r) return Response.json({ ok: false, error: "not_eligible" }, { status: 422 });
  const origin = (env.APP_URL || new URL(request.url).origin).replace(/\/$/, "");
  const loginUrl = await createLoginLink(env, origin, r.email);
  if (r.activated) await notifyAdminsOfNewMembers(env, [{ id: r.userId, email: r.email, name: r.name }]);
  // Welcome email straight after payment, with the same link as the button on the site's success screen.
  const status = (await getDb(env).select({ status: schema.users.status }).from(schema.users).where(eq(schema.users.id, r.userId)).get())?.status;
  const emailed = status === "active" ? await sendWelcomeEmail(env, origin, r.userId, r.email, r.name, loginUrl) : false;
  return Response.json({ ok: true, loginUrl, created: r.created, activated: r.activated, emailed });
}
