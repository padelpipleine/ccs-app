import { Link } from "react-router";
import { and, eq } from "drizzle-orm";
import type { Route } from "./+types/home";
import { requireActiveMember } from "~/lib/auth.server";
import { getDb, schema } from "~/lib/db.server";
import { getSettings, num } from "~/lib/settings.server";
import { upcomingEvents, upcomingMatches } from "~/lib/queries.server";
import { weeklyUsage } from "~/lib/bookings.server";
import { socialLevel, todayIn, weekBounds, formatDate } from "~/lib/format";
import { MatchCard, EventCard } from "~/components/cards";
import { Alert, Empty } from "~/components/ui";
import { PushToggle } from "~/components/push-toggle";

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const user = await requireActiveMember(request, env);
  const db = getDb(env);
  const settings = await getSettings(db);
  const today = todayIn();
  const [matches, events, used, perks] = await Promise.all([
    upcomingMatches(db, user, settings, { limit: 30 }),
    upcomingEvents(db, user, { limit: 6 }),
    weeklyUsage(db, user.id, today),
    db.select().from(schema.perks).where(and(eq(schema.perks.active, true), eq(schema.perks.featured, true))).limit(3),
  ]);
  const mine = matches.filter((m) => m.myStatus);
  const bookable = matches.filter((m) => !m.myStatus && m.eligible && m.status === "open").slice(0, 3);
  return {
    user,
    mine,
    bookable,
    events: events.slice(0, 3),
    perks,
    allowance: num(settings, "weeklyAllowance"),
    used,
    week: weekBounds(today),
    welcome: settings.welcomeMessage,
    whatsappUrl: settings.whatsappUrl,
    vapidPublicKey: env.VAPID_PUBLIC_KEY ?? null,
  };
}

export default function Home({ loaderData: d }: Route.ComponentProps) {
  const first = d.user.name.split(" ")[0];
  const sl = socialLevel(d.user.socialPoints);
  return (
    <div className="space-y-8">
      <section className="card-ink relative overflow-hidden p-5 sm:p-7">
        <p className="eyebrow text-on-ink-muted">Hola {first}</p>
        <h1 className="mt-1 text-2xl font-semibold text-bone sm:text-3xl">
          {d.mine.length > 0 ? "You're on court soon." : "Padel is better with people."}
        </h1>
        <p className="mt-2 max-w-md text-sm text-on-ink-muted">{d.mine.length > 0 ? `${d.mine[0]!.title} · ${formatDate(d.mine[0]!.date)} at ${d.mine[0]!.startTime}` : d.welcome}</p>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-white/5 p-3">
            <p className="eyebrow text-on-ink-muted">This week</p>
            <p className="serif-num text-2xl text-bone">
              {d.used}/{d.allowance}
            </p>
            <p className="text-[11px] text-on-ink-muted">hosted session{d.allowance === 1 ? "" : "s"} used</p>
          </div>
          <div className="rounded-xl border border-indigo/60 bg-indigo/25 p-3">
            <p className="eyebrow text-indigo-soft">Padel level</p>
            <p className="serif-num text-2xl text-bone">{d.user.level?.toFixed(1) ?? "—"}</p>
            <p className="text-[11px] text-on-ink-muted">set by the coach</p>
          </div>
          <div className="col-span-2 rounded-xl border border-pink/40 bg-pink/10 p-3 sm:col-span-1">
            <p className="eyebrow text-pink">Club status</p>
            <p className="font-display text-lg font-semibold text-bone">{sl.current.name}</p>
            <div className="progress mt-1">
              <div style={{ width: `${Math.round(sl.progress * 100)}%` }} />
            </div>
            <p className="mt-1 text-[11px] text-on-ink-muted">
              {d.user.socialPoints} pts{sl.next ? ` · ${sl.next.min - d.user.socialPoints} to ${sl.next.name}` : " · top tier"}
            </p>
          </div>
        </div>
      </section>

      {d.user.status === "pending" && (
        <Alert kind="warn">
          <strong>Your membership is pending.</strong> The club will approve you and set your padel level shortly. You can browse everything in the meantime.
        </Alert>
      )}
      {d.user.status === "active" && d.user.level == null && (
        <Alert kind="info">Your padel level hasn't been assessed yet. The club will set it at the next level day, after which you can book sessions.</Alert>
      )}

      <PushToggle vapidPublicKey={d.vapidPublicKey} />

      {d.mine.length > 0 && (
        <section>
          <SectionHead title="Your sessions" to="/matches" />
          <div className="grid gap-3 sm:grid-cols-2">
            {d.mine.map((m) => (
              <MatchCard key={m.id} m={m} />
            ))}
          </div>
        </section>
      )}

      <section>
        <SectionHead title="Book a session" to="/matches" />
        {d.bookable.length === 0 ? (
          <Empty title="Nothing to book right now" body="New sessions are added weekly. You'll get a notification when they open." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {d.bookable.map((m) => (
              <MatchCard key={m.id} m={m} />
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionHead title="Events" to="/events" />
        {d.events.length === 0 ? (
          <Empty title="No events on the calendar yet" body="Socials, parties, retreats and more will show up here." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            {d.events.map((e) => (
              <EventCard key={e.id} e={e} />
            ))}
          </div>
        )}
      </section>

      {d.perks.length > 0 && (
        <section>
          <SectionHead title="Partner perks" to="/perks" />
          <div className="grid gap-3 sm:grid-cols-3">
            {d.perks.map((p) => (
              <Link key={p.id} to="/perks" className="card p-4">
                <p className="eyebrow">{p.category}</p>
                <p className="mt-1 font-display font-semibold text-ink">{p.sponsorName}</p>
                <p className="text-sm text-indigo">{p.title}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {d.whatsappUrl && (
        <a href={d.whatsappUrl} className="card flex items-center justify-between p-4" target="_blank" rel="noreferrer">
          <span className="font-display font-semibold text-ink">Members' WhatsApp group</span>
          <span className="text-sm text-indigo">Open →</span>
        </a>
      )}
    </div>
  );
}

function SectionHead({ title, to }: { title: string; to: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between">
      <h2 className="text-lg font-semibold">{title}</h2>
      <Link to={to} className="text-sm font-medium text-indigo">
        See all
      </Link>
    </div>
  );
}
