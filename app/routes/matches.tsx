import type { Route } from "./+types/matches";
import { requireActiveMember } from "~/lib/auth.server";
import { getDb } from "~/lib/db.server";
import { getSettings } from "~/lib/settings.server";
import { upcomingMatches } from "~/lib/queries.server";
import { MatchCard } from "~/components/cards";
import { Empty, PageHeader } from "~/components/ui";
import { Link, useSearchParams } from "react-router";

export const meta: Route.MetaFunction = () => [{ title: "Sessions · Crosscourt Social" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const user = await requireActiveMember(request, env);
  const db = getDb(env);
  const settings = await getSettings(db);
  const matches = await upcomingMatches(db, user, settings);
  return { matches, memberType: user.memberType, gender: user.gender };
}

export default function Matches({ loaderData }: Route.ComponentProps) {
  const [params] = useSearchParams();
  const filter = params.get("f") ?? "all";
  const list = loaderData.matches.filter((m) => {
    if (filter === "mine") return Boolean(m.myStatus);
    if (filter === "mixed") return m.group === "mixed";
    if (filter === "female") return m.group === "female";
    if (filter === "eligible") return m.eligible && !m.myStatus;
    return true;
  });
  const tabs = [
    ["all", "All"],
    ["eligible", "For me"],
    ["mine", "Booked"],
    ["mixed", "Mixed"],
    ["female", "Ladies"],
  ];
  return (
    <div>
      <PageHeader eyebrow="Hosted sessions" title="Play" subtitle="One hosted session a week is included in your membership. Extras are €25." />
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {tabs.map(([k, label]) => (
          <Link key={k} to={k === "all" ? "/matches" : `/matches?f=${k}`} className={`pill ${filter === k ? "pill-ink" : "pill-outline"}`}>
            {label}
          </Link>
        ))}
      </div>
      {list.length === 0 ? (
        <Empty title="No sessions here" body={filter === "mine" ? "You haven't booked anything yet." : "New sessions are added every week."} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {list.map((m) => (
            <MatchCard key={m.id} m={m} />
          ))}
        </div>
      )}
    </div>
  );
}
