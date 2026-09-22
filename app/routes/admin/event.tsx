import { eq } from "drizzle-orm";
import { Form, Link, redirect } from "react-router";
import type { Route } from "./+types/event";
import { requireAdmin } from "~/lib/auth.server";
import { getDb, schema } from "~/lib/db.server";
import { markPaid } from "~/lib/payments.server";
import { notifyUsers } from "~/lib/push.server";
import { awardPoints, checkEventBadges } from "~/lib/points.server";
import { getSettings, num } from "~/lib/settings.server";
import { Alert, Avatar, BackLink, GroupPill, PageHeader, StatusPill } from "~/components/ui";
import { formatDateLong, formatMoney } from "~/lib/format";

export const meta: Route.MetaFunction = ({ data }) => [{ title: `${data?.event.title ?? "Event"} · Admin` }];

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  await requireAdmin(request, env);
  const db = getDb(env);
  const event = await db.select().from(schema.events).where(eq(schema.events.id, params.id)).get();
  if (!event) throw new Response("Not found", { status: 404 });
  const rows = await db
    .select({ reg: schema.eventRegistrations, user: schema.users })
    .from(schema.eventRegistrations)
    .innerJoin(schema.users, eq(schema.users.id, schema.eventRegistrations.userId))
    .where(eq(schema.eventRegistrations.eventId, event.id))
    .orderBy(schema.eventRegistrations.createdAt);
  return { event, rows };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const admin = await requireAdmin(request, env);
  const db = getDb(env);
  const event = await db.select().from(schema.events).where(eq(schema.events.id, params.id)).get();
  if (!event) throw new Response("Not found", { status: 404 });
  const f = await request.formData();
  const intent = String(f.get("intent"));
  const regId = String(f.get("regId") ?? "");
  const reg = regId ? await db.select().from(schema.eventRegistrations).where(eq(schema.eventRegistrations.id, regId)).get() : null;
  const settings = await getSettings(db);

  if (intent === "attended" && reg) {
    if (reg.status !== "attended") {
      await db.update(schema.eventRegistrations).set({ status: "attended" }).where(eq(schema.eventRegistrations.id, reg.id));
      await awardPoints(db, reg.userId, num(settings, "pointsEvent"), `Attended ${event.title}`, "event", reg.id);
      await checkEventBadges(db, env, reg.userId);
    }
    return { success: "Checked in." };
  }
  if (intent === "no_show" && reg) {
    await db.update(schema.eventRegistrations).set({ status: "no_show" }).where(eq(schema.eventRegistrations.id, reg.id));
    return { success: "Marked no-show." };
  }
  if (intent === "paid" && reg) {
    await markPaid(env, "event", reg.id, `manual:${admin.id}`);
    return { success: "Marked as paid." };
  }
  if (intent === "waive" && reg) {
    await db.update(schema.eventRegistrations).set({ paymentStatus: "waived" }).where(eq(schema.eventRegistrations.id, reg.id));
    return { success: "Waived." };
  }
  if (intent === "remove" && reg) {
    await db.update(schema.eventRegistrations).set({ status: "cancelled" }).where(eq(schema.eventRegistrations.id, reg.id));
    return { success: "Removed." };
  }
  if (intent === "message") {
    const body = String(f.get("body") ?? "").trim();
    if (!body) return { error: "Write a message." };
    const rows = await db.select().from(schema.eventRegistrations).where(eq(schema.eventRegistrations.eventId, event.id));
    const ids = rows.filter((r) => ["registered", "waitlist"].includes(r.status)).map((r) => r.userId);
    const sent = await notifyUsers(env, ids, { title: event.title, body, url: `/events/${event.id}`, kind: "event" });
    return { success: `Sent to ${ids.length} members (${sent} push).` };
  }
  if (intent === "cancel_event") {
    await db.update(schema.events).set({ status: "cancelled" }).where(eq(schema.events.id, event.id));
    const rows = await db.select().from(schema.eventRegistrations).where(eq(schema.eventRegistrations.eventId, event.id));
    await notifyUsers(
      env,
      rows.map((r) => r.userId),
      { title: `Cancelled: ${event.title}`, body: String(f.get("reason") ?? "") || "Sorry — this event has been cancelled.", url: "/events", kind: "event" },
    );
    return { success: "Event cancelled and members notified." };
  }
  if (intent === "delete") {
    await db.delete(schema.events).where(eq(schema.events.id, event.id));
    throw redirect("/admin/events");
  }
  return { error: "Unknown action" };
}

export default function AdminEvent({ loaderData: d, actionData }: Route.ComponentProps) {
  const e = d.event;
  const active = d.rows.filter((r) => ["registered", "attended", "no_show"].includes(r.reg.status));
  const waiting = d.rows.filter((r) => r.reg.status === "waitlist");
  const headcount = active.filter((r) => r.reg.status !== "no_show").reduce((n, r) => n + 1 + r.reg.guests, 0);
  const revenue = d.rows.filter((r) => r.reg.paymentStatus === "paid").reduce((n, r) => n + r.reg.priceCents, 0);
  return (
    <div className="mx-auto max-w-3xl">
      <BackLink to="/admin/events">Events</BackLink>
      <PageHeader
        title={e.title}
        subtitle={`${formatDateLong(e.date)} · ${e.startTime} · ${e.location ?? ""}`}
        action={
          <div className="flex gap-2">
            <Link to={`/events/${e.id}`} className="btn btn-ghost btn-sm">
              Member view
            </Link>
            <Link to={`/admin/events/${e.id}/edit`} className="btn btn-outline btn-sm">
              Edit
            </Link>
          </div>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <StatusPill status={e.status} />
        <GroupPill group={e.group} />
        <span className="pill pill-bone">
          {headcount}
          {e.capacity ? `/${e.capacity}` : ""} going
        </span>
        <span className="pill pill-bone">{e.priceCents ? formatMoney(e.priceCents) : "Free"}</span>
        {revenue > 0 && <span className="pill pill-teal">{formatMoney(revenue)} collected</span>}
      </div>
      {actionData?.error && <Alert kind="error">{actionData.error}</Alert>}
      {actionData?.success && <Alert kind="success">{actionData.success}</Alert>}

      <section className="card mt-4">
        <div className="border-b border-line p-4">
          <h2 className="font-display font-semibold text-ink">Guest list</h2>
          <p className="text-xs text-ink-50">Check people in on the night to award social points.</p>
        </div>
        {active.length === 0 && <p className="p-4 text-sm text-ink-50">No registrations yet.</p>}
        <div className="divide-y divide-line">
          {active.map(({ reg: r, user: u }) => (
            <div key={r.id} className="flex flex-wrap items-center gap-3 p-3">
              <Avatar name={u.name} url={u.avatarUrl} size={36} />
              <div className="min-w-0 flex-1">
                <Link to={`/admin/members/${u.id}`} className="text-sm font-medium text-ink">
                  {u.name || u.email}
                </Link>
                <p className="text-xs text-ink-50">
                  {r.guests > 0 && `+${r.guests} guest${r.guests > 1 ? "s" : ""} · `}
                  {u.phone}
                </p>
              </div>
              <div className="flex flex-wrap gap-1">
                <StatusPill status={r.status} />
                {r.priceCents > 0 && (
                  <>
                    <StatusPill status={r.paymentStatus} />
                    <span className="text-xs">{formatMoney(r.priceCents)}</span>
                  </>
                )}
              </div>
              <Form method="post" className="flex flex-wrap gap-1">
                <input type="hidden" name="regId" value={r.id} />
                {r.status !== "attended" && (
                  <button name="intent" value="attended" className="btn btn-ghost btn-sm">
                    ✓ Check in
                  </button>
                )}
                {r.status !== "no_show" && (
                  <button name="intent" value="no_show" className="btn btn-ghost btn-sm">
                    No-show
                  </button>
                )}
                {r.paymentStatus === "pending" && (
                  <>
                    <button name="intent" value="paid" className="btn btn-primary btn-sm">
                      Paid
                    </button>
                    <button name="intent" value="waive" className="btn btn-ghost btn-sm">
                      Waive
                    </button>
                  </>
                )}
                {r.status === "registered" && (
                  <button name="intent" value="remove" className="btn btn-danger btn-sm" onClick={(ev) => !confirm("Remove?") && ev.preventDefault()}>
                    Remove
                  </button>
                )}
              </Form>
            </div>
          ))}
        </div>
        {waiting.length > 0 && (
          <p className="border-t border-line p-4 text-xs text-ink-50">Waitlist: {waiting.map((w) => w.user.name).join(", ")}</p>
        )}
      </section>

      <section className="mt-4 grid gap-4 sm:grid-cols-2">
        <Form method="post" className="card space-y-2 p-4">
          <p className="font-display font-semibold text-ink">Message the guest list</p>
          <textarea name="body" rows={2} className="textarea" placeholder="Doors open at 8. Dress code: white." />
          <button name="intent" value="message" className="btn btn-outline btn-sm">
            Send notification
          </button>
        </Form>
        <div className="card space-y-2 p-4">
          <p className="font-display font-semibold text-ink">Event actions</p>
          {e.status === "open" && (
            <Form method="post" className="space-y-2" onSubmit={(ev) => !confirm("Cancel this event and notify everyone?") && ev.preventDefault()}>
              <input name="reason" className="input" placeholder="Reason (sent to guests)" />
              <button name="intent" value="cancel_event" className="btn btn-danger btn-sm w-full">
                Cancel event
              </button>
            </Form>
          )}
          <Form method="post" onSubmit={(ev) => !confirm("Delete this event and all registrations?") && ev.preventDefault()}>
            <button name="intent" value="delete" className="btn btn-ghost btn-sm w-full text-red-700">
              Delete permanently
            </button>
          </Form>
        </div>
      </section>
    </div>
  );
}
