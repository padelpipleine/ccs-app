import { desc, eq, sql } from "drizzle-orm";
import { Link, useSearchParams } from "react-router";
import type { Route } from "./+types/matches";
import { requireAdmin } from "~/lib/auth.server";
import { getDb, schema } from "~/lib/db.server";
import { GroupPill, PageHeader, StatusPill } from "~/components/ui";
import { formatDate, todayIn } from "~/lib/format";

export const meta: Route.MetaFunction = () => [{ title: "Sessions · Admin" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  await requireAdmin(request, env);
  const rows = await getDb(env)
    .select({
      m: schema.matchDays,
      venueName: schema.venues.name,
      booked: sql<number>`(select count(*) from bookings b where b.match_day_id = ${schema.matchDays.id} and b.status in ('booked','invited','attended'))`,
      waitlist: sql<number>`(select count(*) from bookings b where b.match_day_id = ${schema.matchDays.id} and b.status = 'waitlist')`,
      owed: sql<number>`(select count(*) from bookings b where b.match_day_id = ${schema.matchDays.id} and b.payment_status = 'pending' and b.status in ('booked','attended'))`,
    })
    .from(schema.matchDays)
    .leftJoin(schema.venues, eq(schema.venues.id, schema.matchDays.venueId))
    .orderBy(desc(schema.matchDays.date), desc(schema.matchDays.startTime))
    .limit(200);
  return { rows, today: todayIn() };
}

export default function AdminMatches({ loaderData: d }: Route.ComponentProps) {
  const [params] = useSearchParams();
  const f = params.get("f") ?? "upcoming";
  const list = d.rows.filter(({ m }) => (f === "upcoming" ? m.date >= d.today : f === "past" ? m.date < d.today : true));
  if (f === "upcoming") list.reverse();
  return (
    <div>
      <PageHeader
        eyebrow="Admin"
        title="Sessions"
        action={
          <Link to="/admin/matches/new" className="btn btn-primary btn-sm">
            + New session
          </Link>
        }
      />
      <div className="mb-4 flex gap-2">
        {[
          ["upcoming", "Upcoming"],
          ["past", "Past"],
          ["all", "All"],
        ].map(([k, label]) => (
          <Link key={k} to={`/admin/matches?f=${k}`} className={`pill ${f === k ? "pill-ink" : "pill-outline"}`}>
            {label}
          </Link>
        ))}
      </div>
      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>When</th>
              <th>Session</th>
              <th>Group</th>
              <th>Players</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center text-ink-50">
                  Nothing here.
                </td>
              </tr>
            )}
            {list.map(({ m, venueName, booked, waitlist, owed }) => (
              <tr key={m.id}>
                <td className="whitespace-nowrap text-xs">
                  {formatDate(m.date)}
                  <br />
                  {m.startTime}–{m.endTime}
                </td>
                <td>
                  <Link to={`/admin/matches/${m.id}`} className="font-medium text-ink">
                    {m.title}
                  </Link>
                  <span className="block text-xs text-ink-50">{venueName ?? "No venue"}</span>
                </td>
                <td>
                  <GroupPill group={m.group} />
                </td>
                <td className="whitespace-nowrap text-xs">
                  {booked}/{m.courts * 4}
                  {Number(waitlist) > 0 && <span className="text-ink-50"> · {waitlist} waiting</span>}
                  {Number(owed) > 0 && <span className="text-red-700"> · {owed} unpaid</span>}
                </td>
                <td>
                  <StatusPill status={m.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
