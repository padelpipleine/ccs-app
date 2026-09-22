import { and, desc, eq, inArray } from "drizzle-orm";
import { Form, Link } from "react-router";
import type { Route } from "./+types/profile";
import { requireActiveMember } from "~/lib/auth.server";
import { getDb, schema } from "~/lib/db.server";
import { userBadges } from "~/lib/points.server";
import { Avatar, GroupPill, LevelPill, PageHeader, StatusPill } from "~/components/ui";
import { BADGES, formatDate, levelBand, socialLevel } from "~/lib/format";
import { PushToggle } from "~/components/push-toggle";

export const meta: Route.MetaFunction = () => [{ title: "Profile · Crosscourt Social" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const user = await requireActiveMember(request, env);
  const db = getDb(env);
  const [badges, history, played, ledger] = await Promise.all([
    userBadges(db, user.id),
    db.select().from(schema.levelHistory).where(eq(schema.levelHistory.userId, user.id)).orderBy(desc(schema.levelHistory.createdAt)).limit(6),
    db
      .select({ date: schema.matchDays.date, title: schema.matchDays.title, status: schema.bookings.status })
      .from(schema.bookings)
      .innerJoin(schema.matchDays, eq(schema.matchDays.id, schema.bookings.matchDayId))
      .where(and(eq(schema.bookings.userId, user.id), inArray(schema.bookings.status, ["attended", "no_show", "late_cancelled"])))
      .orderBy(desc(schema.matchDays.date))
      .limit(10),
    db.select().from(schema.pointsLedger).where(eq(schema.pointsLedger.userId, user.id)).orderBy(desc(schema.pointsLedger.createdAt)).limit(10),
  ]);
  return { user, badges, history, played, ledger, vapidPublicKey: env.VAPID_PUBLIC_KEY ?? null };
}

export default function Profile({ loaderData: d }: Route.ComponentProps) {
  const u = d.user;
  const sl = socialLevel(u.socialPoints);
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        eyebrow="Your profile"
        title={u.name}
        action={
          <Link to="/profile/edit" className="btn btn-outline btn-sm">
            Edit profile
          </Link>
        }
      />
      <div className="card flex items-center gap-4 p-5">
        <Avatar name={u.name} url={u.avatarUrl} size={64} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-2">
            <LevelPill level={u.level} />
            <GroupPill group={u.memberType} />
            <StatusPill status={u.status} />
          </div>
          <p className="mt-2 text-sm text-ink-70">
            {[levelBand(u.level), u.handedness && `${u.handedness}-handed`, u.preferredSide && `plays ${u.preferredSide} side`, u.playStyle?.replace("_", "-")]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {u.bio && <p className="mt-1 text-sm text-ink-50">{u.bio}</p>}
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl bg-indigo p-5 text-white">
          <p className="eyebrow text-indigo-soft">Padel level</p>
          <p className="serif-num text-4xl text-white">{u.level?.toFixed(1) ?? "—"}</p>
          <p className="text-xs text-indigo-soft/80">
            {u.levelAssessedAt ? `Assessed ${formatDate(u.levelAssessedAt.slice(0, 10))}` : "Not yet assessed"} · set by the coach on level day, fixed until the next one.
          </p>
          {d.history.length > 1 && (
            <p className="mt-2 text-xs text-indigo-soft/80">History: {d.history.map((h) => h.level.toFixed(1)).join(" ← ")}</p>
          )}
        </div>
        <div className="card border-pink-soft bg-pink-soft/40 p-5">
          <p className="eyebrow text-pink">Club status</p>
          <p className="font-display text-2xl font-semibold text-ink">{sl.current.name}</p>
          <div className="progress mt-2 bg-bone-deep">
            <div style={{ width: `${Math.round(sl.progress * 100)}%` }} />
          </div>
          <p className="mt-1 text-xs text-ink-50">
            {u.socialPoints} points{sl.next ? ` · ${sl.next.min - u.socialPoints} more to ${sl.next.name}` : ""}
          </p>
        </div>
      </div>

      <section className="mt-6">
        <h2 className="mb-2 text-lg font-semibold">Badges</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Object.entries(BADGES).map(([key, b]) => {
            const has = d.badges.some((x) => x.key === key);
            return (
              <div key={key} className={`card p-3 text-center ${has ? "" : "opacity-40 grayscale"}`}>
                <p className="text-2xl">{b.icon}</p>
                <p className="mt-1 text-xs font-semibold text-ink">{b.name}</p>
                <p className="text-[11px] text-ink-50">{b.description}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-6 grid gap-4 sm:grid-cols-2">
        <div>
          <h2 className="mb-2 text-lg font-semibold">Recent sessions</h2>
          {d.played.length === 0 ? (
            <p className="text-sm text-ink-50">No sessions played yet.</p>
          ) : (
            <div className="card divide-y divide-line text-sm">
              {d.played.map((p, i) => (
                <div key={i} className="flex items-center justify-between p-3">
                  <span>
                    {formatDate(p.date)} · {p.title}
                  </span>
                  <StatusPill status={p.status} />
                </div>
              ))}
            </div>
          )}
        </div>
        <div>
          <h2 className="mb-2 text-lg font-semibold">Club points</h2>
          {d.ledger.length === 0 ? (
            <p className="text-sm text-ink-50">Show up to a session to earn your first points.</p>
          ) : (
            <div className="card divide-y divide-line text-sm">
              {d.ledger.map((l) => (
                <div key={l.id} className="flex items-center justify-between p-3">
                  <span>{l.reason}</span>
                  <span className={`font-display font-semibold ${l.points < 0 ? "text-red-700" : "text-ink"}`}>
                    {l.points > 0 ? "+" : ""}
                    {l.points}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="mt-6 space-y-3">
        <h2 className="text-lg font-semibold">Notifications</h2>
        <PushToggle vapidPublicKey={d.vapidPublicKey} />
      </section>

      <section className="mt-8 border-t border-line pt-4 text-sm text-ink-50">
        <p>
          Signed in as {u.email}.{" "}
          <Form method="post" action="/logout" className="inline">
            <button className="text-indigo underline">Sign out</button>
          </Form>
        </p>
      </section>
    </div>
  );
}
