import { and, count, eq, gte, inArray, sql } from "drizzle-orm";
import { schema, type Db } from "./db.server";
import { ACTIVE_STATUSES, capacity, eligibility } from "./bookings.server";
import type { Settings } from "./settings.server";
import { todayIn } from "./format";
import type { MatchCardData, EventCardData } from "~/components/cards";
import type { User } from "~/db/schema";

/** Upcoming sessions with venue, spots left and the member's own status. */
export async function upcomingMatches(db: Db, user: User, settings: Settings, opts: { limit?: number; onlyMine?: boolean } = {}): Promise<MatchCardData[]> {
  const today = todayIn();
  const matches = await db
    .select({ match: schema.matchDays, venueName: schema.venues.name })
    .from(schema.matchDays)
    .leftJoin(schema.venues, eq(schema.venues.id, schema.matchDays.venueId))
    .where(and(gte(schema.matchDays.date, today), inArray(schema.matchDays.status, ["open", "cancelled"])))
    .orderBy(schema.matchDays.date, schema.matchDays.startTime)
    .limit(opts.limit ?? 60);
  if (matches.length === 0) return [];
  const ids = matches.map((m) => m.match.id);
  const counts = await db
    .select({ matchDayId: schema.bookings.matchDayId, n: count() })
    .from(schema.bookings)
    .where(and(inArray(schema.bookings.matchDayId, ids), inArray(schema.bookings.status, [...ACTIVE_STATUSES])))
    .groupBy(schema.bookings.matchDayId);
  const mine = await db
    .select({ matchDayId: schema.bookings.matchDayId, status: schema.bookings.status })
    .from(schema.bookings)
    .where(and(inArray(schema.bookings.matchDayId, ids), eq(schema.bookings.userId, user.id), inArray(schema.bookings.status, ["booked", "invited", "waitlist"])));
  const countMap = new Map(counts.map((c) => [c.matchDayId, c.n]));
  const mineMap = new Map(mine.map((m) => [m.matchDayId, m.status]));
  const out = matches.map(({ match, venueName }) => {
    const elig = eligibility(user, match, settings, today);
    return {
      ...match,
      venueName,
      spotsLeft: capacity(match) - (countMap.get(match.id) ?? 0),
      myStatus: mineMap.get(match.id) ?? null,
      eligible: elig.ok,
      reason: elig.ok ? undefined : elig.reason,
    };
  });
  return opts.onlyMine ? out.filter((m) => m.myStatus) : out;
}

export async function upcomingEvents(db: Db, user: User, opts: { limit?: number } = {}): Promise<EventCardData[]> {
  const today = todayIn();
  const rows = await db
    .select()
    .from(schema.events)
    .where(and(gte(schema.events.date, today), inArray(schema.events.status, ["open", "cancelled"])))
    .orderBy(schema.events.date, schema.events.startTime)
    .limit(opts.limit ?? 40);
  if (rows.length === 0) return [];
  const ids = rows.map((e) => e.id);
  const counts = await db
    .select({ eventId: schema.eventRegistrations.eventId, n: sql<number>`sum(1 + ${schema.eventRegistrations.guests})` })
    .from(schema.eventRegistrations)
    .where(and(inArray(schema.eventRegistrations.eventId, ids), eq(schema.eventRegistrations.status, "registered")))
    .groupBy(schema.eventRegistrations.eventId);
  const mine = await db
    .select({ eventId: schema.eventRegistrations.eventId, status: schema.eventRegistrations.status })
    .from(schema.eventRegistrations)
    .where(and(inArray(schema.eventRegistrations.eventId, ids), eq(schema.eventRegistrations.userId, user.id), inArray(schema.eventRegistrations.status, ["registered", "waitlist"])));
  const countMap = new Map(counts.map((c) => [c.eventId, Number(c.n)]));
  const mineMap = new Map(mine.map((m) => [m.eventId, m.status]));
  return rows
    .filter((e) => e.group === "all" || (e.group === "female" ? user.gender === "female" || user.memberType === "female" : user.memberType === "mixed"))
    .map((e) => ({ ...e, going: countMap.get(e.id) ?? 0, myStatus: mineMap.get(e.id) ?? null }));
}
