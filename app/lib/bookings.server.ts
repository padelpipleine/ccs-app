import { and, count, eq, inArray, gte, lte, ne } from "drizzle-orm";
import { newId, schema, type Db } from "./db.server";
import { getSettings, num, type Settings } from "./settings.server";
import { notifyUsers } from "./push.server";
import { awardBadge, awardPoints, checkAttendanceBadges } from "./points.server";
import { addDays, formatDate, localDateTimeToEpoch, todayIn, weekBounds } from "./format";
import type { Booking, MatchDay, User } from "~/db/schema";

export const ACTIVE_STATUSES = ["booked", "invited", "attended"] as const;
export const COUNTS_TOWARDS_ALLOWANCE = ["booked", "attended", "late_cancelled", "no_show"] as const;

export function capacity(match: MatchDay) {
  return match.courts * 4;
}

/** Can this member see / book this session group? */
export function groupEligible(user: Pick<User, "gender" | "memberType">, group: "mixed" | "female" | "all"): boolean {
  if (group === "all") return true;
  if (group === "female") return user.gender === "female" || user.memberType === "female";
  // mixed sessions
  if (user.memberType === "female") return false; // ladies-only members
  return true;
}

export function levelEligible(user: Pick<User, "level">, match: Pick<MatchDay, "levelMin" | "levelMax">) {
  if (user.level == null) return match.levelMin == null && match.levelMax == null;
  if (match.levelMin != null && user.level < match.levelMin) return false;
  if (match.levelMax != null && user.level > match.levelMax) return false;
  return true;
}

export type Eligibility = { ok: true } | { ok: false; reason: string };

export function eligibility(user: User, match: MatchDay, settings: Settings, today = todayIn()): Eligibility {
  if (user.status !== "active") return { ok: false, reason: "Your membership is pending approval. The club will activate you shortly." };
  if (match.status !== "open") return { ok: false, reason: "This session isn't open for booking." };
  if (match.date < today) return { ok: false, reason: "This session has already happened." };
  if (!groupEligible(user, match.group))
    return { ok: false, reason: match.group === "female" ? "This is a ladies-only session." : "This is a mixed session. Your membership is ladies-only." };
  if (user.level == null) return { ok: false, reason: "Your level hasn't been set yet. Ask the club about the next level day." };
  if (!levelEligible(user, match))
    return { ok: false, reason: `This session is for levels ${match.levelMin ?? "any"}–${match.levelMax ?? "any"}. You're ${user.level.toFixed(1)}.` };
  const opensDays = num(settings, "bookingOpensDays");
  if (match.date > addDays(today, opensDays)) return { ok: false, reason: `Booking opens ${opensDays} days before the session.` };
  return { ok: true };
}

export function partnerEligibility(user: User, partner: User, match: MatchDay, settings: Settings): Eligibility {
  if (partner.id === user.id) return { ok: false, reason: "You can't partner with yourself." };
  if (partner.status !== "active") return { ok: false, reason: `${partner.name || "That member"} isn't an active member yet.` };
  if (!groupEligible(partner, match.group)) return { ok: false, reason: `${partner.name} can't play in this group.` };
  if (partner.level == null) return { ok: false, reason: `${partner.name} hasn't been assessed yet.` };
  if (!levelEligible(partner, match)) return { ok: false, reason: `${partner.name}'s level isn't within this session's range.` };
  const gap = num(settings, "partnerLevelGap");
  if (user.level != null && Math.abs(user.level - partner.level) > gap + 1e-9)
    return {
      ok: false,
      reason: gap === 0 ? "Partners must be at the same level." : `Partners must be within ${gap} of your level (you're ${user.level.toFixed(1)}, ${partner.name} is ${partner.level.toFixed(1)}).`,
    };
  return { ok: true };
}

/** Hosted sessions used by the member in the ISO week containing `date`. */
export async function weeklyUsage(db: Db, userId: string, date: string, excludeBookingId?: string): Promise<number> {
  const { start, end } = weekBounds(date);
  const rows = await db
    .select({ id: schema.bookings.id })
    .from(schema.bookings)
    .innerJoin(schema.matchDays, eq(schema.matchDays.id, schema.bookings.matchDayId))
    .where(
      and(
        eq(schema.bookings.userId, userId),
        inArray(schema.bookings.status, [...COUNTS_TOWARDS_ALLOWANCE]),
        eq(schema.bookings.paymentStatus, "included"),
        eq(schema.matchDays.hosted, true),
        gte(schema.matchDays.date, start),
        lte(schema.matchDays.date, end),
        excludeBookingId ? ne(schema.bookings.id, excludeBookingId) : undefined,
      ),
    );
  return rows.length;
}

export async function activeBookingCount(db: Db, matchDayId: string): Promise<number> {
  const [{ n }] = await db
    .select({ n: count() })
    .from(schema.bookings)
    .where(and(eq(schema.bookings.matchDayId, matchDayId), inArray(schema.bookings.status, [...ACTIVE_STATUSES])));
  return n;
}

/** Decides whether a new booking is included in the weekly allowance or an extra (paid) session. */
export async function pricing(db: Db, user: User, match: MatchDay, settings: Settings) {
  if (!match.hosted) {
    const price = match.extraPriceCents ?? 0;
    return { paymentStatus: price > 0 ? ("pending" as const) : ("included" as const), priceCents: price };
  }
  const used = await weeklyUsage(db, user.id, match.date);
  const allowance = num(settings, "weeklyAllowance");
  if (used < allowance) return { paymentStatus: "included" as const, priceCents: 0 };
  const price = match.extraPriceCents ?? num(settings, "extraSessionPriceCents");
  return { paymentStatus: price > 0 ? ("pending" as const) : ("included" as const), priceCents: price };
}

export type BookResult = { ok: true; booking: Booking; waitlisted: boolean; partnerInvited: boolean } | { ok: false; error: string };

export async function createBooking(env: Env, db: Db, user: User, match: MatchDay, partner: User | null): Promise<BookResult> {
  const settings = await getSettings(db);
  const elig = eligibility(user, match, settings);
  if (!elig.ok) return { ok: false, error: elig.reason };

  const existing = await db
    .select()
    .from(schema.bookings)
    .where(and(eq(schema.bookings.matchDayId, match.id), eq(schema.bookings.userId, user.id), inArray(schema.bookings.status, ["booked", "invited", "waitlist"])))
    .get();
  if (existing) return { ok: false, error: "You're already on this session." };

  if (partner) {
    const pe = partnerEligibility(user, partner, match, settings);
    if (!pe.ok) return { ok: false, error: pe.reason };
    const partnerExisting = await db
      .select()
      .from(schema.bookings)
      .where(and(eq(schema.bookings.matchDayId, match.id), eq(schema.bookings.userId, partner.id), inArray(schema.bookings.status, ["booked", "invited", "waitlist"])))
      .get();
    if (partnerExisting) return { ok: false, error: `${partner.name} is already on this session.` };
  }

  const taken = await activeBookingCount(db, match.id);
  const needed = partner ? 2 : 1;
  const waitlisted = taken + needed > capacity(match);
  const price = await pricing(db, user, match, settings);
  const now = new Date().toISOString();

  const booking: Booking = {
    id: newId("bk"),
    matchDayId: match.id,
    userId: user.id,
    partnerUserId: partner?.id ?? null,
    invitedBy: null,
    status: waitlisted ? "waitlist" : "booked",
    paymentStatus: waitlisted ? "included" : price.paymentStatus,
    priceCents: waitlisted ? 0 : price.priceCents,
    paymentRef: null,
    note: null,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(schema.bookings).values(booking);

  let partnerInvited = false;
  if (partner) {
    await db.insert(schema.bookings).values({
      id: newId("bk"),
      matchDayId: match.id,
      userId: partner.id,
      partnerUserId: user.id,
      invitedBy: user.id,
      status: waitlisted ? "waitlist" : "invited",
      paymentStatus: "included",
      priceCents: 0,
    });
    partnerInvited = true;
    await notifyUsers(env, [partner.id], {
      title: `${user.name} wants you as their partner`,
      body: `${match.title} · ${formatDate(match.date)} ${match.startTime}. Tap to confirm your spot.`,
      url: `/matches/${match.id}`,
      kind: "invite",
    });
    await awardBadge(db, env, user.id, "partner_bringer");
  }
  if (!waitlisted && match.date >= addDays(todayIn(), 7)) await awardBadge(db, env, user.id, "early_bird");
  return { ok: true, booking, waitlisted, partnerInvited };
}

export async function acceptInvite(env: Env, db: Db, user: User, booking: Booking, match: MatchDay): Promise<{ ok: boolean; error?: string }> {
  if (booking.userId !== user.id || booking.status !== "invited") return { ok: false, error: "Nothing to accept." };
  const settings = await getSettings(db);
  const elig = eligibility(user, match, settings);
  if (!elig.ok) return { ok: false, error: elig.reason };
  const price = await pricing(db, user, match, settings);
  await db
    .update(schema.bookings)
    .set({ status: "booked", paymentStatus: price.paymentStatus, priceCents: price.priceCents, updatedAt: new Date().toISOString() })
    .where(eq(schema.bookings.id, booking.id));
  if (booking.invitedBy)
    await notifyUsers(env, [booking.invitedBy], {
      title: `${user.name} confirmed as your partner`,
      body: `${match.title} · ${formatDate(match.date)} ${match.startTime}`,
      url: `/matches/${match.id}`,
      kind: "booking",
    });
  return { ok: true };
}

/** Cancel (or decline) a booking; applies late-cancel rules and promotes the waitlist. */
export async function cancelBooking(env: Env, db: Db, user: User, booking: Booking, match: MatchDay, byAdmin = false) {
  if (!byAdmin && booking.userId !== user.id) return { ok: false, error: "Not your booking." };
  if (!["booked", "invited", "waitlist"].includes(booking.status)) return { ok: false, error: "This booking can't be cancelled." };
  const settings = await getSettings(db);
  const startsAt = localDateTimeToEpoch(match.date, match.startTime, "Europe/Madrid");
  const hoursLeft = (startsAt - Date.now()) / 3_600_000;
  const late = !byAdmin && booking.status === "booked" && hoursLeft < num(settings, "freeCancelHours");
  const wasInvite = booking.status === "invited";
  await db
    .update(schema.bookings)
    .set({ status: late ? "late_cancelled" : "cancelled", updatedAt: new Date().toISOString() })
    .where(eq(schema.bookings.id, booking.id));
  if (late) await awardPoints(db, user.id, num(settings, "pointsLateCancel"), "Late cancellation", "booking", booking.id);

  // Untangle the partner link
  const other = booking.partnerUserId;
  if (other) {
    const otherBooking = await db
      .select()
      .from(schema.bookings)
      .where(and(eq(schema.bookings.matchDayId, match.id), eq(schema.bookings.userId, other), inArray(schema.bookings.status, ["booked", "invited", "waitlist"])))
      .get();
    if (otherBooking?.status === "invited" && otherBooking.invitedBy === user.id) {
      // The inviter cancelled before the partner accepted: withdraw the invite too.
      await db.update(schema.bookings).set({ status: "cancelled", partnerUserId: null, updatedAt: new Date().toISOString() }).where(eq(schema.bookings.id, otherBooking.id));
      if (!byAdmin)
        await notifyUsers(env, [other], {
          title: `${user.name} cancelled`,
          body: `${match.title} · ${formatDate(match.date)}. Their partner invite to you has been withdrawn — you can still book yourself.`,
          url: `/matches/${match.id}`,
          kind: "booking",
        });
    } else if (otherBooking) {
      await db.update(schema.bookings).set({ partnerUserId: null, updatedAt: new Date().toISOString() }).where(eq(schema.bookings.id, otherBooking.id));
      if (!byAdmin)
        await notifyUsers(env, [other], {
          title: wasInvite ? `${user.name} declined your invite` : `${user.name} cancelled`,
          body: `${match.title} · ${formatDate(match.date)}. You're still booked — pick another partner or play as a single.`,
          url: `/matches/${match.id}`,
          kind: "booking",
        });
    }
  }
  await promoteWaitlist(env, db, match);
  return { ok: true, late };
}

export async function promoteWaitlist(env: Env, db: Db, match: MatchDay) {
  const free = capacity(match) - (await activeBookingCount(db, match.id));
  if (free <= 0) return;
  const waiting = await db
    .select()
    .from(schema.bookings)
    .where(and(eq(schema.bookings.matchDayId, match.id), eq(schema.bookings.status, "waitlist")))
    .orderBy(schema.bookings.createdAt)
    .limit(free);
  const settings = await getSettings(db);
  for (const b of waiting) {
    const user = await db.select().from(schema.users).where(eq(schema.users.id, b.userId)).get();
    if (!user) continue;
    const price = await pricing(db, user, match, settings);
    const status = b.invitedBy ? "invited" : "booked";
    await db
      .update(schema.bookings)
      .set({ status, paymentStatus: status === "booked" ? price.paymentStatus : "included", priceCents: status === "booked" ? price.priceCents : 0, updatedAt: new Date().toISOString() })
      .where(eq(schema.bookings.id, b.id));
    await notifyUsers(env, [b.userId], {
      title: "A spot opened up — you're in!",
      body: `${match.title} · ${formatDate(match.date)} ${match.startTime}${price.priceCents ? ". This one is an extra session; please complete payment." : ""}`,
      url: `/matches/${match.id}`,
      kind: "booking",
    });
  }
}

/** Admin: mark attendance, award points & badges. */
export async function markAttendance(env: Env, db: Db, booking: Booking, status: "attended" | "no_show") {
  if (booking.status === status) return;
  const settings = await getSettings(db);
  await db.update(schema.bookings).set({ status, updatedAt: new Date().toISOString() }).where(eq(schema.bookings.id, booking.id));
  if (status === "attended") {
    await awardPoints(db, booking.userId, num(settings, "pointsAttend"), "Played a session", "booking", booking.id);
    if (booking.partnerUserId) await awardPoints(db, booking.userId, num(settings, "pointsPartner"), "Played with a partner", "booking", booking.id);
    await checkAttendanceBadges(db, env, booking.userId);
  } else {
    await awardPoints(db, booking.userId, num(settings, "pointsNoShow"), "No-show", "booking", booking.id);
  }
}

export async function matchWithBookings(db: Db, matchDayId: string) {
  const match = await db.select().from(schema.matchDays).where(eq(schema.matchDays.id, matchDayId)).get();
  if (!match) return null;
  const venue = match.venueId ? await db.select().from(schema.venues).where(eq(schema.venues.id, match.venueId)).get() : null;
  const rows = await db
    .select({ booking: schema.bookings, user: schema.users })
    .from(schema.bookings)
    .innerJoin(schema.users, eq(schema.users.id, schema.bookings.userId))
    .where(eq(schema.bookings.matchDayId, matchDayId))
    .orderBy(schema.bookings.createdAt);
  return { match, venue: venue ?? null, rows };
}
