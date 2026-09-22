import { eq } from "drizzle-orm";
import { Form, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/event-form";
import { requireAdmin } from "~/lib/auth.server";
import { getDb, newId, schema } from "~/lib/db.server";
import { audienceUserIds, notifyUsers } from "~/lib/push.server";
import { Alert, BackLink, Field, PageHeader } from "~/components/ui";
import { EVENT_CATEGORIES, formatDate } from "~/lib/format";
import { dateRe, timeRe } from "~/lib/validate";

export const meta: Route.MetaFunction = () => [{ title: "Event · Admin" }];

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  await requireAdmin(request, env);
  const event = params.id ? await getDb(env).select().from(schema.events).where(eq(schema.events.id, params.id)).get() : null;
  if (params.id && !event) throw new Response("Not found", { status: 404 });
  return { event };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  await requireAdmin(request, env);
  const db = getDb(env);
  const f = await request.formData();
  const s = (k: string) => String(f.get(k) ?? "").trim();
  if (!s("title")) return { error: "Give the event a title." };
  if (!dateRe.test(s("date"))) return { error: "Pick a date." };
  if (!timeRe.test(s("startTime"))) return { error: "Start time must be HH:MM." };
  const group = s("group");
  const values = {
    title: s("title"),
    description: s("description") || null,
    category: s("category") || "social",
    location: s("location") || null,
    mapUrl: s("mapUrl") || null,
    imageUrl: s("imageUrl") || null,
    date: s("date"),
    startTime: s("startTime"),
    endTime: timeRe.test(s("endTime")) ? s("endTime") : null,
    group: (group === "female" || group === "mixed" ? group : "all") as "all" | "female" | "mixed",
    priceCents: Math.round((Number(s("price")) || 0) * 100),
    guestPriceCents: s("guestPrice") ? Math.round(Number(s("guestPrice")) * 100) : null,
    capacity: s("capacity") ? Math.max(1, Number(s("capacity"))) : null,
    allowGuests: f.get("allowGuests") === "on",
    status: (["draft", "open", "cancelled", "completed"].includes(s("status")) ? s("status") : "open") as "draft" | "open" | "cancelled" | "completed",
  };
  let id = params.id;
  if (id) await db.update(schema.events).set(values).where(eq(schema.events.id, id));
  else {
    id = newId("ev");
    await db.insert(schema.events).values({ id, ...values });
  }
  if (f.get("notify") === "on" && values.status === "open") {
    const ids = await audienceUserIds(env, values.group);
    await notifyUsers(env, ids, {
      title: `New event: ${values.title}`,
      body: `${formatDate(values.date)} · ${values.startTime}${values.location ? ` · ${values.location}` : ""}. ${values.priceCents ? "Tickets available now." : "Free for members."}`,
      url: `/events/${id}`,
      kind: "event",
    });
  }
  throw redirect(`/admin/events/${id}`);
}

export default function EventForm({ loaderData: d, actionData }: Route.ComponentProps) {
  const nav = useNavigation();
  const e = d.event;
  return (
    <div className="mx-auto max-w-2xl">
      <BackLink to={e ? `/admin/events/${e.id}` : "/admin/events"}>{e ? "Event" : "Events"}</BackLink>
      <PageHeader title={e ? "Edit event" : "New event"} />
      <Form method="post" className="card space-y-4 p-5">
        <Field label="Title">
          <input name="title" required defaultValue={e?.title ?? ""} className="input" placeholder="Summer pool party" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category">
            <select name="category" defaultValue={e?.category ?? "social"} className="select">
              {EVENT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Who's invited">
            <select name="group" defaultValue={e?.group ?? "all"} className="select">
              <option value="all">All members</option>
              <option value="mixed">Mixed group</option>
              <option value="female">Ladies</option>
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Date">
            <input name="date" type="date" required defaultValue={e?.date ?? ""} className="input" />
          </Field>
          <Field label="Start">
            <input name="startTime" type="time" required defaultValue={e?.startTime ?? "20:00"} className="input" />
          </Field>
          <Field label="End (optional)">
            <input name="endTime" type="time" defaultValue={e?.endTime ?? ""} className="input" />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Location">
            <input name="location" defaultValue={e?.location ?? ""} className="input" placeholder="Hotel rooftop, Palma" />
          </Field>
          <Field label="Map link">
            <input name="mapUrl" type="url" defaultValue={e?.mapUrl ?? ""} className="input" />
          </Field>
        </div>
        <Field label="Image URL" hint="Optional cover image (link to a hosted image).">
          <input name="imageUrl" type="url" defaultValue={e?.imageUrl ?? ""} className="input" />
        </Field>
        <Field label="Description">
          <textarea name="description" rows={4} defaultValue={e?.description ?? ""} className="textarea" placeholder="Dress code, what's included, timings…" />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Member price (€)" hint="0 = free">
            <input name="price" type="number" step="0.5" min={0} defaultValue={e ? e.priceCents / 100 : 0} className="input" />
          </Field>
          <Field label="Guest price (€)">
            <input name="guestPrice" type="number" step="0.5" min={0} defaultValue={e?.guestPriceCents != null ? e.guestPriceCents / 100 : ""} className="input" />
          </Field>
          <Field label="Capacity" hint="Blank = unlimited">
            <input name="capacity" type="number" min={1} defaultValue={e?.capacity ?? ""} className="input" />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="allowGuests" defaultChecked={e?.allowGuests ?? false} className="h-4 w-4 accent-indigo" />
          Members can bring guests (+1s)
        </label>
        <Field label="Status">
          <select name="status" defaultValue={e?.status ?? "open"} className="select">
            <option value="open">Open</option>
            <option value="draft">Draft (hidden)</option>
            <option value="cancelled">Cancelled</option>
            <option value="completed">Completed</option>
          </select>
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="notify" className="h-4 w-4 accent-indigo" defaultChecked={!e} />
          Notify invited members
        </label>
        {actionData?.error && <Alert kind="error">{actionData.error}</Alert>}
        <button className="btn btn-ink w-full" disabled={nav.state !== "idle"}>
          {e ? "Save changes" : "Create event"}
        </button>
      </Form>
    </div>
  );
}
