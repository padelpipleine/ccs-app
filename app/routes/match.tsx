import { Form, Link, redirect, useNavigation } from "react-router";
import { and, eq, inArray, ne } from "drizzle-orm";
import type { Route } from "./+types/match";
import { requireActiveMember } from "~/lib/auth.server";
import { getDb, schema } from "~/lib/db.server";
import { getSettings, num } from "~/lib/settings.server";
import { acceptInvite, cancelBooking, capacity, createBooking, eligibility, groupEligible, matchWithBookings, partnerEligibility, pricing } from "~/lib/bookings.server";
import { formatDateLong, formatMoney, levelLabel } from "~/lib/format";
import { Alert, Avatar, BackLink, GroupPill, LevelPill, StatusPill } from "~/components/ui";
import { Icons } from "~/components/icons";

export const meta: Route.MetaFunction = ({ data }) => [{ title: `${data?.match.title ?? "Session"} · Crosscourt Social` }];

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const user = await requireActiveMember(request, env);
  const db = getDb(env);
  const data = await matchWithBookings(db, params.id);
  if (!data) throw new Response("Not found", { status: 404 });
  if (!groupEligible(user, data.match.group)) throw redirect("/matches");
  const settings = await getSettings(db);
  const { match, venue, rows } = data;
  const active = rows.filter((r) => ["booked", "invited", "attended"].includes(r.booking.status));
  const waitlist = rows.filter((r) => r.booking.status === "waitlist");
  const mine = rows.find((r) => r.user.id === user.id && ["booked", "invited", "waitlist"].includes(r.booking.status)) ?? null;
  const elig = eligibility(user, match, settings);
  const price = elig.ok && !mine ? await pricing(db, user, match, settings) : null;

  // Partner candidates: active members eligible for this session & within level gap, not already on it.
  const onIds = new Set(rows.filter((r) => ["booked", "invited", "waitlist"].includes(r.booking.status)).map((r) => r.user.id));
  const candidates = elig.ok
    ? (
        await db
          .select()
          .from(schema.users)
          .where(and(eq(schema.users.status, "active"), ne(schema.users.id, user.id), inArray(schema.users.role, ["member", "admin"])))
          .orderBy(schema.users.name)
      )
        .filter((p) => !onIds.has(p.id) && partnerEligibility(user, p, match, settings).ok)
        .map((p) => ({ id: p.id, name: p.name, level: p.level }))
    : [];

  return {
    match,
    venue,
    capacity: capacity(match),
    players: active.map((r) => ({ id: r.user.id, name: r.user.name, avatarUrl: r.user.avatarUrl, level: r.user.level, status: r.booking.status, partnerId: r.booking.partnerUserId })),
    waitlist: waitlist.map((r) => ({ id: r.user.id, name: r.user.name })),
    mine: mine ? { ...mine.booking } : null,
    myPartner: mine?.booking.partnerUserId ? (rows.find((r) => r.user.id === mine.booking.partnerUserId)?.user.name ?? null) : null,
    eligible: elig.ok,
    reason: elig.ok ? null : elig.reason,
    price,
    candidates,
    partnerGap: num(settings, "partnerLevelGap"),
    freeCancelHours: num(settings, "freeCancelHours"),
    paymentMode: settings.paymentMode,
    paymentInstructions: settings.paymentInstructions,
  };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const user = await requireActiveMember(request, env);
  const db = getDb(env);
  const form = await request.formData();
  const intent = String(form.get("intent"));
  const match = await db.select().from(schema.matchDays).where(eq(schema.matchDays.id, params.id)).get();
  if (!match) throw new Response("Not found", { status: 404 });
  if (!groupEligible(user, match.group)) throw redirect("/matches");

  if (intent === "book") {
    const partnerId = String(form.get("partnerId") ?? "");
    const partner = partnerId ? ((await db.select().from(schema.users).where(eq(schema.users.id, partnerId)).get()) ?? null) : null;
    if (partnerId && !partner) return { error: "Partner not found." };
    const result = await createBooking(env, db, user, match, partner);
    if (!result.ok) return { error: result.error };
    if (result.booking.paymentStatus === "pending") throw redirect(`/pay/booking/${result.booking.id}`);
    return { success: result.waitlisted ? "You're on the waitlist. We'll notify you if a spot opens." : result.partnerInvited ? "Booked! Your partner has been invited to confirm." : "Booked. See you on court!" };
  }

  const booking = await db
    .select()
    .from(schema.bookings)
    .where(and(eq(schema.bookings.matchDayId, match.id), eq(schema.bookings.userId, user.id), inArray(schema.bookings.status, ["booked", "invited", "waitlist"])))
    .get();
  if (!booking) return { error: "No booking found." };

  if (intent === "accept") {
    const r = await acceptInvite(env, db, user, booking, match);
    if (!r.ok) return { error: r.error };
    const fresh = await db.select().from(schema.bookings).where(eq(schema.bookings.id, booking.id)).get();
    if (fresh?.paymentStatus === "pending") throw redirect(`/pay/booking/${booking.id}`);
    return { success: "You're confirmed. See you on court!" };
  }
  if (intent === "cancel") {
    const r = await cancelBooking(env, db, user, booking, match);
    if (!r.ok) return { error: r.error };
    return { success: r.late ? "Cancelled. This was a late cancellation, so it still counts as this week's session." : "Cancelled." };
  }
  return { error: "Unknown action." };
}

export default function Match({ loaderData: d, actionData }: Route.ComponentProps) {
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  const spotsLeft = d.capacity - d.players.length;
  const m = d.match;
  return (
    <div className="mx-auto max-w-2xl">
      <BackLink to="/matches">Sessions</BackLink>
      <div className="card-ink p-5 sm:p-7">
        <div className="flex flex-wrap items-center gap-2">
          <GroupPill group={m.group} />
          {(m.levelMin != null || m.levelMax != null) && (
            <span className="pill pill-indigo">
              Levels {m.levelMin != null ? levelLabel(m.levelMin) : "any"}–{m.levelMax != null ? levelLabel(m.levelMax) : "any"}
            </span>
          )}
          {m.status !== "open" && <StatusPill status={m.status} />}
        </div>
        <h1 className="mt-3 text-2xl font-semibold text-bone sm:text-3xl">{m.title}</h1>
        <div className="mt-4 space-y-2 text-sm text-bone">
          <p className="flex items-center gap-2">
            <Icons.calendar className="h-4 w-4 text-on-ink-muted" /> {formatDateLong(m.date)}
          </p>
          <p className="flex items-center gap-2">
            <Icons.clock className="h-4 w-4 text-on-ink-muted" /> {m.startTime} – {m.endTime}
          </p>
          <p className="flex items-center gap-2">
            <Icons.pin className="h-4 w-4 text-on-ink-muted" />
            {d.venue ? (
              <span>
                {d.venue.name}
                {d.venue.address ? `, ${d.venue.address}` : ""}
                {d.venue.mapUrl && (
                  <a href={d.venue.mapUrl} target="_blank" rel="noreferrer" className="ml-2 text-teal underline">
                    Map
                  </a>
                )}
              </span>
            ) : (
              "Venue to be confirmed"
            )}
          </p>
          <p className="flex items-center gap-2">
            <Icons.users className="h-4 w-4 text-on-ink-muted" /> {m.courts} court{m.courts === 1 ? "" : "s"} · {d.players.length}/{d.capacity} players
          </p>
        </div>
      </div>

      {(m.description || m.socialAfter || m.prize) && (
        <div className="card mt-4 space-y-3 p-5 text-sm">
          {m.description && <p className="whitespace-pre-line text-ink-70">{m.description}</p>}
          {m.socialAfter && (
            <p>
              <span className="pill pill-pink mr-2">🍸 Social after</span>
              {m.socialAfter}
            </p>
          )}
          {m.prize && (
            <p>
              <span className="pill pill-teal mr-2">🏆 Prize</span>
              {m.prize}
            </p>
          )}
        </div>
      )}

      <div className="mt-4 space-y-3">
        {actionData?.error && <Alert kind="error">{actionData.error}</Alert>}
        {actionData?.success && <Alert kind="success">{actionData.success}</Alert>}

        {d.mine ? (
          <div className="card p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="eyebrow">Your booking</p>
                <p className="mt-1 flex flex-wrap items-center gap-2">
                  <StatusPill status={d.mine.status} />
                  {d.mine.status !== "waitlist" && <StatusPill status={d.mine.paymentStatus} />}
                  {d.mine.priceCents > 0 && <span className="text-sm text-ink-70">{formatMoney(d.mine.priceCents)}</span>}
                </p>
                {d.myPartner && <p className="mt-1 text-sm text-ink-70">Partner: {d.myPartner}</p>}
              </div>
            </div>
            {d.mine.status === "invited" && (
              <p className="mt-3 text-sm text-ink-70">
                {d.myPartner ?? "A member"} invited you to play as their partner. Confirm to take the spot.
              </p>
            )}
            {d.mine.paymentStatus === "pending" && (
              <Alert kind="warn">
                This is an extra session ({formatMoney(d.mine.priceCents)}).{" "}
                <Link to={`/pay/booking/${d.mine.id}`} className="font-semibold underline">
                  Complete payment
                </Link>
              </Alert>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              {d.mine.status === "invited" && (
                <Form method="post">
                  <button name="intent" value="accept" className="btn btn-primary" disabled={busy}>
                    Confirm my spot
                  </button>
                </Form>
              )}
              <Form method="post" onSubmit={(e) => !confirm("Cancel this booking?") && e.preventDefault()}>
                <button name="intent" value="cancel" className="btn btn-danger" disabled={busy}>
                  {d.mine.status === "invited" ? "Decline" : "Cancel booking"}
                </button>
              </Form>
            </div>
            <p className="hint">Free cancellation up to {d.freeCancelHours}h before. Later than that still counts as your weekly session.</p>
          </div>
        ) : m.status === "open" ? (
          d.eligible ? (
            <Form method="post" className="card space-y-4 p-5">
              <div>
                <p className="eyebrow">Book your spot</p>
                <p className="mt-1 text-sm text-ink-70">
                  {spotsLeft > 0 ? `${spotsLeft} spot${spotsLeft === 1 ? "" : "s"} left.` : "This session is full — you'll join the waitlist."}{" "}
                  {d.price?.paymentStatus === "pending" ? (
                    <span className="font-semibold text-ink">This is an extra session this week: {formatMoney(d.price.priceCents)}.</span>
                  ) : (
                    <span className="text-teal-800">Included in your membership this week.</span>
                  )}
                </p>
              </div>
              <label className="block">
                <span className="label">Bring a partner (optional)</span>
                <select name="partnerId" className="select" defaultValue="">
                  <option value="">Play as a single · we'll pair you up</option>
                  {d.candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} · level {levelLabel(c.level)}
                    </option>
                  ))}
                </select>
                <span className="hint">
                  Only members {d.partnerGap === 0 ? "at exactly your level" : `within ${d.partnerGap} of your level`} are listed. They'll get a notification to confirm.
                </span>
              </label>
              <button name="intent" value="book" className="btn btn-ink w-full" disabled={busy}>
                {busy ? "Booking…" : spotsLeft > 0 ? "Book session" : "Join waitlist"}
              </button>
            </Form>
          ) : (
            <Alert kind="info">{d.reason}</Alert>
          )
        ) : (
          <Alert kind="info">This session is {m.status}.</Alert>
        )}
      </div>

      <section className="mt-6">
        <h2 className="mb-3 text-lg font-semibold">Who's playing</h2>
        {d.players.length === 0 ? (
          <p className="text-sm text-ink-50">Be the first to book.</p>
        ) : (
          <div className="card divide-y divide-line">
            {d.players.map((p) => (
              <div key={p.id} className="flex items-center gap-3 p-3">
                <Avatar name={p.name} url={p.avatarUrl} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{p.name}</p>
                  {p.partnerId && <p className="text-xs text-ink-50">with {d.players.find((x) => x.id === p.partnerId)?.name ?? "partner"}</p>}
                </div>
                <LevelPill level={p.level} />
                {p.status === "invited" && <span className="pill pill-bone">invited</span>}
              </div>
            ))}
          </div>
        )}
        {d.waitlist.length > 0 && <p className="mt-2 text-xs text-ink-50">Waitlist: {d.waitlist.map((w) => w.name).join(", ")}</p>}
      </section>
    </div>
  );
}
