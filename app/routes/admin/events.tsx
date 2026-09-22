import { desc, sql } from "drizzle-orm";
import { Link, useSearchParams } from "react-router";
import type { Route } from "./+types/events";
import { requireAdmin } from "~/lib/auth.server";
import { getDb, schema } from "~/lib/db.server";
import { GroupPill, PageHeader, StatusPill } from "~/components/ui";
import { formatDate, formatMoney, todayIn } from "~/lib/format";

export const meta: Route.MetaFunction = () => [{ title: "Events · Admin" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  await requireAdmin(request, env);
  const rows = await getDb(env)
    .select({
      e: schema.events,
      going: sql<number>`(select coalesce(sum(1 + guests),0) from event_registrations r where r.event_id = ${schema.events.id} and r.status in ('registered','attended'))`,
      owed: sql<number>`(select count(*) from event_registrations r where r.event_id = ${schema.events.id} and r.payment_status = 'pending' and r.status = 'registered')`,
    })
    .from(schema.events)
    .orderBy(desc(schema.events.date))
    .limit(200);
  return { rows, today: todayIn() };
}

export default function AdminEvents({ loaderData: d }: Route.ComponentProps) {
  const [params] = useSearchParams();
  const f = params.get("f") ?? "upcoming";
  const list = d.rows.filter(({ e }) => (f === "upcoming" ? e.date >= d.today : f === "past" ? e.date < d.today : true));
  if (f === "upcoming") list.reverse();
  return (
    <div>
      <PageHeader
        eyebrow="Admin"
        title="Events"
        action={
          <Link to="/admin/events/new" className="btn btn-primary btn-sm">
            + New event
          </Link>
        }
      />
      <div className="mb-4 flex gap-2">
        {[
          ["upcoming", "Upcoming"],
          ["past", "Past"],
          ["all", "All"],
        ].map(([k, label]) => (
          <Link key={k} to={`/admin/events?f=${k}`} className={`pill ${f === k ? "pill-ink" : "pill-outline"}`}>
            {label}
          </Link>
        ))}
      </div>
      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>When</th>
              <th>Event</th>
              <th>Who</th>
              <th>Price</th>
              <th>Going</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-ink-50">
                  Nothing here.
                </td>
              </tr>
            )}
            {list.map(({ e, going, owed }) => (
              <tr key={e.id}>
                <td className="whitespace-nowrap text-xs">
                  {formatDate(e.date)}
                  <br />
                  {e.startTime}
                </td>
                <td>
                  <Link to={`/admin/events/${e.id}`} className="font-medium text-ink">
                    {e.title}
                  </Link>
                  <span className="block text-xs text-ink-50">{e.location}</span>
                </td>
                <td>
                  <GroupPill group={e.group} />
                </td>
                <td className="text-xs">{e.priceCents ? formatMoney(e.priceCents) : "Free"}</td>
                <td className="whitespace-nowrap text-xs">
                  {going}
                  {e.capacity ? `/${e.capacity}` : ""}
                  {Number(owed) > 0 && <span className="text-red-700"> · {owed} unpaid</span>}
                </td>
                <td>
                  <StatusPill status={e.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
