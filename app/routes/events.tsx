import type { Route } from "./+types/events";
import { requireActiveMember } from "~/lib/auth.server";
import { getDb } from "~/lib/db.server";
import { upcomingEvents } from "~/lib/queries.server";
import { EventCard } from "~/components/cards";
import { Empty, PageHeader } from "~/components/ui";

export const meta: Route.MetaFunction = () => [{ title: "Events · Crosscourt Social" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const user = await requireActiveMember(request, env);
  return { events: await upcomingEvents(getDb(env), user) };
}

export default function Events({ loaderData }: Route.ComponentProps) {
  return (
    <div>
      <PageHeader eyebrow="Off court" title="Events" subtitle="Socials, parties, retreats and more. Members first, at member rates." />
      {loaderData.events.length === 0 ? (
        <Empty title="Nothing scheduled yet" body="Events are announced here and by notification." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {loaderData.events.map((e) => (
            <EventCard key={e.id} e={e} />
          ))}
        </div>
      )}
    </div>
  );
}
