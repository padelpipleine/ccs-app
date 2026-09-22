import type { Route } from "./+types/leaderboard";
import { requireActiveMember } from "~/lib/auth.server";
import { getDb } from "~/lib/db.server";
import { leaderboard } from "~/lib/points.server";
import { getSettings, num } from "~/lib/settings.server";
import { Avatar, PageHeader } from "~/components/ui";
import { SOCIAL_LEVELS, socialLevel } from "~/lib/format";

export const meta: Route.MetaFunction = () => [{ title: "Club ranking · Crosscourt Social" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const me = await requireActiveMember(request, env);
  const db = getDb(env);
  const s = await getSettings(db);
  return { rows: await leaderboard(db, 50), meId: me.id, pts: { attend: num(s, "pointsAttend"), event: num(s, "pointsEvent"), partner: num(s, "pointsPartner") } };
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
      <div className="card divide-y divide-line">
        {d.rows.map((r, i) => (
          <div key={r.id} className={`flex items-center gap-3 p-3 ${r.id === d.meId ? "bg-indigo-soft" : ""}`}>
            <span className="serif-num w-6 text-center text-lg text-ink-50">{i + 1}</span>
            <Avatar name={r.name} url={r.avatarUrl} size={36} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">{r.name}</p>
              <p className="text-xs text-ink-50">{socialLevel(r.socialPoints).current.name}</p>
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
    </div>
  );
}
