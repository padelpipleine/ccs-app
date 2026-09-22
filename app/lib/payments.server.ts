import { eq } from "drizzle-orm";
import { getDb, schema } from "./db.server";
import { notifyUsers } from "./push.server";

export function stripeEnabled(env: Env) {
  return Boolean(env.STRIPE_SECRET_KEY);
}

type CheckoutInput = {
  amountCents: number;
  name: string;
  description?: string;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
};

/** Creates a Stripe Checkout session using the REST API (no SDK needed on Workers). */
export async function createCheckout(env: Env, input: CheckoutInput): Promise<{ url: string; id: string }> {
  const form = new URLSearchParams();
  form.set("mode", "payment");
  form.set("success_url", input.successUrl);
  form.set("cancel_url", input.cancelUrl);
  form.set("customer_email", input.customerEmail);
  form.set("line_items[0][quantity]", "1");
  form.set("line_items[0][price_data][currency]", "eur");
  form.set("line_items[0][price_data][unit_amount]", String(input.amountCents));
  form.set("line_items[0][price_data][product_data][name]", input.name);
  if (input.description) form.set("line_items[0][price_data][product_data][description]", input.description);
  for (const [k, v] of Object.entries(input.metadata)) form.set(`metadata[${k}]`, v);
  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });
  const json = (await res.json()) as { url?: string; id?: string; error?: { message: string } };
  if (!res.ok || !json.url) throw new Error(json.error?.message ?? "Stripe checkout failed");
  return { url: json.url, id: json.id! };
}

async function verifyStripeSignature(secret: string, payload: string, header: string): Promise<boolean> {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const t = parts["t"];
  const v1 = parts["v1"];
  if (!t || !v1) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${payload}`));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex === v1;
}

/** Marks a booking or event registration as paid. Used by the webhook and by admins. */
export async function markPaid(env: Env, type: string, id: string, ref: string | null) {
  const db = getDb(env);
  if (type === "booking") {
    const b = await db.select().from(schema.bookings).where(eq(schema.bookings.id, id)).get();
    if (!b || b.paymentStatus === "paid") return;
    await db.update(schema.bookings).set({ paymentStatus: "paid", paymentRef: ref, updatedAt: new Date().toISOString() }).where(eq(schema.bookings.id, id));
    await notifyUsers(env, [b.userId], { title: "Payment received", body: "Your extra session is confirmed. See you on court!", url: `/matches/${b.matchDayId}`, kind: "payment" });
  } else if (type === "event") {
    const r = await db.select().from(schema.eventRegistrations).where(eq(schema.eventRegistrations.id, id)).get();
    if (!r || r.paymentStatus === "paid") return;
    await db.update(schema.eventRegistrations).set({ paymentStatus: "paid", paymentRef: ref }).where(eq(schema.eventRegistrations.id, id));
    await notifyUsers(env, [r.userId], { title: "Ticket confirmed", body: "Payment received — you're on the list.", url: `/events/${r.eventId}`, kind: "payment" });
  }
}

export async function handleStripeWebhook(request: Request, env: Env): Promise<Response> {
  if (!env.STRIPE_WEBHOOK_SECRET) return new Response("webhook not configured", { status: 501 });
  const payload = await request.text();
  const sig = request.headers.get("stripe-signature") ?? "";
  if (!(await verifyStripeSignature(env.STRIPE_WEBHOOK_SECRET, payload, sig))) return new Response("bad signature", { status: 400 });
  const event = JSON.parse(payload) as { type: string; data: { object: { id: string; metadata?: Record<string, string>; payment_status?: string } } };
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const obj = event.data.object;
    if (obj.payment_status === "paid" || event.type === "checkout.session.async_payment_succeeded") {
      const type = obj.metadata?.type;
      const id = obj.metadata?.id;
      if (type && id) await markPaid(env, type, id, obj.id);
    }
  }
  return new Response("ok");
}
