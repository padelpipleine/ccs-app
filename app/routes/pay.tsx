import { Form, Link, redirect } from "react-router";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/pay";
import { requireActiveMember } from "~/lib/auth.server";
import { getDb, schema } from "~/lib/db.server";
import { getSettings } from "~/lib/settings.server";
import { createCheckout, stripeEnabled } from "~/lib/payments.server";
import { formatDate, formatMoney } from "~/lib/format";
import { Alert, BackLink } from "~/components/ui";

export const meta: Route.MetaFunction = () => [{ title: "Payment · Crosscourt Social" }];

async function loadItem(env: Env, type: string, id: string, userId: string) {
  const db = getDb(env);
  if (type === "booking") {
    const b = await db.select().from(schema.bookings).where(eq(schema.bookings.id, id)).get();
    if (!b || b.userId !== userId) return null;
    const m = (await db.select().from(schema.matchDays).where(eq(schema.matchDays.id, b.matchDayId)).get())!;
    return { amount: b.priceCents, status: b.paymentStatus, name: `Extra session: ${m.title}`, sub: `${formatDate(m.date)} · ${m.startTime}`, back: `/matches/${m.id}` };
  }
  if (type === "event") {
    const r = await db.select().from(schema.eventRegistrations).where(eq(schema.eventRegistrations.id, id)).get();
    if (!r || r.userId !== userId) return null;
    const e = (await db.select().from(schema.events).where(eq(schema.events.id, r.eventId)).get())!;
    return { amount: r.priceCents, status: r.paymentStatus, name: `Ticket: ${e.title}`, sub: `${formatDate(e.date)} · ${e.startTime}${r.guests ? ` · +${r.guests} guest${r.guests > 1 ? "s" : ""}` : ""}`, back: `/events/${e.id}` };
  }
  return null;
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const user = await requireActiveMember(request, env);
  const item = await loadItem(env, params.type, params.id, user.id);
  if (!item) throw new Response("Not found", { status: 404 });
  const settings = await getSettings(getDb(env));
  const url = new URL(request.url);
  return {
    item,
    stripe: stripeEnabled(env) && settings.paymentMode === "stripe",
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
  if (!stripeEnabled(env)) return { error: "Card payments aren't enabled." };
  const base = env.APP_URL.replace(/\/$/, "");
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
            <Alert kind="success">Thanks! Your payment is being confirmed. This page will show as paid within a minute.</Alert>
          ) : (
            <>
              {d.cancelled && <Alert kind="warn">Payment was cancelled. Your spot is held until you pay.</Alert>}
              {actionData?.error && <Alert kind="error">{actionData.error}</Alert>}
              {d.stripe ? (
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
