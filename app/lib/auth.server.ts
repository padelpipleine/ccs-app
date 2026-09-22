import { and, eq, gt } from "drizzle-orm";
import { createCookie, redirect } from "react-router";
import { getDb, newId, schema, type Db } from "./db.server";
import { loginCodeEmail, sendEmail } from "./email.server";
import type { User } from "~/db/schema";

const SESSION_DAYS = 60;
const CODE_MINUTES = 10;

function sessionCookie(env: Env, request?: Request) {
  const secret = env.SESSION_SECRET || "dev-only-insecure-secret-change-me";
  return createCookie("ccs_session", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: request ? new URL(request.url).protocol === "https:" : true,
    secrets: [secret],
    maxAge: SESSION_DAYS * 86400,
  });
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

async function sha256(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomCode(): string {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return String(arr[0]! % 1_000_000).padStart(6, "0");
}

export function isAdminEmail(env: Env, email: string) {
  return (env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}

export function devCodeEnabled(env: Env) {
  return ["1", "true", "yes", "on"].includes((env.DEV_SHOW_LOGIN_CODE ?? "").trim().toLowerCase());
}

const LINK_DAYS = 7;

/**
 * Creates a one-time sign-in link for a member (valid 7 days), for admins to send by WhatsApp
 * when email isn't available. Replaces any pending code for that email.
 */
export async function createLoginLink(env: Env, origin: string, rawEmail: string): Promise<string> {
  const db = getDb(env);
  const email = normalizeEmail(rawEmail);
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const token = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  const expiresAt = new Date(Date.now() + LINK_DAYS * 86400_000).toISOString();
  await db.delete(schema.loginCodes).where(eq(schema.loginCodes.email, email));
  await db.insert(schema.loginCodes).values({ id: newId("lc"), email, codeHash: await sha256(`${email}:${token}`), expiresAt });
  return `${origin}/login/link?${new URLSearchParams({ email, token })}`;
}

/** Only existing members (created by the sign-up site, the sync, a sign-in link or an admin) and configured admins can sign in. */
export async function isKnownMember(env: Env, email: string): Promise<boolean> {
  if (isAdminEmail(env, email)) return true;
  const row = await getDb(env).select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email)).get();
  return Boolean(row);
}

/**
 * Step 1: create and email a 6-digit code. Returns the code only when DEV_SHOW_LOGIN_CODE is set.
 * Unknown emails get `unknown: true` and nothing is created or sent.
 */
export async function startLogin(env: Env, rawEmail: string): Promise<{ devCode?: string; emailSent: boolean; unknown?: boolean }> {
  const db = getDb(env);
  const email = normalizeEmail(rawEmail);
  if (!(await isKnownMember(env, email))) return { emailSent: false, unknown: true };
  const code = randomCode();
  const expiresAt = new Date(Date.now() + CODE_MINUTES * 60_000).toISOString();
  await db.delete(schema.loginCodes).where(eq(schema.loginCodes.email, email));
  await db.insert(schema.loginCodes).values({ id: newId("lc"), email, codeHash: await sha256(`${email}:${code}`), expiresAt });
  const { html, text } = loginCodeEmail(code, env.APP_NAME);
  const result = await sendEmail(env, email, `${code} is your ${env.APP_NAME} code`, html, text);
  const showDev = devCodeEnabled(env) || (!env.RESEND_API_KEY && import.meta.env.DEV);
  return { devCode: showDev ? code : undefined, emailSent: result.ok };
}

/** Step 2: verify the code, create/find the user, and return a Set-Cookie header. */
export async function completeLogin(
  env: Env,
  request: Request,
  rawEmail: string,
  code: string,
): Promise<{ ok: true; headers: HeadersInit; user: User; isNew: boolean } | { ok: false; error: string }> {
  const db = getDb(env);
  const email = normalizeEmail(rawEmail);
  const row = await db
    .select()
    .from(schema.loginCodes)
    .where(and(eq(schema.loginCodes.email, email), gt(schema.loginCodes.expiresAt, new Date().toISOString())))
    .get();
  if (!row) return { ok: false, error: "That code has expired. Request a new one." };
  if (row.attempts >= 5) return { ok: false, error: "Too many attempts. Request a new code." };
  const hash = await sha256(`${email}:${code.trim()}`);
  if (hash !== row.codeHash) {
    await db.update(schema.loginCodes).set({ attempts: row.attempts + 1 }).where(eq(schema.loginCodes.id, row.id));
    return { ok: false, error: "That code isn't right. Check your email and try again." };
  }
  await db.delete(schema.loginCodes).where(eq(schema.loginCodes.email, email));

  let user = await db.select().from(schema.users).where(eq(schema.users.email, email)).get();
  let isNew = false;
  const admin = isAdminEmail(env, email);
  if (!user && !admin) return { ok: false, error: "We don't have a membership under this email." };
  if (!user) {
    isNew = true;
    const id = newId("u");
    await db.insert(schema.users).values({
      id,
      email,
      name: "",
      role: admin ? "admin" : "member",
      status: admin ? "active" : "pending",
    });
    user = (await db.select().from(schema.users).where(eq(schema.users.id, id)).get())!;
  } else if (admin && user.role !== "admin") {
    await db.update(schema.users).set({ role: "admin", status: "active" }).where(eq(schema.users.id, user.id));
    user = { ...user, role: "admin", status: "active" };
  }
  if (user.status === "archived") return { ok: false, error: "This account is no longer active. Contact the club." };

  const sessionId = newId("s");
  await db.insert(schema.sessions).values({
    id: sessionId,
    userId: user.id,
    expiresAt: new Date(Date.now() + SESSION_DAYS * 86400_000).toISOString(),
  });
  await db.update(schema.users).set({ lastSeenAt: new Date().toISOString() }).where(eq(schema.users.id, user.id));
  const cookie = sessionCookie(env, request);
  return { ok: true, headers: { "Set-Cookie": await cookie.serialize(sessionId) }, user, isNew };
}

export async function getUser(request: Request, env: Env): Promise<User | null> {
  const cookie = sessionCookie(env, request);
  const sessionId = (await cookie.parse(request.headers.get("Cookie"))) as string | null;
  if (!sessionId) return null;
  const db = getDb(env);
  const row = await db
    .select({ user: schema.users, expiresAt: schema.sessions.expiresAt })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(eq(schema.sessions.id, sessionId))
    .get();
  if (!row || row.expiresAt < new Date().toISOString()) return null;
  if (row.user.status === "archived") return null;
  return row.user;
}

export async function requireUser(request: Request, env: Env): Promise<User> {
  const user = await getUser(request, env);
  if (!user) {
    const url = new URL(request.url);
    throw redirect(`/login?next=${encodeURIComponent(url.pathname + url.search)}`);
  }
  return user;
}

export function needsOnboarding(user: Pick<User, "name" | "onboardedAt">) {
  return !user.name || !user.onboardedAt;
}

/** Non-admins must have an active (paid) membership to use the app. */
export function membershipBlocked(user: Pick<User, "status" | "role">) {
  return user.role !== "admin" && user.status !== "active";
}

/** Where to send someone right after signing in. */
export function postLoginTarget(user: User, next = "/") {
  if (membershipBlocked(user)) return "/membership";
  if (needsOnboarding(user)) return "/onboarding";
  return next.startsWith("/") ? next : "/";
}

/** Active member who has completed the in-app profile questions. */
export async function requireActiveMember(request: Request, env: Env): Promise<User> {
  const user = await requireUser(request, env);
  if (membershipBlocked(user)) throw redirect("/membership");
  if (needsOnboarding(user)) throw redirect("/onboarding");
  return user;
}

export async function requireAdmin(request: Request, env: Env): Promise<User> {
  const user = await requireUser(request, env);
  if (user.role !== "admin") throw redirect("/");
  return user;
}

export async function logout(request: Request, env: Env): Promise<HeadersInit> {
  const cookie = sessionCookie(env, request);
  const sessionId = (await cookie.parse(request.headers.get("Cookie"))) as string | null;
  if (sessionId) await getDb(env).delete(schema.sessions).where(eq(schema.sessions.id, sessionId));
  return { "Set-Cookie": await cookie.serialize("", { maxAge: 0 }) };
}

export async function userById(db: Db, id: string) {
  return db.select().from(schema.users).where(eq(schema.users.id, id)).get();
}
