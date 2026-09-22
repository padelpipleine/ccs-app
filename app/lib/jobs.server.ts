import { and, eq, inArray, isNull, lt } from "drizzle-orm";
import { getDb, schema } from "./db.server";
import { notifyUsers } from "./push.server";
import { addDays, formatDate, todayIn } from "./format";
import { promoteWaitlist } from "./bookings.server";

/** Runs hourly (see wrangler.jsonc triggers). Idempotent. */
export async function runScheduledJobs(env: Env) {
  const db = getDb(env);
  const today = todayIn(env.TIMEZONE || "Europe/Madrid");
  const tomorrow = addDays(today, 1);

  // 1. Reminders for tomorrow's sessions
  const matches = await db
    .select()
    .from(schema.matchDays)
    .where(and(eq(schema.matchDays.date, tomorrow), eq(schema.matchDays.status, "open"), isNull(schema.matchDays.reminderSentAt)));
  for (const m of matches) {
    const bookings = await db
      .select({ userId: schema.bookings.userId })
      .from(schema.bookings)
      .where(and(eq(schema.bookings.matchDayId, m.id), inArray(schema.bookings.status, ["booked", "invited"])));
    const venue = m.venueId ? await db.select().from(schema.venues).where(eq(schema.venues.id, m.venueId)).get() : null;
    await notifyUsers(
      env,
      bookings.map((b) => b.userId),
      {
        title: `Tomorrow: ${m.title}`,
        body: `${m.startTime}–${m.endTime}${venue ? ` at ${venue.name}` : ""}. ${m.socialAfter ? "Social afterwards 🍸" : "See you on court!"}`,
        url: `/matches/${m.id}`,
        kind: "reminder",
      },
    );
    await db.update(schema.matchDays).set({ reminderSentAt: new Date().toISOString() }).where(eq(schema.matchDays.id, m.id));
  }

  // 2. Reminders for tomorrow's events
  const events = await db
    .select()
    .from(schema.events)
    .where(and(eq(schema.events.date, tomorrow), eq(schema.events.status, "open"), isNull(schema.events.reminderSentAt)));
  for (const e of events) {
    const regs = await db
      .select({ userId: schema.eventRegistrations.userId })
      .from(schema.eventRegistrations)
      .where(and(eq(schema.eventRegistrations.eventId, e.id), eq(schema.eventRegistrations.status, "registered")));
    await notifyUsers(
      env,
      regs.map((r) => r.userId),
      { title: `Tomorrow: ${e.title}`, body: `${e.startTime}${e.location ? ` · ${e.location}` : ""}`, url: `/events/${e.id}`, kind: "reminder" },
    );
    await db.update(schema.events).set({ reminderSentAt: new Date().toISOString() }).where(eq(schema.events.id, e.id));
  }

  // 3. Expire partner invites that were never accepted (48h old, or session is today)
  const cutoff = new Date(Date.now() - 48 * 3_600_000).toISOString();
  const stale = await db
    .select({ booking: schema.bookings, match: schema.matchDays })
    .from(schema.bookings)
    .innerJoin(schema.matchDays, eq(schema.matchDays.id, schema.bookings.matchDayId))
    .where(and(eq(schema.bookings.status, "invited"), lt(schema.bookings.createdAt, cutoff)));
  for (const { booking, match } of stale) {
    await db.update(schema.bookings).set({ status: "cancelled", updatedAt: new Date().toISOString() }).where(eq(schema.bookings.id, booking.id));
    if (booking.invitedBy) {
      await db.update(schema.bookings).set({ partnerUserId: null }).where(and(eq(schema.bookings.matchDayId, match.id), eq(schema.bookings.userId, booking.invitedBy)));
      await notifyUsers(env, [booking.invitedBy], {
        title: "Your partner invite expired",
        body: `${match.title} · ${formatDate(match.date)}. You're still booked — you can invite someone else.`,
        url: `/matches/${match.id}`,
        kind: "booking",
      });
    }
    await promoteWaitlist(env, db, match);
  }

  // 4. Auto-complete past sessions and events that admins haven't closed
  await db.update(schema.matchDays).set({ status: "completed" }).where(and(lt(schema.matchDays.date, today), eq(schema.matchDays.status, "open")));
  await db.update(schema.events).set({ status: "completed" }).where(and(lt(schema.events.date, today), eq(schema.events.status, "open")));
}
