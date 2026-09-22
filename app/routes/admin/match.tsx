import { eq } from "drizzle-orm";
import { Form, Link, redirect } from "react-router";
import type { Route } from "./+types/match";
import { requireAdmin } from "~/lib/auth.server";
import { getDb, schema } from "~/lib/db.server";
import { cancelBooking, capacity, markAttendance, matchWithBookings } from "~/lib/bookings.server";
import { markPaid } from "~/lib/payments.server";
import { notifyUsers } from "~/lib/push.server";
import { Alert, Avatar, BackLink, GroupPill, LevelPill, PageHeader, StatusPill } from "~/components/ui";
import { formatDateLong, formatMoney, levelLabel } from "~/lib/format";

export const meta: Route.MetaFunction = ({ data }) => [{ title: `${data?.match.title ?? "Session"} · Admin` }];

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  await requireAdmin(request, env);
  const data = await matchWithBookings(getDb(env), params.id);
  if (!data) throw new Response("Not found", { status: 404 });
  return { ...data, capacity: capacity(data.match) };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const admin = await requireAdmin(request, env);
  const db = getDb(env);
  const match = await db.select().from(schema.matchDays).where(eq(schema.matchDays.id, params.id)).get();
  if (!match) throw new Response("Not found", { status: 404 });
  const f = await request.formData();
  const intent = String(f.get("intent"));
  const bookingId = String(f.get("bookingId") ?? "");
  const booking = bookingId ? await db.select().from(schema.bookings).where(eq(schema.bookings.id, bookingId)).get() : null;

  if (intent === "attended" || intent === "no_show") {
    if (!booking) return { error: "Booking not found" };
    await markAttendance(env, db, booking, intent);
    return { success: "Updated." };
  }
  if (intent === "paid" && booking) {
    await markPaid(env, "booking", booking.id, `manual:${admin.id}`);
    return { success: "Marked as paid." };
  }
  if (intent === "waive" && booking) {
    await db.update(schema.bookings).set({ paymentStatus: "waived", updatedAt: new Date().toISOString() }).where(eq(schema.bookings.id, booking.id));
    return { success: "Payment waived." };
  }
  if (intent === "remove" && booking) {
    const user = await db.select().from(schema.users).where(eq(schema.users.id, booking.userId)).get();
    if (user) await cancelBooking(env, db, user, booking, match, true);
    return { success: "Removed from session." };
  }
  if (intent === "cancel_match") {
    await db.update(schema.matchDays).set({ status: "cancelled" }).where(eq(schema.matchDays.id, match.id));
    const rows = await db.select({ userId: schema.bookings.userId }).from(schema.bookings).where(eq(schema.bookings.matchDayId, match.id));
    await db.update(schema.bookings).set({ status: "cancelled", updatedAt: new Date().toISOString() }).where(eq(schema.bookings.matchDayId, match.id));
    await notifyUsers(
      env,
      rows.map((r) => r.userId),
      { title: `Cancelled: ${match.title}`, body: String(f.get("reason") ?? "") || "Sorry — this session has been cancelled. Your weekly allowance is unaffected.", url: "/matches", kind: "match" },
    );
    return { success: "Session cancelled and members notified." };
  }
  if (intent === "complete") {
    await db.update(schema.matchDays).set({ status: "completed" }).where(eq(schema.matchDays.id, match.id));
    return { success: "Marked completed." };
  }
  if (intent === "message") {
    const body = String(f.get("body") ?? "").trim();
    if (!body) return { error: "Write a message." };
    const rows = await db.select({ userId: schema.bookings.userId, status: schema.bookings.status }).from(schema.bookings).where(eq(schema.bookings.matchDayId, match.id));
    const ids = rows.filter((r) => ["booked", "invited", "waitlist"].includes(r.status)).map((r) => r.userId);
    const sent = await notifyUsers(env, ids, { title: match.title, body, url: `/matches/${match.id}`, kind: "match" });
    return { success: `Sent to ${ids.length} members (${sent} push).` };
  }
  if (intent === "delete") {
    await db.delete(schema.matchDays).where(eq(schema.matchDays.id, match.id));
    throw redirect("/admin/matches");
  }
  return { error: "Unknown action" };
}

export default function AdminMatch({ loaderData: d, actionData }: Route.ComponentProps) {
  const m = d.match;
  const active = d.rows.filter((r) => ["booked", "invited", "attended", "no_show"].includes(r.booking.status));
  const waiting = d.rows.filter((r) => r.booking.status === "waitlist");
  const gone = d.rows.filter((r) => ["cancelled", "late_cancelled"].includes(r.booking.status));
  return (
    <div className="mx-auto max-w-3xl">
      <BackLink to="/admin/matches">Sessions</BackLink>
      <PageHeader
        title={m.title}
        subtitle={`${formatDateLong(m.date)} · ${m.startTime}–${m.endTime} · ${d.venue?.name ?? "No venue"}`}
        action={
          <div className="flex gap-2">
            <Link to={`/matches/${m.id}`} className="btn btn-ghost btn-sm">
              Member view
            </Link>
            <Link to={`/admin/matches/${m.id}/edit`} className="btn btn-outline btn-sm">
              Edit
            </Link>
          </div>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <StatusPill status={m.status} />
        <GroupPill group={m.group} />
        {(m.levelMin != null || m.levelMax != null) && (
          <span className="pill pill-indigo">
            Lvl {m.levelMin != null ? levelLabel(m.levelMin) : "any"}–{m.levelMax != null ? levelLabel(m.levelMax) : "any"}
          </span>
        )}
        <span className="pill pill-bone">
          {active.filter((r) => r.booking.status !== "no_show").length}/{d.capacity} players
        </span>
        {!m.hosted && <span className="pill pill-outline">not hosted (extra)</span>}
      </div>
      {actionData?.error && <Alert kind="error">{actionData.error}</Alert>}
      {actionData?.success && <Alert kind="success">{actionData.success}</Alert>}

      <section className="card mt-4">
        <div className="border-b border-line p-4">
          <h2 className="font-display font-semibold text-ink">Players & attendance</h2>
          <p className="text-xs text-ink-50">Mark attendance after the session to award social points. Mark payments received for extra sessions.</p>
        </div>
        {active.length === 0 && <p className="p-4 text-sm text-ink-50">No bookings yet.</p>}
        <div className="divide-y divide-line">
          {active.map(({ booking: b, user: u }) => (
            <div key={b.id} className="flex flex-wrap items-center gap-3 p-3">
              <Avatar name={u.name} url={u.avatarUrl} size={36} />
              <div className="min-w-0 flex-1">
                <Link to={`/admin/members/${u.id}`} className="text-sm font-medium text-ink">
                  {u.name || u.email}
                </Link>
                <p className="flex flex-wrap items-center gap-1 text-xs text-ink-50">
                  <LevelPill level={u.level} />
                  {b.partnerUserId && <span>· partner: {d.rows.find((r) => r.user.id === b.partnerUserId)?.user.name}</span>}
                  {u.phone && <span>· {u.phone}</span>}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <StatusPill status={b.status} />
                <StatusPill status={b.paymentStatus} />
                {b.priceCents > 0 && <span className="text-xs">{formatMoney(b.priceCents)}</span>}
              </div>
              <Form method="post" className="flex flex-wrap gap-1">
                <input type="hidden" name="bookingId" value={b.id} />
                {b.status !== "attended" && (
                  <button name="intent" value="attended" className="btn btn-ghost btn-sm">
                    ✓ Played
                  </button>
                )}
                {b.status !== "no_show" && (
                  <button name="intent" value="no_show" className="btn btn-ghost btn-sm">
                    No-show
                  </button>
                )}
                {b.paymentStatus === "pending" && (
                  <>
                    <button name="intent" value="paid" className="btn btn-primary btn-sm">
                      Paid
                    </button>
                    <button name="intent" value="waive" className="btn btn-ghost btn-sm">
                      Waive
                    </button>
                  </>
                )}
                {["booked", "invited"].includes(b.status) && (
                  <button name="intent" value="remove" className="btn btn-danger btn-sm" onClick={(e) => !confirm("Remove this player?") && e.preventDefault()}>
                    Remove
                  </button>
                )}
              </Form>
            </div>
          ))}
        </div>
        {waiting.length > 0 && (
          <div className="border-t border-line p-4 text-sm">
            <p className="eyebrow mb-1">Waitlist</p>
            {waiting.map(({ booking: b, user: u }) => (
              <div key={b.id} className="flex items-center justify-between py-1">
                <span>{u.name}</span>
                <Form method="post">
                  <input type="hidden" name="bookingId" value={b.id} />
                  <button name="intent" value="remove" className="text-xs text-red-700">
                    remove
                  </button>
                </Form>
              </div>
            ))}
          </div>
        )}
        {gone.length > 0 && (
          <p className="border-t border-line p-4 text-xs text-ink-50">
            Cancelled: {gone.map(({ booking: b, user: u }) => `${u.name}${b.status === "late_cancelled" ? " (late)" : ""}`).join(", ")}
          </p>
        )}
      </section>

      <section className="mt-4 grid gap-4 sm:grid-cols-2">
        <Form method="post" className="card space-y-2 p-4">
          <p className="font-display font-semibold text-ink">Message the players</p>
          <textarea name="body" rows={2} className="textarea" placeholder="Court 3 tonight, not court 1. Bring a jumper!" />
          <button name="intent" value="message" className="btn btn-outline btn-sm">
            Send notification
          </button>
        </Form>
        <div className="card space-y-2 p-4">
          <p className="font-display font-semibold text-ink">Session actions</p>
          {m.status === "open" && (
            <Form method="post" className="space-y-2" onSubmit={(e) => !confirm("Cancel this session and notify everyone booked?") && e.preventDefault()}>
              <input name="reason" className="input" placeholder="Reason (sent to players)" />
              <button name="intent" value="cancel_match" className="btn btn-danger btn-sm w-full">
                Cancel session
              </button>
            </Form>
          )}
          {m.status !== "completed" && (
            <Form method="post">
              <button name="intent" value="complete" className="btn btn-ghost btn-sm w-full">
                Mark completed
              </button>
            </Form>
          )}
          <Form method="post" onSubmit={(e) => !confirm("Delete this session and all its bookings?") && e.preventDefault()}>
            <button name="intent" value="delete" className="btn btn-ghost btn-sm w-full text-red-700">
              Delete permanently
            </button>
          </Form>
        </div>
      </section>
    </div>
  );
}
