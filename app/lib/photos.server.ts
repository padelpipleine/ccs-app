// Member profile photos in R2. Keys look like avatars/<userId>/<random>.jpg and are
// served from /photos/<key> with long cache headers (a new upload gets a new key).
const MAX_BYTES = 3 * 1024 * 1024;
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export function photosConfigured(env: Env) {
  return Boolean(env.PHOTOS);
}

export async function storePhoto(env: Env, userId: string, file: File): Promise<{ ok: true; url: string; key: string } | { ok: false; error: string }> {
  if (!env.PHOTOS) return { ok: false, error: "Photo storage isn't set up yet." };
  const ext = TYPES[file.type];
  if (!ext) return { ok: false, error: "Please choose a JPG, PNG or WebP image." };
  if (file.size > MAX_BYTES) return { ok: false, error: "That image is too large (max 3 MB)." };
  const rand = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  const key = `avatars/${userId}/${rand}.${ext}`;
  await env.PHOTOS.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type, cacheControl: "public, max-age=31536000, immutable" } });
  return { ok: true, url: `/photos/${key}`, key };
}

export async function deletePhotoByUrl(env: Env, url: string | null | undefined) {
  if (!env.PHOTOS || !url?.startsWith("/photos/")) return;
  await env.PHOTOS.delete(url.slice("/photos/".length)).catch(() => {});
}

export async function servePhoto(key: string, env: Env): Promise<Response> {
  if (!env.PHOTOS || !/^avatars\/[\w-]+\/[\w]+\.(jpg|png|webp)$/.test(key)) return new Response("Not found", { status: 404 });
  const obj = await env.PHOTOS.get(key);
  if (!obj) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("etag", obj.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");
  return new Response(obj.body, { headers });
}
