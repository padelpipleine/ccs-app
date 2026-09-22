import { eq } from "drizzle-orm";
import type { Route } from "./+types/api.photo";
import { requireUser } from "~/lib/auth.server";
import { getDb, schema } from "~/lib/db.server";
import { deletePhotoByUrl, storePhoto } from "~/lib/photos.server";

/** Upload (or remove) the signed-in member's profile photo. */
export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const user = await requireUser(request, env);
  const db = getDb(env);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "upload");
  if (intent === "remove") {
    await deletePhotoByUrl(env, user.avatarUrl);
    await db.update(schema.users).set({ avatarUrl: null }).where(eq(schema.users.id, user.id));
    return Response.json({ ok: true, url: null });
  }
  const file = form.get("photo");
  if (!(file instanceof File) || file.size === 0) return Response.json({ ok: false, error: "No photo received." }, { status: 400 });
  const stored = await storePhoto(env, user.id, file);
  if (!stored.ok) return Response.json({ ok: false, error: stored.error }, { status: 400 });
  await deletePhotoByUrl(env, user.avatarUrl);
  await db.update(schema.users).set({ avatarUrl: stored.url }).where(eq(schema.users.id, user.id));
  return Response.json({ ok: true, url: stored.url });
}

export function loader() {
  return Response.json({ ok: false }, { status: 405 });
}
