// Self-applying database migrations.
//
// Cloudflare's git integration runs whatever deploy command is configured in the dashboard,
// which is easy to get wrong. So instead of relying on `wrangler d1 migrations apply` being
// run before each deploy, the Worker applies any pending SQL files from ./drizzle itself,
// once per isolate, using the same `d1_migrations` bookkeeping table wrangler uses.
// Running `wrangler d1 migrations apply` manually therefore stays compatible.

const files = import.meta.glob("../../drizzle/*.sql", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

const migrations = Object.entries(files)
  .map(([path, sql]) => ({ name: path.split("/").pop()!, sql }))
  .sort((a, b) => a.name.localeCompare(b.name));

let done: Promise<void> | null = null;

export function ensureMigrated(env: Env): Promise<void> {
  if (!done) {
    done = runMigrations(env).catch((err) => {
      done = null; // allow a retry on the next request
      throw err;
    });
  }
  return done;
}

async function runMigrations(env: Env) {
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  ).run();
  const applied = new Set(((await env.DB.prepare("SELECT name FROM d1_migrations").all<{ name: string }>()).results ?? []).map((r) => r.name));
  for (const m of migrations) {
    if (applied.has(m.name)) continue;
    const statements = m.sql
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);
    try {
      await env.DB.batch([...statements.map((s) => env.DB.prepare(s)), env.DB.prepare("INSERT INTO d1_migrations (name) VALUES (?)").bind(m.name)]);
      console.log(`[migrate] applied ${m.name}`);
    } catch (err) {
      // Another isolate may have applied it concurrently; if it is now recorded, move on.
      const row = await env.DB.prepare("SELECT 1 FROM d1_migrations WHERE name = ?").bind(m.name).first();
      if (!row) throw err;
    }
  }
}
