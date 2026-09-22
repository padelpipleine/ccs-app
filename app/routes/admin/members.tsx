import { desc } from "drizzle-orm";
import { Form, Link, useSearchParams } from "react-router";
import type { Route } from "./+types/members";
import { requireAdmin } from "~/lib/auth.server";
import { getDb, newId, schema } from "~/lib/db.server";
import { normalizeEmail } from "~/lib/auth.server";
import { siteSyncConfigured, syncFromSite } from "~/lib/site-sync.server";
import { Alert, Avatar, GroupPill, LevelPill, PageHeader, StatusPill } from "~/components/ui";
import { formatDate } from "~/lib/format";

export const meta: Route.MetaFunction = () => [{ title: "Members · Admin" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  await requireAdmin(request, env);
  const members = await getDb(env).select().from(schema.users).orderBy(desc(schema.users.createdAt));
  return { members, siteSync: siteSyncConfigured(env) };
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  await requireAdmin(request, env);
  const db = getDb(env);
  const form = await request.formData();
  if (form.get("intent") === "sync") {
    if (!siteSyncConfigured(env)) return { sync: null, error: "Add the SITE_CRM_KEY secret to enable syncing from the club site." };
    try {
      const r = await syncFromSite(env, new URL(request.url).origin);
      return { sync: r };
    } catch (err) {
      return { sync: null, error: `Sync failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
  const raw = String(form.get("bulk") ?? "");
  const lines = raw
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  let added = 0;
  const skipped: string[] = [];
  const existing = new Set((await db.select({ email: schema.users.email }).from(schema.users)).map((u) => u.email));
  for (const line of lines) {
    const [emailRaw, nameRaw, typeRaw, phoneRaw, genderRaw] = line.split(/[,;\t]/).map((s) => s?.trim() ?? "");
    const email = normalizeEmail(emailRaw ?? "");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || existing.has(email)) {
      skipped.push(line);
      continue;
    }
    const g = (genderRaw ?? "").toLowerCase();
    const gender = g.startsWith("f") || g === "w" ? "female" : g.startsWith("m") ? "male" : null;
    await db.insert(schema.users).values({
      id: newId("u"),
      email,
      name: nameRaw ?? "",
      phone: phoneRaw || null,
      gender,
      status: "active",
      memberType: gender === "male" ? "mixed" : typeRaw?.toLowerCase().startsWith("f") || typeRaw?.toLowerCase().startsWith("l") ? "female" : "mixed",
    });
    existing.add(email);
    added++;
  }
  return { added, skipped, sync: undefined };
}

export default function AdminMembers({ loaderData: d, actionData }: Route.ComponentProps) {
  const [params] = useSearchParams();
  const f = params.get("f") ?? "all";
  const q = (params.get("q") ?? "").toLowerCase();
  const list = d.members.filter((m) => {
    if (q && !`${m.name} ${m.email}`.toLowerCase().includes(q)) return false;
    if (f === "pending") return m.status === "pending";
    if (f === "unassessed") return m.status === "active" && m.level == null;
    if (f === "female") return m.memberType === "female";
    if (f === "mixed") return m.memberType === "mixed";
    if (f === "admins") return m.role === "admin";
    return true;
  });
  return (
    <div>
      <PageHeader
        eyebrow="Admin"
        title="Members"
        subtitle={`${d.members.length} total`}
        action={
          <Form method="post">
            <button name="intent" value="sync" className="btn btn-outline btn-sm" disabled={!d.siteSync} title={d.siteSync ? "Pull sign-ups and payment status from club.crosscourt.social" : "Set the SITE_CRM_KEY secret first"}>
              ↻ Sync from club site
            </button>
          </Form>
        }
      />
      {actionData && "sync" in actionData && actionData.sync && (
        <Alert kind="success">
          Synced with the club site: {actionData.sync.created} new, {actionData.sync.activated} activated, {actionData.sync.paused} paused, {actionData.sync.updated} updated, {actionData.sync.skipped} skipped
          {actionData.sync.invited ? `, ${actionData.sync.invited} welcome emails sent` : ""}.
          {actionData.sync.errors.length > 0 && ` Errors: ${actionData.sync.errors.join("; ")}`}
        </Alert>
      )}
      {actionData && "error" in actionData && actionData.error && <Alert kind="error">{actionData.error}</Alert>}
      {!d.siteSync && (
        <p className="mb-3 text-xs text-ink-50">Automatic sync with club.crosscourt.social is off until the SITE_CRM_KEY secret is set on the Worker (see DEPLOY.md).</p>
      )}
      <form className="mb-3 flex gap-2">
        <input name="q" defaultValue={q} placeholder="Search name or email" className="input" />
        <input type="hidden" name="f" value={f} />
        <button className="btn btn-ghost">Search</button>
      </form>
      <div className="mb-4 flex flex-wrap gap-2">
        {[
          ["all", "All"],
          ["pending", "Pending"],
          ["unassessed", "Needs level"],
          ["mixed", "Mixed"],
          ["female", "Ladies"],
          ["admins", "Admins"],
        ].map(([k, label]) => (
          <Link key={k} to={`/admin/members?f=${k}${q ? `&q=${q}` : ""}`} className={`pill ${f === k ? "pill-ink" : "pill-outline"}`}>
            {label}
          </Link>
        ))}
      </div>
      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Member</th>
              <th>Group</th>
              <th>Level</th>
              <th>Status</th>
              <th>Joined</th>
            </tr>
          </thead>
          <tbody>
            {list.map((m) => (
              <tr key={m.id}>
                <td>
                  <Link to={`/admin/members/${m.id}`} className="flex items-center gap-2">
                    <Avatar name={m.name || m.email} url={m.avatarUrl} size={28} />
                    <span>
                      <span className="block font-medium text-ink">{m.name || <em className="text-ink-50">No profile yet</em>}</span>
                      <span className="block text-xs text-ink-50">{m.email}</span>
                    </span>
                  </Link>
                </td>
                <td>
                  <GroupPill group={m.memberType} />
                </td>
                <td>
                  <LevelPill level={m.level} />
                </td>
                <td>
                  <StatusPill status={m.status} /> {m.role === "admin" && <span className="pill pill-ink">admin</span>}
                </td>
                <td className="text-xs text-ink-50">{formatDate(m.createdAt.slice(0, 10))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="card mt-8 p-5">
        <h2 className="text-lg font-semibold">Add members in bulk</h2>
        <p className="mt-1 text-sm text-ink-50">
          One per line: <code>email, name, group, phone, gender</code> (group = mixed or ladies; phone and gender optional). They're created as active and can sign in straight away.
        </p>
        <Form method="post" className="mt-3 space-y-3">
          <textarea name="bulk" rows={5} className="textarea font-mono text-sm" placeholder={"ana@example.com, Ana García, ladies, +34 600 000 000, female\ntom@example.com, Tom Smith, mixed, , male"} />
          {actionData && "added" in actionData && (
            <Alert kind={actionData.added ? "success" : "warn"}>
              Added {actionData.added}. {(actionData.skipped?.length ?? 0) > 0 && `Skipped ${actionData.skipped?.length} (invalid or already exist).`}
            </Alert>
          )}
          <button className="btn btn-ink">Add members</button>
        </Form>
      </section>
    </div>
  );
}
