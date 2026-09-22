import { Form, Link, redirect, useNavigation } from "react-router";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Route } from "./+types/event";
import { requireActiveMember } from "~/lib/auth.server";
import { getDb, newId, schema } from "~/lib/db.server";
import { getSettings } from "~/lib/settings.server";
import { formatDateLong, formatMoney } from "~/lib/format";
import { Alert, Avatar, BackLink, GroupPill, StatusPill } from "~/components/ui";
import { Icons } from "~/components/icons";
import { notifyUsers } from "~/lib/push.server";
import { groupEligible } from "~/lib/bookings.server";

export const meta: Route.MetaFunction = ({ data }) => [{ title: `${data?.event.title ?? "Event"} · Crosscourt Social` }];

async function load(env: Env, id: string, userId: string) {
  const db = getDb(env);
  const event = await db.select().from(schema.events).where(eq(schema.events.id, id)).get();
  if (!event) throw new Response("Not found", { status: 404 });
  const regs = await db
    .select({ reg: schema.eventRegistrations, user: schema.users })
    .from(schema.eventRegistrations)
    .innerJoin(schema.users, eq(schema.users.id, schema.eventRegistrations.userId))
    .where(eq(schema.eventRegistrations.eventId, id))
    .orderBy(schema.eventRegistrations.createdAt);
  const going = regs.filter((r) => ["registered", "attended"].includes(r.reg.status));
  const headcount = going.reduce((n, r) => n + 1 + r.reg.guests, 0);
  const mine = regs.find((r) => r.user.id === userId && ["registered", "waitlist"].includes(r.reg.status)) ?? null;
  return { db, event, going, headcount, mine };
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const user = await requireActiveMember(request, env);
  const { db, event, going, headcount, mine } = await load(env, params.id, user.id);
  if (!groupEligible(user, event.group)) throw redirect("/events");
  const settings = await getSettings(db);
  return {
    event,
    going: going.map((r) => ({ id: r.user.id, name: r.user.name, avatarUrl: r.user.avatarUrl, guests: r.reg.guests })),
    headcount,
    mine: mine?.reg ?? null,
    spotsLeft: event.capacity != null ? event.capacity - headcount : null,
    canJoin: user.status === "active" && event.status === "open",
    paymentInstructions: settings.paymentInstructions,
  };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const user = await requireActiveMember(request, env);
  const { db, event, headcount, mine } = await load(env, params.id, user.id);
  if (!groupEligible(user, event.group)) throw redirect("/events");
  const form = await request.formData();
  const intent = String(form.get("intent"));

  if (intent === "register") {
    if (user.status !== "active") return { error: "Your membership is pending approval." };
    if (event.status !== "open") return { error: "Registration is closed." };
    if (mine) return { error: "You're already registered." };
    const guests = event.allowGuests ? Math.max(0, Math.min(5, Number(form.get("guests") ?? 0) || 0)) : 0;
    const seats = 1 + guests;
    const waitlist = event.capacity != null && headcount + seats > event.capacity;
    const price = event.priceCents + guests * (event.guestPriceCents ?? event.priceCents);
    const id = newId("er");
    await db.insert(schema.eventRegistrations).values({
      id,
      eventId: event.id,
      userId: user.id,
      guests,
      status: waitlist ? "waitlist" : "registered",
      paymentStatus: waitlist ? "free" : price > 0 ? "pending" : "free",
      priceCents: waitlist ? 0 : price,
    });
    if (!waitlist && price > 0) throw redirect(`/pay/event/${id}`);
    return { success: waitlist ? "The event is full — you're on the waitlist." : "You're in! See you there." };
  }
  if (intent === "cancel" && mine) {
    await db.update(schema.eventRegistrations).set({ status: "cancelled" }).where(eq(schema.eventRegistrations.id, mine.reg.id));
    // Promote waitlist if capacity allows
    if (event.capacity != null) {
      const waiting = await db
        .select()
        .from(schema.eventRegistrations)
        .where(and(eq(schema.eventRegistrations.eventId, event.id), eq(schema.eventRegistrations.status, "waitlist")))
        .orderBy(schema.eventRegistrations.createdAt);
      let free = event.capacity - (headcount - 1 - mine.reg.guests);
      for (const w of waiting) {
        if (1 + w.guests > free) break;
        const price = event.priceCents + w.guests * (event.guestPriceCents ?? event.priceCents);
        await db
          .update(schema.eventRegistrations)
          .set({ status: "registered", paymentStatus: price > 0 ? "pending" : "free", priceCents: price })
          .where(eq(schema.eventRegistrations.id, w.id));
        await notifyUsers(env, [w.userId], { title: "A spot opened up!", body: `You're now registered for ${event.title}.${price ? " Please complete payment." : ""}`, url: `/events/${event.id}`, kind: "event" });
        free -= 1 + w.guests;
      }
    }
    return { success: "Registration cancelled." };
  }
  return { error: "Unknown action." };
}

export default function EventPage({ loaderData: d, actionData }: Route.ComponentProps) {
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  const e = d.event;
  return (
    <div className="mx-auto max-w-2xl">
      <BackLink to="/events">Events</BackLink>
      {e.imageUrl && <img src={e.imageUrl} alt="" className="mb-4 h-56 w-full rounded-2xl object-cover" />}
      <div className="card-ink p-5 sm:p-7">
        <div className="flex flex-wrap gap-2">
          <span className="pill pill-bone">{e.category}</span>
          <GroupPill group={e.group} />
          {e.status !== "open" && <StatusPill status={e.status} />}
        </div>
        <h1 className="mt-3 text-2xl font-semibold text-bone sm:text-3xl">{e.title}</h1>
        <div className="mt-4 space-y-2 text-sm text-bone">
          <p className="flex items-center gap-2">
            <Icons.calendar className="h-4 w-4 text-on-ink-muted" /> {formatDateLong(e.date)}
          </p>
          <p className="flex items-center gap-2">
            <Icons.clock className="h-4 w-4 text-on-ink-muted" /> {e.startTime}
            {e.endTime ? ` – ${e.endTime}` : ""}
          </p>
          {e.location && (
            <p className="flex items-center gap-2">
              <Icons.pin className="h-4 w-4 text-on-ink-muted" /> {e.location}
              {e.mapUrl && (
                <a href={e.mapUrl} className="text-teal underline" target="_blank" rel="noreferrer">
                  Map
                </a>
              )}
            </p>
          )}
          <p className="flex items-center gap-2">
            <Icons.euro className="h-4 w-4 text-on-ink-muted" /> {e.priceCents ? `${formatMoney(e.priceCents)} per member` : "Free for members"}
            {e.allowGuests && e.guestPriceCents != null ? ` · guests ${formatMoney(e.guestPriceCents)}` : ""}
          </p>
        </div>
      </div>

      {e.description && <div className="card mt-4 whitespace-pre-line p-5 text-sm text-ink-70">{e.description}</div>}

      <div className="mt-4 space-y-3">
        {actionData?.error && <Alert kind="error">{actionData.error}</Alert>}
        {actionData?.success && <Alert kind="success">{actionData.success}</Alert>}
        {d.mine ? (
          <div className="card p-5">
            <p className="eyebrow">Your registration</p>
            <p className="mt-1 flex flex-wrap items-center gap-2">
              <StatusPill status={d.mine.status} />
              {d.mine.priceCents > 0 && <StatusPill status={d.mine.paymentStatus} />}
              {d.mine.guests > 0 && <span className="text-sm text-ink-70">+{d.mine.guests} guest{d.mine.guests > 1 ? "s" : ""}</span>}
            </p>
            {d.mine.paymentStatus === "pending" && (
              <Alert kind="warn">
                Ticket {formatMoney(d.mine.priceCents)} —{" "}
                <Link to={`/pay/event/${d.mine.id}`} className="font-semibold underline">
                  complete payment
                </Link>
              </Alert>
            )}
            <Form method="post" className="mt-4" onSubmit={(ev) => !confirm("Cancel your registration?") && ev.preventDefault()}>
              <button name="intent" value="cancel" className="btn btn-danger" disabled={busy}>
                Cancel registration
              </button>
            </Form>
          </div>
        ) : d.canJoin ? (
          <Form method="post" className="card space-y-4 p-5">
            <div>
              <p className="eyebrow">Count me in</p>
              <p className="mt-1 text-sm text-ink-70">
                {d.spotsLeft == null ? "Open to all members." : d.spotsLeft > 0 ? `${d.spotsLeft} spots left.` : "Full — join the waitlist."}
              </p>
            </div>
            {e.allowGuests && (
              <label className="block">
                <span className="label">Bringing guests?</span>
                <select name="guests" className="select" defaultValue="0">
                  {[0, 1, 2, 3].map((n) => (
                    <option key={n} value={n}>
                      {n === 0 ? "Just me" : `+${n} guest${n > 1 ? "s" : ""}`}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button name="intent" value="register" className="btn btn-ink w-full" disabled={busy}>
              {busy ? "…" : e.priceCents ? `Get ticket · ${formatMoney(e.priceCents)}` : "I'm going"}
            </button>
          </Form>
        ) : (
          <Alert kind="info">{e.status !== "open" ? `This event is ${e.status}.` : "This event isn't open to your membership group."}</Alert>
        )}
      </div>

      <section className="mt-6">
        <h2 className="mb-3 text-lg font-semibold">Who's going · {d.headcount}</h2>
        {d.going.length === 0 ? (
          <p className="text-sm text-ink-50">Be the first.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {d.going.map((p) => (
              <div key={p.id} className="card flex items-center gap-2 py-1.5 pl-1.5 pr-3">
                <Avatar name={p.name} url={p.avatarUrl} size={28} />
                <span className="text-sm">
                  {p.name}
                  {p.guests ? ` +${p.guests}` : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
