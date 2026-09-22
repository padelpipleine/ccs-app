import { and, eq } from "drizzle-orm";
import type { Route } from "./+types/api.push";
import { requireUser } from "~/lib/auth.server";
import { getDb, newId, schema } from "~/lib/db.server";

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const user = await requireUser(request, env);
  const db = getDb(env);
  const form = await request.formData();
  const intent = form.get("intent");
  if (intent === "subscribe") {
    const sub = JSON.parse(String(form.get("subscription"))) as { endpoint: string; keys: { p256dh: string; auth: string } };
    if (!sub?.endpoint?.startsWith("https://") || !sub.keys?.p256dh || !sub.keys?.auth) return Response.json({ ok: false }, { status: 400 });
    await db
      .insert(schema.pushSubscriptions)
      .values({ id: newId("ps"), userId: user.id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: request.headers.get("user-agent") })
      .onConflictDoUpdate({ target: schema.pushSubscriptions.endpoint, set: { userId: user.id, p256dh: sub.keys.p256dh, auth: sub.keys.auth } });
    return Response.json({ ok: true });
  }
  if (intent === "unsubscribe") {
    const endpoint = String(form.get("endpoint") ?? "");
    await db.delete(schema.pushSubscriptions).where(and(eq(schema.pushSubscriptions.endpoint, endpoint), eq(schema.pushSubscriptions.userId, user.id)));
    return Response.json({ ok: true });
  }
  return Response.json({ ok: false }, { status: 400 });
}

export function loader() {
  return Response.json({ ok: false }, { status: 405 });
}
