import { Form, Link, redirect } from "react-router";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/pay";
import { requireActiveMember } from "~/lib/auth.server";
import { getDb, schema } from "~/lib/db.server";
import { getSettings } from "~/lib/settings.server";
import { createCheckout, stripeEnabled } from "~/lib/payments.server";
import { airwallexConfigured, airwallexEnv, confirmPayment, ensureIntent, type Payable } from "~/lib/airwallex.server";
import { AirwallexDropIn } from "~/components/airwallex-dropin";
import { formatDate, formatMoney } from "~/lib/format";
import { Alert, BackLink } from "~/components/ui";

export const meta: Route.MetaFunction = () => [{ title: "Payment · Crosscourt Social" }];

async function loadItem(env: Env, type: string, id: string, userId: string) {
  const db = getDb(env);
  if (type === "booking") {
    const b = await db.select().from(schema.bookings).where(eq(schema.bookings.id, id)).get();
    if (!b || b.userId !== userId) return null;
    const m = (await db.select().from(schema.matchDays).where(eq(schema.matchDays.id, b.matchDayId)).get())!;
    return { type: "booking" as const, id: b.id, amount: b.priceCents, status: b.paymentStatus, ref: b.paymentRef, name: `Extra session: ${m.title}`, sub: `${formatDate(m.date)} · ${m.startTime}`, back: `/matches/${m.id}` };
  }
  if (type === "event") {
    const r = await db.select().from(schema.eventRegistrations).where(eq(schema.eventRegistrations.id, id)).get();
    if (!r || r.userId !== userId) return null;
    const e = (await db.select().from(schema.events).where(eq(schema.events.id, r.eventId)).get())!;
    return { type: "event" as const, id: r.id, amount: r.priceCents, status: r.paymentStatus, ref: r.paymentRef, name: `Ticket: ${e.title}`, sub: `${formatDate(e.date)} · ${e.startTime}${r.guests ? ` · +${r.guests} guest${r.guests > 1 ? "s" : ""}` : ""}`, back: `/events/${e.id}` };
  }
  return null;
}

function toPayable(item: NonNullable<Awaited<ReturnType<typeof loadItem>>>, user: { id: string; email: string }): Payable {
  return { type: item.type, id: item.id, amountCents: item.amount, description: item.name, email: user.email, userId: user.id, paymentRef: item.ref, paymentStatus: item.status };
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const user = await requireActiveMember(request, env);
  const item = await loadItem(env, params.type, params.id, user.id);
  if (!item) throw new Response("Not found", { status: 404 });
  const settings = await getSettings(getDb(env));
  const url = new URL(request.url);
  const unpaid = item.status === "pending";
  let awx: { intentId: string; clientSecret: string; currency: string; env: "prod" | "demo" } | null = null;
  let awxError: string | null = null;
  if (unpaid && settings.paymentMode === "airwallex" && airwallexConfigured(env)) {
    try {
      const r = await ensureIntent(env, toPayable(item, user));
      if ("paid" in r) item.status = "paid";
      else awx = { ...r, env: airwallexEnv(env) };
    } catch (err) {
      console.error("[airwallex] intent failed", err);
      awxError = "Card payment is temporarily unavailable. Please try again in a minute or pay manually.";
    }
  }
  return {
    item,
    stripe: stripeEnabled(env) && settings.paymentMode === "stripe",
    awx,
    awxError,
    instructions: settings.paymentInstructions,
    justPaid: url.searchParams.get("paid") === "1",
    cancelled: url.searchParams.get("cancelled") === "1",
  };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const user = await requireActiveMember(request, env);
  const item = await loadItem(env, params.type, params.id, user.id);
  if (!item) throw new Response("Not found", { status: 404 });
  const form = await request.formData();
  if (form.get("intent") === "confirm") {
    // The Airwallex drop-in reported success in the browser; verify with Airwallex before trusting it.
    if (!airwallexConfigured(env)) return { error: "Card payments aren't enabled." };
    const r = await confirmPayment(env, toPayable(item, user));
    if (r.paid) throw redirect(`/pay/${params.type}/${params.id}?paid=1`);
    return { error: `Payment not confirmed yet (status ${r.status}). If you were charged, it will be marked paid automatically within the hour.` };
  }
  if (!stripeEnabled(env)) return { error: "Card payments aren't enabled." };
  const base = new URL(request.url).origin;
  const { url } = await createCheckout(env, {
    amountCents: item.amount,
    name: item.name,
    description: item.sub,
    customerEmail: user.email,
    successUrl: `${base}/pay/${params.type}/${params.id}?paid=1`,
    cancelUrl: `${base}/pay/${params.type}/${params.id}?cancelled=1`,
    metadata: { type: params.type, id: params.id, userId: user.id },
  });
  throw redirect(url);
}

export default function Pay({ loaderData: d, actionData }: Route.ComponentProps) {
  return (
    <div className="mx-auto max-w-md px-4 py-8">
      <BackLink to={d.item.back}>Back</BackLink>
      <div className="card p-6">
        <p className="eyebrow">Payment</p>
        <h1 className="mt-1 text-xl font-semibold">{d.item.name}</h1>
        <p className="text-sm text-ink-50">{d.item.sub}</p>
        <p className="serif-num mt-4 text-4xl text-ink">{formatMoney(d.item.amount)}</p>
        <div className="mt-4 space-y-3">
          {d.item.status === "paid" || d.item.status === "waived" ? (
            <Alert kind="success">Paid. You're all set.</Alert>
          ) : d.justPaid ? (
            <Alert kind="success">Thanks! Your payment is being confirmed. This page will show as paid shortly.</Alert>
          ) : (
            <>
              {d.cancelled && <Alert kind="warn">Payment was cancelled. Your spot is held until you pay.</Alert>}
              {actionData?.error && <Alert kind="error">{actionData.error}</Alert>}
              {d.awxError && <Alert kind="error">{d.awxError}</Alert>}
              {d.awx ? (
                <AirwallexDropIn intentId={d.awx.intentId} clientSecret={d.awx.clientSecret} currency={d.awx.currency} env={d.awx.env} />
              ) : d.stripe ? (
                <Form method="post">
                  <button className="btn btn-ink w-full">Pay by card</button>
                </Form>
              ) : (
                <div className="card-bone p-4 text-sm text-ink-70">
                  <p className="font-semibold text-ink">How to pay</p>
                  <p className="mt-1 whitespace-pre-line">{d.instructions}</p>
                  <p className="mt-2 text-xs text-ink-50">The club marks your payment as received. Your spot is held in the meantime.</p>
                </div>
              )}
            </>
          )}
          <Link to={d.item.back} className="btn btn-ghost w-full">
            Done
          </Link>
        </div>
      </div>
    </div>
  );
}
