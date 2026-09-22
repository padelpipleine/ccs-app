import { and, eq } from "drizzle-orm";
import { Link, useSearchParams } from "react-router";
import type { Route } from "./+types/members";
import { requireActiveMember } from "~/lib/auth.server";
import { getDb, schema } from "~/lib/db.server";
import { Avatar, Empty, GroupPill, LevelPill, PageHeader } from "~/components/ui";
import { levelBand } from "~/lib/format";

export const meta: Route.MetaFunction = () => [{ title: "Members · Crosscourt Social" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const me = await requireActiveMember(request, env);
  const rows = await getDb(env)
    .select({
      id: schema.users.id,
      name: schema.users.name,
      avatarUrl: schema.users.avatarUrl,
      level: schema.users.level,
      memberType: schema.users.memberType,
      gender: schema.users.gender,
      handedness: schema.users.handedness,
      preferredSide: schema.users.preferredSide,
      playStyle: schema.users.playStyle,
      bio: schema.users.bio,
      instagram: schema.users.instagram,
      socialPoints: schema.users.socialPoints,
    })
    .from(schema.users)
    .where(and(eq(schema.users.status, "active"), eq(schema.users.showInDirectory, true)))
    .orderBy(schema.users.name);
  return { members: rows, myLevel: me.level };
}

export default function Members({ loaderData: d }: Route.ComponentProps) {
  const [params] = useSearchParams();
  const q = (params.get("q") ?? "").toLowerCase();
  const f = params.get("f") ?? "all";
  const list = d.members.filter((m) => {
    if (q && !m.name.toLowerCase().includes(q)) return false;
    if (f === "mylevel") return d.myLevel != null && m.level != null && Math.abs(m.level - d.myLevel) <= 0.5;
    if (f === "female") return m.gender === "female";
    return true;
  });
  return (
    <div>
      <PageHeader eyebrow="The crew" title="Members" subtitle="Find a partner at your level." />
      <form className="mb-4 flex gap-2">
        <input name="q" defaultValue={q} placeholder="Search by name" className="input" />
        <input type="hidden" name="f" value={f} />
        <button className="btn btn-ghost">Search</button>
      </form>
      <div className="mb-4 flex gap-2">
        {[
          ["all", "Everyone"],
          ["mylevel", "My level"],
          ["female", "Ladies"],
        ].map(([k, label]) => (
          <Link key={k} to={`/members?f=${k}${q ? `&q=${q}` : ""}`} className={`pill ${f === k ? "pill-ink" : "pill-outline"}`}>
            {label}
          </Link>
        ))}
      </div>
      {list.length === 0 ? (
        <Empty title="No members match" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {list.map((m) => (
            <div key={m.id} className="card flex gap-3 p-4">
              <Avatar name={m.name} url={m.avatarUrl} size={48} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-display font-semibold text-ink">{m.name}</p>
                  <LevelPill level={m.level} />
                  <GroupPill group={m.memberType} />
                </div>
                <p className="mt-0.5 text-xs text-ink-50">
                  {[levelBand(m.level), m.handedness && `${m.handedness}-handed`, m.preferredSide && `${m.preferredSide} side`, m.playStyle?.replace("_", "-")]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {m.bio && <p className="mt-1 text-sm text-ink-70">{m.bio}</p>}
                {m.instagram && (
                  <a href={`https://instagram.com/${m.instagram.replace("@", "")}`} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-indigo">
                    {m.instagram.startsWith("@") ? m.instagram : `@${m.instagram}`}
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
