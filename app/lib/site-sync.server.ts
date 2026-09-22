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

export async function syncFromSite(env: Env, origin: string): Promise<SyncResult> {
  const db = getDb(env);
  const result: SyncResult = { created: 0, updated: 0, activated: 0, paused: 0, skipped: 0, invited: 0, errors: [] };
  const members = await fetchSiteMembers(env);
  const now = new Date().toISOString();
  const newlyActive: { id: string; email: string; name: string }[] = [];

  for (const m of members) {
    const email = normalizeEmail(m.email ?? "");
    const status = m.status ?? "prospect";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !["started", "paid", "lapsed"].includes(status)) {
      result.skipped++;
      continue;
    }
    try {
      const existing = await db.select().from(schema.users).where(eq(schema.users.email, email)).get();
      const gender = m.gender === "female" ? "female" : m.gender === "male" ? "male" : m.gender === "na" ? "other" : null;
      const memberType = gender === "male" ? "mixed" : m.session === "ladies" ? "female" : "mixed";
      const patch = {
        siteMemberId: m.id,
        siteStatus: status,
        selfLevel: m.level ?? null,
        siteSyncedAt: now,
        membershipPlan: PLAN_LABELS[m.plan ?? ""] ?? m.plan ?? null,
      };

      if (!existing) {
        if (status === "lapsed") {
          result.skipped++;
          continue;
        }
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
          bio: null,
          adminNotes: m.profile_notes ? `From welcome form: ${m.profile_notes}` : null,
          status: status === "paid" ? "active" : "pending",
          ...patch,
        });
        result.created++;
        if (status === "paid") {
          result.activated++;
          newlyActive.push({ id, email, name: m.name ?? "" });
        }
        continue;
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
      if (existing.role !== "admin") {
        if (status === "paid" && existing.status === "pending") {
          set.status = "active";
          result.activated++;
          newlyActive.push({ id: existing.id, email, name: existing.name || m.name || "" });
        } else if (status === "lapsed" && existing.status === "active") {
          set.status = "paused";
          result.paused++;
        }
      }
      await db.update(schema.users).set(set).where(eq(schema.users.id, existing.id));
      result.updated++;
    } catch (err) {
      result.errors.push(`${email}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Welcome newly active members by email when email is configured; otherwise admins send a WhatsApp link.
  if (env.RESEND_API_KEY) {
    for (const u of newlyActive) {
      const link = await createLoginLink(env, origin, u.email);
      const first = u.name.split(" ")[0] || "there";
      const r = await sendEmail(
        env,
        u.email,
        "Your Crosscourt Social app is ready",
        `<div style="font-family:Inter,Segoe UI,system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#0E1020;background:#F5F1EA">
          <p style="letter-spacing:.22em;text-transform:uppercase;font-size:12px;margin:0 0 24px">Crosscourt Social</p>
          <h1 style="font-size:24px;margin:0 0 12px">Hola ${first}, you're in.</h1>
          <p style="margin:0 0 20px;color:#45475C">Book your hosted sessions, find a partner at your level, see events and member perks. Tap below to open the app and set up your profile.</p>
          <p><a href="${link}" style="display:inline-block;background:#0E1020;color:#F5F1EA;padding:12px 20px;border-radius:12px;text-decoration:none;font-weight:600">Open the app</a></p>
          <p style="font-size:13px;color:#6E7082;margin-top:24px">This link works once and expires in 7 days. After that, sign in with your email and we'll send a code.</p>
        </div>`,
        `Hola ${first}, your Crosscourt Social app is ready. Open it here (works once, valid 7 days): ${link}`,
      );
      if (r.ok) result.invited++;
    }
  }

  // Tell admins about new members so they can set levels / send links.
  if (newlyActive.length > 0) {
    const admins = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.role, "admin"));
    await notifyUsers(
      env,
      admins.map((a) => a.id),
      {
        title: `${newlyActive.length} new member${newlyActive.length === 1 ? "" : "s"} from the club site`,
        body: `${newlyActive.map((u) => u.name || u.email).slice(0, 4).join(", ")}${newlyActive.length > 4 ? "…" : ""}. Set their padel level and send a sign-in link.`,
        url: "/admin/members?f=unassessed",
        kind: "admin",
      },
    );
  }
  return result;
}
