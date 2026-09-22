import { desc } from "drizzle-orm";
import { Form, Link, useSearchParams } from "react-router";
import type { Route } from "./+types/members";
import { requireAdmin } from "~/lib/auth.server";
import { getDb, newId, schema } from "~/lib/db.server";
import { normalizeEmail } from "~/lib/auth.server";
import { Alert, Avatar, GroupPill, LevelPill, PageHeader, StatusPill } from "~/components/ui";
import { formatDate } from "~/lib/format";

export const meta: Route.MetaFunction = () => [{ title: "Members · Admin" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  await requireAdmin(request, env);
  const members = await getDb(env).select().from(schema.users).orderBy(desc(schema.users.createdAt));
  return { members };
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  await requireAdmin(request, env);
  const db = getDb(env);
  const form = await request.formData();
  const raw = String(form.get("bulk") ?? "");
  const lines = raw
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  let added = 0;
  const skipped: string[] = [];
  const existing = new Set((await db.select({ email: schema.users.email }).from(schema.users)).map((u) => u.email));
  for (const line of lines) {
    const [emailRaw, nameRaw, typeRaw] = line.split(/[,;\t]/).map((s) => s?.trim() ?? "");
    const email = normalizeEmail(emailRaw ?? "");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || existing.has(email)) {
      skipped.push(line);
      continue;
    }
    await db.insert(schema.users).values({
      id: newId("u"),
      email,
      name: nameRaw ?? "",
      status: "active",
      memberType: typeRaw?.toLowerCase().startsWith("f") || typeRaw?.toLowerCase().startsWith("l") ? "female" : "mixed",
    });
    existing.add(email);
    added++;
  }
  return { added, skipped };
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
      <PageHeader eyebrow="Admin" title="Members" subtitle={`${d.members.length} total`} />
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
          One per line: <code>email, name, group</code> (group = mixed or ladies). They're created as active and can sign in straight away with their email.
        </p>
        <Form method="post" className="mt-3 space-y-3">
          <textarea name="bulk" rows={5} className="textarea font-mono text-sm" placeholder={"ana@example.com, Ana García, ladies\ntom@example.com, Tom Smith, mixed"} />
          {actionData && (
            <Alert kind={actionData.added ? "success" : "warn"}>
              Added {actionData.added}. {actionData.skipped.length > 0 && `Skipped ${actionData.skipped.length} (invalid or already exist).`}
            </Alert>
          )}
          <button className="btn btn-ink">Add members</button>
        </Form>
      </section>
    </div>
  );
}
