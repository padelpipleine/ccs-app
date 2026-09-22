import { and, desc, eq, isNull } from "drizzle-orm";
import { Form, Link } from "react-router";
import type { Route } from "./+types/inbox";
import { requireActiveMember } from "~/lib/auth.server";
import { getDb, schema } from "~/lib/db.server";
import { Empty, PageHeader } from "~/components/ui";
import { formatDateTime } from "~/lib/format";
import { PushToggle } from "~/components/push-toggle";

export const meta: Route.MetaFunction = () => [{ title: "Inbox · Crosscourt Social" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const user = await requireActiveMember(request, env);
  const db = getDb(env);
  const items = await db.select().from(schema.notifications).where(eq(schema.notifications.userId, user.id)).orderBy(desc(schema.notifications.createdAt)).limit(50);
  const announcements = await db.select().from(schema.announcements).orderBy(desc(schema.announcements.createdAt)).limit(10);
  return {
    items,
    announcements: announcements.filter((a) => a.audience === "all" || (a.audience === "female" ? user.gender === "female" || user.memberType === "female" : user.memberType === "mixed")),
    vapidPublicKey: env.VAPID_PUBLIC_KEY ?? null,
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const user = await requireActiveMember(request, env);
  await getDb(env)
    .update(schema.notifications)
    .set({ readAt: new Date().toISOString() })
    .where(and(eq(schema.notifications.userId, user.id), isNull(schema.notifications.readAt)));
  return { ok: true };
}

export default function Inbox({ loaderData: d }: Route.ComponentProps) {
  const unread = d.items.filter((i) => !i.readAt).length;
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        eyebrow="Notifications"
        title="Inbox"
        action={
          unread > 0 ? (
            <Form method="post">
              <button className="btn btn-ghost btn-sm">Mark all read</button>
            </Form>
          ) : null
        }
      />
      <div className="mb-6">
        <PushToggle vapidPublicKey={d.vapidPublicKey} />
      </div>
      {d.announcements.length > 0 && (
        <section className="mb-6">
          <p className="eyebrow mb-2">From the club</p>
          <div className="space-y-2">
            {d.announcements.map((a) => (
              <div key={a.id} className="card-ink p-4">
                <p className="font-display font-semibold text-bone">{a.title}</p>
                <p className="mt-1 whitespace-pre-line text-sm text-on-ink-muted">{a.body}</p>
                <div className="mt-2 flex items-center justify-between text-xs text-on-ink-muted">
                  <span>{formatDateTime(a.createdAt)}</span>
                  {a.url && (
                    <Link to={a.url} className="text-teal">
                      Open →
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
      {d.items.length === 0 ? (
        <Empty title="Nothing yet" body="Booking confirmations, partner invites and reminders will land here." />
      ) : (
        <div className="card divide-y divide-line">
          {d.items.map((n) => (
            <Link key={n.id} to={n.url ?? "#"} className={`block p-4 ${n.readAt ? "" : "bg-indigo-soft/50"}`}>
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium text-ink">{n.title}</p>
                <span className="shrink-0 text-xs text-ink-50">{formatDateTime(n.createdAt)}</span>
              </div>
              <p className="mt-0.5 text-sm text-ink-70">{n.body}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
