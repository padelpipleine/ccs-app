import { and, count, eq, inArray, sql } from "drizzle-orm";
import { newId, schema, type Db } from "./db.server";
import { notifyUsers } from "./push.server";
import { BADGES } from "./format";

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
  const [{ played }] = await db
    .select({ played: count() })
    .from(schema.bookings)
    .where(and(eq(schema.bookings.userId, userId), eq(schema.bookings.status, "attended")));
  if (played >= 1) await awardBadge(db, env, userId, "first_match");
  if (played >= 5) await awardBadge(db, env, userId, "five_matches");
  if (played >= 20) await awardBadge(db, env, userId, "twenty_matches");
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
