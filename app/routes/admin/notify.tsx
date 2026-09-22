import { desc } from "drizzle-orm";
import { Form, useNavigation } from "react-router";
import type { Route } from "./+types/notify";
import { requireAdmin } from "~/lib/auth.server";
import { getDb, newId, schema } from "~/lib/db.server";
import { audienceUserIds, notifyUsers, pushConfigured } from "~/lib/push.server";
import { Alert, Field, PageHeader } from "~/components/ui";
import { formatDateTime } from "~/lib/format";

export const meta: Route.MetaFunction = () => [{ title: "Notify members · Admin" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  await requireAdmin(request, env);
  const db = getDb(env);
  const history = await db.select().from(schema.announcements).orderBy(desc(schema.announcements.createdAt)).limit(20);
  const counts = { all: (await audienceUserIds(env, "all")).length, mixed: (await audienceUserIds(env, "mixed")).length, female: (await audienceUserIds(env, "female")).length };
  return { history, counts, push: pushConfigured(env) };
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const admin = await requireAdmin(request, env);
  const db = getDb(env);
  const f = await request.formData();
  const title = String(f.get("title") ?? "").trim();
  const body = String(f.get("body") ?? "").trim();
  const url = String(f.get("url") ?? "").trim() || null;
  const audience = (["all", "mixed", "female"].includes(String(f.get("audience"))) ? String(f.get("audience")) : "all") as "all" | "mixed" | "female";
  if (!title || !body) return { error: "Title and message are required." };
  const ids = await audienceUserIds(env, audience);
  const sent = await notifyUsers(env, ids, { title, body, url: url ?? "/inbox", kind: "announcement" });
  await db.insert(schema.announcements).values({ id: newId("an"), title, body, url, audience, pushed: sent > 0, pushCount: sent, createdBy: admin.id });
  return { success: `Sent to ${ids.length} members' inboxes, ${sent} push notifications delivered.` };
}

export default function Notify({ loaderData: d, actionData }: Route.ComponentProps) {
  const nav = useNavigation();
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader eyebrow="Admin" title="Notify members" subtitle="Goes to every member's inbox in the app, and as a push notification to devices that opted in." />
      {!d.push && <Alert kind="warn">Push isn't configured yet (VAPID keys). Messages will still appear in members' in-app inbox.</Alert>}
      <Form method="post" className="card mt-4 space-y-4 p-5">
        <Field label="Audience">
          <select name="audience" className="select" defaultValue="all">
            <option value="all">All active members ({d.counts.all})</option>
            <option value="mixed">Mixed group ({d.counts.mixed})</option>
            <option value="female">Ladies ({d.counts.female})</option>
          </select>
        </Field>
        <Field label="Title">
          <input name="title" required maxLength={80} className="input" placeholder="Level day is Saturday 12th" />
        </Field>
        <Field label="Message">
          <textarea name="body" required rows={4} maxLength={500} className="textarea" placeholder="Coach Marta will assess everyone between 10:00 and 14:00 at Padel Indoor. Book a 20-minute slot by replying on WhatsApp." />
        </Field>
        <Field label="Link (optional)" hint="Where tapping the notification takes them, e.g. /events/abc or /perks">
          <input name="url" className="input" placeholder="/events" />
        </Field>
        {actionData?.error && <Alert kind="error">{actionData.error}</Alert>}
        {actionData?.success && <Alert kind="success">{actionData.success}</Alert>}
        <button className="btn btn-ink w-full" disabled={nav.state !== "idle"}>
          {nav.state !== "idle" ? "Sending…" : "Send notification"}
        </button>
      </Form>
      <section className="mt-8">
        <h2 className="mb-2 text-lg font-semibold">Sent</h2>
        {d.history.length === 0 ? (
          <p className="text-sm text-ink-50">Nothing sent yet.</p>
        ) : (
          <div className="card divide-y divide-line text-sm">
            {d.history.map((a) => (
              <div key={a.id} className="p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-ink">{a.title}</p>
                  <span className="text-xs text-ink-50">
                    {formatDateTime(a.createdAt)} · {a.audience} · {a.pushCount} push
                  </span>
                </div>
                <p className="text-ink-70">{a.body}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
