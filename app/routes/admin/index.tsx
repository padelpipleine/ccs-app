import { and, count, eq, gte, inArray, sql } from "drizzle-orm";
import { Form, Link } from "react-router";
import type { Route } from "./+types/index";
import { requireAdmin } from "~/lib/auth.server";
import { getDb, schema } from "~/lib/db.server";
import { Alert, PageHeader, Stat, StatusPill } from "~/components/ui";
import { sendEmail } from "~/lib/email.server";
import { addDays, formatDate, formatEuro, formatMoney, todayIn } from "~/lib/format";
import { pushConfigured } from "~/lib/push.server";
import { stripeEnabled } from "~/lib/payments.server";
import { VapidGenerator } from "~/components/vapid-generator";
import { siteSyncConfigured } from "~/lib/site-sync.server";

export const meta: Route.MetaFunction = () => [{ title: "Admin · Crosscourt Social" }];

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const admin = await requireAdmin(request, env);
  const r = await sendEmail(
    env,
    admin.email,
    "Crosscourt Social · test email",
    `<p style="font-family:Inter,Segoe UI,system-ui,sans-serif">Email from the Crosscourt Social app is working. Sign-in codes and welcome emails will arrive like this.</p>`,
    "Email from the Crosscourt Social app is working.",
  );
  return { emailTest: { ok: r.ok, detail: r.detail, to: admin.email } };
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  await requireAdmin(request, env);
  const db = getDb(env);
  const today = todayIn();
  const [[members], [pending], [unassessed], upcoming, upcomingEvents, [pendingPayments], [pushSubs]] = await Promise.all([
    db.select({ n: count() }).from(schema.users).where(eq(schema.users.status, "active")),
    db.select({ n: count() }).from(schema.users).where(eq(schema.users.status, "pending")),
    db.select({ n: count() }).from(schema.users).where(and(eq(schema.users.status, "active"), sql`${schema.users.level} is null`)),
    db
      .select({ m: schema.matchDays, booked: sql<number>`(select count(*) from bookings b where b.match_day_id = ${schema.matchDays.id} and b.status in ('booked','invited','attended'))` })
      .from(schema.matchDays)
      .where(and(gte(schema.matchDays.date, today), inArray(schema.matchDays.status, ["open", "draft"])))
      .orderBy(schema.matchDays.date, schema.matchDays.startTime)
      .limit(6),
    db.select().from(schema.events).where(and(gte(schema.events.date, today), eq(schema.events.status, "open"))).orderBy(schema.events.date).limit(4),
    db.select({ n: count(), total: sql<number>`coalesce(sum(price_cents),0)` }).from(schema.bookings).where(and(eq(schema.bookings.paymentStatus, "pending"), eq(schema.bookings.status, "booked"))),
    db.select({ n: count() }).from(schema.pushSubscriptions),
  ]);
  return {
    members: members.n,
    pending: pending.n,
    unassessed: unassessed.n,
    upcoming,
    upcomingEvents,
    pendingPayments,
    pushSubs: pushSubs.n,
    setup: {
      push: pushConfigured(env),
      email: Boolean(env.RESEND_API_KEY),
      stripe: stripeEnabled(env),
      secret: Boolean(env.SESSION_SECRET),
      siteSync: siteSyncConfigured(env),
    },
    weekEnd: addDays(today, 7),
  };
}

export default function AdminIndex({ loaderData: d, actionData }: Route.ComponentProps) {
  const setupItems = [
    [d.setup.secret, "SESSION_SECRET set", "Sign-in cookies are using an insecure dev secret. Set SESSION_SECRET."],
    [d.setup.email, "Email (Resend) configured", "Members can't receive sign-in codes until RESEND_API_KEY and EMAIL_FROM are set as Secrets on the Worker."],
    [d.setup.push, "Push notifications configured", "Free. Generate a key pair below and add it as Worker secrets."],
    [d.setup.siteSync, "Sync with club.crosscourt.social", "Set SITE_CRM_KEY (the CRM key from the site's wrangler.jsonc) so sign-ups and payments flow into Members automatically every hour."],
  ] as const;
  const missing = setupItems.filter(([ok]) => !ok);
  return (
    <div>
      <PageHeader eyebrow="Club admin" title="Dashboard" />
      {missing.length > 0 && (
        <div className="alert alert-warn mb-6">
          <p className="font-semibold">Setup checklist</p>
          <ul className="mt-1 list-disc pl-5">
            {missing.map(([, label, why]) => (
              <li key={label}>
                <strong>{label}</strong> — {why}
                {label === "Push notifications configured" && <VapidGenerator />}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs">See DEPLOY.md in the repo for the exact commands.</p>
        </div>
      )}
      <Form method="post" className="mb-6 flex flex-wrap items-center gap-3">
        <button className="btn btn-outline btn-sm">Send me a test email</button>
        <span className="text-xs text-ink-50">Checks that Resend is set up. Goes to your admin email.</span>
      </Form>
      {actionData?.emailTest && (
        <div className="mb-6">
          <Alert kind={actionData.emailTest.ok ? "success" : "error"}>
            {actionData.emailTest.ok ? `Test email sent to ${actionData.emailTest.to}. ${actionData.emailTest.detail}` : `Couldn't send: ${actionData.emailTest.detail}`}
          </Alert>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Active members" value={d.members} />
        <Stat label="Pending approval" value={d.pending} sub={d.pending ? "Approve in Members" : undefined} />
        <Stat label="Need a level" value={d.unassessed} sub="active but unassessed" />
        <Stat label="Payments owed" value={formatEuro(Number(d.pendingPayments.total))} sub={`${d.pendingPayments.n} extra sessions`} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Upcoming sessions</h2>
            <Link to="/admin/matches/new" className="btn btn-primary btn-sm">
              + New session
            </Link>
          </div>
          <div className="card divide-y divide-line">
            {d.upcoming.length === 0 && <p className="p-4 text-sm text-ink-50">No sessions scheduled. Create one.</p>}
            {d.upcoming.map(({ m, booked }) => (
              <Link key={m.id} to={`/admin/matches/${m.id}`} className="flex items-center justify-between gap-3 p-3 text-sm hover:bg-bone-warm">
                <div>
                  <p className="font-medium text-ink">{m.title}</p>
                  <p className="text-xs text-ink-50">
                    {formatDate(m.date)} · {m.startTime} · {m.group}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-ink-50">
                    {booked}/{m.courts * 4}
                  </span>
                  <StatusPill status={m.status} />
                </div>
              </Link>
            ))}
          </div>
        </section>
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Upcoming events</h2>
            <Link to="/admin/events/new" className="btn btn-primary btn-sm">
              + New event
            </Link>
          </div>
          <div className="card divide-y divide-line">
            {d.upcomingEvents.length === 0 && <p className="p-4 text-sm text-ink-50">No events scheduled.</p>}
            {d.upcomingEvents.map((e) => (
              <Link key={e.id} to={`/admin/events/${e.id}`} className="flex items-center justify-between gap-3 p-3 text-sm hover:bg-bone-warm">
                <div>
                  <p className="font-medium text-ink">{e.title}</p>
                  <p className="text-xs text-ink-50">
                    {formatDate(e.date)} · {e.startTime}
                  </p>
                </div>
                <span className="text-xs text-ink-50">{e.priceCents ? formatMoney(e.priceCents) : "Free"}</span>
              </Link>
            ))}
          </div>
          <p className="mt-4 text-xs text-ink-50">{d.pushSubs} devices subscribed to push notifications.</p>
        </section>
      </div>
    </div>
  );
}
