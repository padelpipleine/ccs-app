import { Link } from "react-router";
import type { Route } from "./+types/leaderboard";
import { requireActiveMember } from "~/lib/auth.server";
import { getDb } from "~/lib/db.server";
import { badgesForUsers, leaderboard, recentBadges } from "~/lib/points.server";
import { getSettings, num } from "~/lib/settings.server";
import { Avatar, PageHeader } from "~/components/ui";
import { BADGES, formatDateTime, SOCIAL_LEVELS, socialLevel } from "~/lib/format";

export const meta: Route.MetaFunction = () => [{ title: "Club ranking · Crosscourt Social" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const me = await requireActiveMember(request, env);
  const db = getDb(env);
  const s = await getSettings(db);
  const rows = await leaderboard(db, 50);
  const [badges, recent] = await Promise.all([badgesForUsers(db, rows.map((r) => r.id)), recentBadges(db, 6)]);
  return {
    rows: rows.map((r) => ({ ...r, badges: badges.get(r.id) ?? [] })),
    recent,
    meId: me.id,
    pts: { attend: num(s, "pointsAttend"), event: num(s, "pointsEvent"), partner: num(s, "pointsPartner") },
  };
}

export default function Leaderboard({ loaderData: d }: Route.ComponentProps) {
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader eyebrow="Club status" title="Club ranking" subtitle="Club points for showing up, on and off court. Nothing to do with your padel level, which only the coach sets." />
      <div className="card-bone mb-4 grid grid-cols-3 gap-2 p-4 text-center text-xs text-ink-70">
        <div>
          <p className="serif-num text-2xl text-ink">+{d.pts.attend}</p>play a session
        </div>
        <div>
          <p className="serif-num text-2xl text-ink">+{d.pts.event}</p>attend an event
        </div>
        <div>
          <p className="serif-num text-2xl text-ink">+{d.pts.partner}</p>bring a partner
        </div>
      </div>

      {d.recent.length > 0 && (
        <section className="mb-4">
          <p className="eyebrow mb-2">Recently unlocked</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {d.recent.map((r) => {
              const b = BADGES[r.key];
              if (!b) return null;
              return (
                <div key={r.id} className="card flex shrink-0 items-center gap-2 py-2 pl-2 pr-3">
                  <span className="text-xl" aria-hidden>
                    {b.icon}
                  </span>
                  <div className="leading-tight">
                    <p className="text-xs font-semibold text-ink">
                      {r.name.split(" ")[0]} · {b.name}
                    </p>
                    <p className="text-[11px] text-ink-50">{formatDateTime(r.awardedAt)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <div className="card divide-y divide-line">
        {d.rows.map((r, i) => (
          <div key={r.id} className={`flex items-center gap-3 p-3 ${r.id === d.meId ? "bg-indigo-soft" : ""}`}>
            <span className="serif-num w-6 text-center text-lg text-ink-50">{i + 1}</span>
            <Avatar name={r.name} url={r.avatarUrl} size={36} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">{r.name}</p>
              <p className="flex items-center gap-1.5 text-xs text-ink-50">
                <span>{socialLevel(r.socialPoints).current.name}</span>
                {r.badges.length > 0 && (
                  <span className="flex items-center gap-0.5" aria-label={`${r.badges.length} badges`}>
                    {r.badges.slice(-4).map((k) => (
                      <span key={k} title={`${BADGES[k]?.name ?? k}: ${BADGES[k]?.description ?? ""}`} className="cursor-help text-sm leading-none" aria-hidden>
                        {BADGES[k]?.icon ?? "🏅"}
                      </span>
                    ))}
                    {r.badges.length > 4 && <span className="text-[11px]">+{r.badges.length - 4}</span>}
                  </span>
                )}
              </p>
            </div>
            <span className="font-display font-semibold text-ink">{r.socialPoints}</span>
          </div>
        ))}
      </div>

      <p className="eyebrow mb-2 mt-6">Club status tiers</p>
      <div className="flex flex-wrap gap-2">
        {SOCIAL_LEVELS.map((l) => (
          <span key={l.name} className="pill pill-pink">
            {l.name} · {l.min}+
          </span>
        ))}
      </div>
      <p className="mt-6 text-xs text-ink-50">
        Badges are unlocked by playing, showing up to events, bringing partners and attending level day.{" "}
        <Link to="/profile" className="text-indigo">
          See all badges on your profile
        </Link>
        .
      </p>
    </div>
  );
}
