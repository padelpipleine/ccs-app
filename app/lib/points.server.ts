import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { newId, schema, type Db } from "./db.server";
import { notifyUsers } from "./push.server";
import { addDays, BADGES, isoWeekKey } from "./format";

export async function awardPoints(db: Db, userId: string, points: number, reason: string, refType?: string, refId?: string) {
  if (!points) return;
  await db.insert(schema.pointsLedger).values({ id: newId("p"), userId, points, reason, refType: refType ?? null, refId: refId ?? null });
  await db
    .update(schema.users)
    .set({ socialPoints: sql`max(0, ${schema.users.socialPoints} + ${points})` })
    .where(eq(schema.users.id, userId));
}

/** Awards a badge once. Returns true if newly awarded. */
export async function awardBadge(db: Db, env: Env, userId: string, key: keyof typeof BADGES): Promise<boolean> {
  const existing = await db
    .select({ id: schema.badges.id })
    .from(schema.badges)
    .where(and(eq(schema.badges.userId, userId), eq(schema.badges.key, key)))
    .get();
  if (existing) return false;
  await db.insert(schema.badges).values({ id: newId("b"), userId, key });
  const b = BADGES[key]!;
  await notifyUsers(env, [userId], { title: `${b.icon} Badge unlocked: ${b.name}`, body: b.description, url: "/profile", kind: "badge" });
  return true;
}

export async function checkAttendanceBadges(db: Db, env: Env, userId: string) {
  const played = await db
    .select({ date: schema.matchDays.date })
    .from(schema.bookings)
    .innerJoin(schema.matchDays, eq(schema.matchDays.id, schema.bookings.matchDayId))
    .where(and(eq(schema.bookings.userId, userId), eq(schema.bookings.status, "attended")));
  if (played.length >= 1) await awardBadge(db, env, userId, "first_match");
  if (played.length >= 5) await awardBadge(db, env, userId, "five_matches");
  if (played.length >= 20) await awardBadge(db, env, userId, "twenty_matches");

  // Streak: an attended session in each of the last 4 ISO weeks (counting from the latest one played).
  if (played.length >= 4) {
    const weeks = new Set(played.map((p) => isoWeekKey(p.date)));
    const latest = played.map((p) => p.date).sort().at(-1)!;
    const streak = [0, 1, 2, 3].every((i) => weeks.has(isoWeekKey(addDays(latest, -7 * i))));
    if (streak) await awardBadge(db, env, userId, "streak_4");
  }
}

/** Badges for a set of members, keyed by user id. */
export async function badgesForUsers(db: Db, userIds: string[]) {
  const map = new Map<string, string[]>();
  if (userIds.length === 0) return map;
  const rows = await db
    .select({ userId: schema.badges.userId, key: schema.badges.key })
    .from(schema.badges)
    .where(inArray(schema.badges.userId, userIds))
    .orderBy(schema.badges.awardedAt);
  for (const r of rows) map.set(r.userId, [...(map.get(r.userId) ?? []), r.key]);
  return map;
}

/** The most recent badge awards across the club. */
export async function recentBadges(db: Db, limit = 6) {
  return db
    .select({ id: schema.badges.id, key: schema.badges.key, awardedAt: schema.badges.awardedAt, userId: schema.users.id, name: schema.users.name, avatarUrl: schema.users.avatarUrl })
    .from(schema.badges)
    .innerJoin(schema.users, eq(schema.users.id, schema.badges.userId))
    .where(eq(schema.users.status, "active"))
    .orderBy(desc(schema.badges.awardedAt))
    .limit(limit);
}

export async function checkEventBadges(db: Db, env: Env, userId: string) {
  const [{ attended }] = await db
    .select({ attended: count() })
    .from(schema.eventRegistrations)
    .where(and(eq(schema.eventRegistrations.userId, userId), eq(schema.eventRegistrations.status, "attended")));
  if (attended >= 1) await awardBadge(db, env, userId, "first_event");
  if (attended >= 3) await awardBadge(db, env, userId, "three_events");
}

export async function userBadges(db: Db, userId: string) {
  return db.select().from(schema.badges).where(eq(schema.badges.userId, userId));
}

export async function leaderboard(db: Db, limit = 25) {
  return db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      avatarUrl: schema.users.avatarUrl,
      level: schema.users.level,
      socialPoints: schema.users.socialPoints,
      memberType: schema.users.memberType,
    })
    .from(schema.users)
    .where(and(eq(schema.users.status, "active"), inArray(schema.users.role, ["member", "admin"])))
    .orderBy(sql`${schema.users.socialPoints} desc`)
    .limit(limit);
}
