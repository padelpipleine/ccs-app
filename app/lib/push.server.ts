import { buildPushPayload, type PushSubscription } from "@block65/webcrypto-web-push";
import { eq, inArray } from "drizzle-orm";
import { getDb, newId, schema } from "./db.server";

export type PushMessage = { title: string; body: string; url?: string; kind?: string };

export function pushConfigured(env: Env) {
  return Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
}

/**
 * Stores an in-app notification for each user and, when web push is configured,
 * sends a push to every device they have subscribed. Returns the number of pushes sent.
 */
export async function notifyUsers(env: Env, userIds: string[], msg: PushMessage): Promise<number> {
  const ids = Array.from(new Set(userIds)).filter(Boolean);
  if (ids.length === 0) return 0;
  const db = getDb(env);
  // In-app inbox
  const chunk = 50;
  for (let i = 0; i < ids.length; i += chunk) {
    await db.insert(schema.notifications).values(
      ids.slice(i, i + chunk).map((userId) => ({
        id: newId("n"),
        userId,
        title: msg.title,
        body: msg.body,
        url: msg.url ?? null,
        kind: msg.kind ?? "general",
      })),
    );
  }
  if (!pushConfigured(env)) return 0;

  const subs = await db.select().from(schema.pushSubscriptions).where(inArray(schema.pushSubscriptions.userId, ids));
  const vapid = {
    subject: env.VAPID_SUBJECT || "mailto:contact@crosscourt.social",
    publicKey: env.VAPID_PUBLIC_KEY!,
    privateKey: env.VAPID_PRIVATE_KEY!,
  };
  let sent = 0;
  const dead: string[] = [];
  await Promise.all(
    subs.map(async (s) => {
      const subscription: PushSubscription = { endpoint: s.endpoint, expirationTime: null, keys: { p256dh: s.p256dh, auth: s.auth } };
      try {
        const payload = await buildPushPayload(
          { data: JSON.stringify({ title: msg.title, body: msg.body, url: msg.url ?? "/" }), options: { ttl: 60 * 60 * 12 } },
          subscription,
          vapid,
        );
        const res = await fetch(s.endpoint, payload);
        if (res.status === 404 || res.status === 410) dead.push(s.id);
        else if (res.ok || res.status === 201) sent++;
        else console.warn("[push] failed", res.status, await res.text());
      } catch (err) {
        console.warn("[push] error", err);
      }
    }),
  );
  if (dead.length) await db.delete(schema.pushSubscriptions).where(inArray(schema.pushSubscriptions.id, dead));
  return sent;
}

export async function audienceUserIds(env: Env, audience: "all" | "mixed" | "female"): Promise<string[]> {
  const db = getDb(env);
  const rows = await db
    .select({ id: schema.users.id, memberType: schema.users.memberType, gender: schema.users.gender })
    .from(schema.users)
    .where(eq(schema.users.status, "active"));
  return rows
    .filter((u) => {
      if (audience === "all") return true;
      if (audience === "female") return u.gender === "female" || u.memberType === "female";
      return u.memberType === "mixed";
    })
    .map((u) => u.id);
}
