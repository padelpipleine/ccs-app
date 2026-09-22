// Airwallex card payments for in-app extras (second weekly session, event tickets).
// Mirrors the integration on club.crosscourt.social: the browser talks to Airwallex's
// drop-in element directly, so card details never touch this Worker. We create the
// payment intent, hand its client_secret to the page, and verify the intent's status
// with Airwallex before marking anything paid.
import { and, eq, like } from "drizzle-orm";
import { getDb, schema } from "./db.server";
import { markPaid } from "./payments.server";

export const AWX_REF_PREFIX = "awx:";

export function airwallexConfigured(env: Env) {
  return Boolean(env.AIRWALLEX_CLIENT_ID && env.AIRWALLEX_API_KEY);
}

export function airwallexEnv(env: Env): "prod" | "demo" {
  return env.AIRWALLEX_ENV === "demo" ? "demo" : "prod";
}

function apiBase(env: Env) {
  if (env.AIRWALLEX_API_BASE) return env.AIRWALLEX_API_BASE.replace(/\/$/, "");
  return airwallexEnv(env) === "demo" ? "https://api-demo.airwallex.com" : "https://api.airwallex.com";
}

async function login(env: Env): Promise<string> {
  const r = await fetch(`${apiBase(env)}/api/v1/authentication/login`, {
    method: "POST",
    headers: { "x-client-id": env.AIRWALLEX_CLIENT_ID!, "x-api-key": env.AIRWALLEX_API_KEY!, "content-type": "application/json" },
    body: "{}",
  });
  if (!r.ok) throw new Error(`Airwallex auth failed: ${r.status}`);
  return ((await r.json()) as { token: string }).token;
}

async function api<T>(env: Env, token: string, method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const r = await fetch(`${apiBase(env)}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await r.json().catch(() => ({}))) as T & { code?: string; message?: string };
  if (!r.ok) throw new Error(`Airwallex ${path} failed: ${r.status} ${data.code ?? ""} ${data.message ?? ""}`.trim());
  return data;
}

type Intent = { id: string; status: string; client_secret?: string; amount: number; currency: string };

export type Payable = { type: "booking" | "event"; id: string; amountCents: number; description: string; email: string; userId: string; paymentRef: string | null; paymentStatus: string };

/**
 * Returns an intent the page can mount the drop-in with, reusing the one on record when it is
 * still payable, and marks the item paid if Airwallex already shows it succeeded.
 */
export async function ensureIntent(env: Env, item: Payable): Promise<{ intentId: string; clientSecret: string; currency: string } | { paid: true }> {
  const token = await login(env);
  if (item.paymentRef?.startsWith(AWX_REF_PREFIX)) {
    const id = item.paymentRef.slice(AWX_REF_PREFIX.length);
    try {
      const existing = await api<Intent>(env, token, "GET", `/api/v1/pa/payment_intents/${id}`);
      if (existing.status === "SUCCEEDED") {
        await markPaid(env, item.type, item.id, item.paymentRef);
        return { paid: true };
      }
      if (existing.client_secret && ["REQUIRES_PAYMENT_METHOD", "REQUIRES_CUSTOMER_ACTION", "PENDING"].includes(existing.status)) {
        return { intentId: existing.id, clientSecret: existing.client_secret, currency: existing.currency };
      }
    } catch (err) {
      console.warn("[airwallex] could not reuse intent, creating a new one", err);
    }
  }
  const intent = await api<Intent>(env, token, "POST", "/api/v1/pa/payment_intents/create", {
    request_id: crypto.randomUUID(),
    amount: item.amountCents / 100,
    currency: "EUR",
    merchant_order_id: `ccs-${item.type}-${item.id}`,
    descriptor: "Crosscourt Social",
    metadata: { type: item.type, id: item.id, userId: item.userId, email: item.email },
  });
  const ref = `${AWX_REF_PREFIX}${intent.id}`;
  const db = getDb(env);
  if (item.type === "booking") await db.update(schema.bookings).set({ paymentRef: ref }).where(eq(schema.bookings.id, item.id));
  else await db.update(schema.eventRegistrations).set({ paymentRef: ref }).where(eq(schema.eventRegistrations.id, item.id));
  return { intentId: intent.id, clientSecret: intent.client_secret!, currency: intent.currency };
}

/** Verifies with Airwallex that the item's intent succeeded, then marks it paid. */
export async function confirmPayment(env: Env, item: Payable): Promise<{ paid: boolean; status: string }> {
  if (!item.paymentRef?.startsWith(AWX_REF_PREFIX)) return { paid: false, status: "no_intent" };
  const token = await login(env);
  const intent = await api<Intent>(env, token, "GET", `/api/v1/pa/payment_intents/${item.paymentRef.slice(AWX_REF_PREFIX.length)}`);
  if (intent.status === "SUCCEEDED") {
    await markPaid(env, item.type, item.id, item.paymentRef);
    return { paid: true, status: intent.status };
  }
  return { paid: false, status: intent.status };
}

/** Hourly: settle any pending Airwallex payments whose browser never reported back. */
export async function reconcilePendingPayments(env: Env): Promise<number> {
  if (!airwallexConfigured(env)) return 0;
  const db = getDb(env);
  const bookings = await db
    .select({ id: schema.bookings.id, ref: schema.bookings.paymentRef })
    .from(schema.bookings)
    .where(and(eq(schema.bookings.paymentStatus, "pending"), like(schema.bookings.paymentRef, `${AWX_REF_PREFIX}%`)))
    .limit(50);
  const regs = await db
    .select({ id: schema.eventRegistrations.id, ref: schema.eventRegistrations.paymentRef })
    .from(schema.eventRegistrations)
    .where(and(eq(schema.eventRegistrations.paymentStatus, "pending"), like(schema.eventRegistrations.paymentRef, `${AWX_REF_PREFIX}%`)))
    .limit(50);
  if (bookings.length + regs.length === 0) return 0;
  const token = await login(env);
  let settled = 0;
  for (const [type, rows] of [["booking", bookings], ["event", regs]] as const) {
    for (const r of rows) {
      try {
        const intent = await api<Intent>(env, token, "GET", `/api/v1/pa/payment_intents/${r.ref!.slice(AWX_REF_PREFIX.length)}`);
        if (intent.status === "SUCCEEDED") {
          await markPaid(env, type, r.id, r.ref);
          settled++;
        }
      } catch (err) {
        console.warn("[airwallex] reconcile failed", r.id, err);
      }
    }
  }
  return settled;
}
