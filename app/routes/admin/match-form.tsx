import { eq } from "drizzle-orm";
import { Form, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/match-form";
import { requireAdmin } from "~/lib/auth.server";
import { getDb, newId, schema } from "~/lib/db.server";
import { audienceUserIds, notifyUsers } from "~/lib/push.server";
import { Alert, BackLink, Field, PageHeader } from "~/components/ui";
import { formatDate, levelOptions } from "~/lib/format";
import { dateRe, timeRe } from "~/lib/validate";

export const meta: Route.MetaFunction = () => [{ title: "Session · Admin" }];

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  await requireAdmin(request, env);
  const db = getDb(env);
  const venues = await db.select().from(schema.venues).where(eq(schema.venues.active, true)).orderBy(schema.venues.name);
  const match = params.id ? await db.select().from(schema.matchDays).where(eq(schema.matchDays.id, params.id)).get() : null;
  if (params.id && !match) throw new Response("Not found", { status: 404 });
  return { venues, match };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const admin = await requireAdmin(request, env);
  const db = getDb(env);
  const f = await request.formData();
  const s = (k: string) => String(f.get(k) ?? "").trim();
  const date = s("date");
  const startTime = s("startTime");
  const endTime = s("endTime");
  if (!s("title")) return { error: "Give the session a title." };
  if (!dateRe.test(date)) return { error: "Pick a date." };
  if (!timeRe.test(startTime) || !timeRe.test(endTime)) return { error: "Times must be HH:MM." };
  const levelMin = s("levelMin") ? Number(s("levelMin")) : null;
  const levelMax = s("levelMax") ? Number(s("levelMax")) : null;
  if (levelMin != null && levelMax != null && levelMin > levelMax) return { error: "Minimum level can't be above maximum." };
  const values = {
    title: s("title"),
    venueId: s("venueId") || null,
    date,
    startTime,
    endTime,
    group: (s("group") === "female" ? "female" : "mixed") as "female" | "mixed",
    levelMin,
    levelMax,
    courts: Math.max(1, Math.min(12, Number(s("courts")) || 1)),
    hosted: f.get("hosted") === "on",
    extraPriceCents: s("extraPrice") ? Math.round(Number(s("extraPrice")) * 100) : null,
    description: s("description") || null,
    socialAfter: s("socialAfter") || null,
    prize: s("prize") || null,
    status: (["draft", "open", "cancelled", "completed"].includes(s("status")) ? s("status") : "open") as "draft" | "open" | "cancelled" | "completed",
  };
  let id = params.id;
  if (id) {
    await db.update(schema.matchDays).set(values).where(eq(schema.matchDays.id, id));
  } else {
    id = newId("md");
    await db.insert(schema.matchDays).values({ id, ...values, createdBy: admin.id });
  }
  const repeat = Math.max(0, Math.min(12, Number(s("repeatWeeks")) || 0));
  if (!params.id && repeat > 0) {
    for (let i = 1; i <= repeat; i++) {
      const d = new Date(`${date}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() + 7 * i);
      await db.insert(schema.matchDays).values({ id: newId("md"), ...values, date: d.toISOString().slice(0, 10), createdBy: admin.id });
    }
  }
  if (f.get("notify") === "on" && values.status === "open") {
    const ids = await audienceUserIds(env, values.group);
    await notifyUsers(env, ids, {
      title: `New session: ${values.title}`,
      body: `${formatDate(date)} · ${startTime}. ${repeat ? `Plus ${repeat} more weekly. ` : ""}Book your spot.`,
      url: `/matches/${id}`,
      kind: "match",
    });
  }
  throw redirect(`/admin/matches/${id}`);
}

export default function MatchForm({ loaderData: d, actionData }: Route.ComponentProps) {
  const nav = useNavigation();
  const m = d.match;
  return (
    <div className="mx-auto max-w-2xl">
      <BackLink to={m ? `/admin/matches/${m.id}` : "/admin/matches"}>{m ? "Session" : "Sessions"}</BackLink>
      <PageHeader title={m ? "Edit session" : "New session"} />
      <Form method="post" className="card space-y-4 p-5">
        <Field label="Title">
          <input name="title" required defaultValue={m?.title ?? ""} className="input" placeholder="Thursday Ladies · Hosted" />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Date">
            <input name="date" type="date" required defaultValue={m?.date ?? ""} className="input" />
          </Field>
          <Field label="Start">
            <input name="startTime" type="time" required defaultValue={m?.startTime ?? "19:00"} className="input" />
          </Field>
          <Field label="End">
            <input name="endTime" type="time" required defaultValue={m?.endTime ?? "20:30"} className="input" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Venue">
            <select name="venueId" defaultValue={m?.venueId ?? ""} className="select">
              <option value="">To be confirmed</option>
              {d.venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Group">
            <select name="group" defaultValue={m?.group ?? "mixed"} className="select">
              <option value="mixed">Mixed</option>
              <option value="female">Ladies</option>
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Min level">
            <select name="levelMin" defaultValue={m?.levelMin ?? ""} className="select">
              <option value="">Any</option>
              {levelOptions().map((l) => (
                <option key={l} value={l}>
                  {l.toFixed(1)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Max level">
            <select name="levelMax" defaultValue={m?.levelMax ?? ""} className="select">
              <option value="">Any</option>
              {levelOptions().map((l) => (
                <option key={l} value={l}>
                  {l.toFixed(1)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Courts" hint="4 players per court">
            <input name="courts" type="number" min={1} max={12} defaultValue={m?.courts ?? 2} className="input" />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="hosted" defaultChecked={m?.hosted ?? true} className="h-4 w-4 accent-indigo" />
            Counts as the member's included weekly session
          </label>
          <Field label="Price override (€)" hint="Leave blank for club default (extras €25).">
            <input name="extraPrice" type="number" step="0.5" min={0} defaultValue={m?.extraPriceCents != null ? m.extraPriceCents / 100 : ""} className="input" />
          </Field>
        </div>
        <Field label="Description">
          <textarea name="description" rows={3} defaultValue={m?.description ?? ""} className="textarea" placeholder="Americano format, rotating partners every 15 minutes. Balls provided." />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Social afterwards" hint="Shown as a 🍸 tag.">
            <input name="socialAfter" defaultValue={m?.socialAfter ?? ""} className="input" placeholder="Drinks at the club bar, first one on us" />
          </Field>
          <Field label="Prize" hint="Shown as a 🏆 tag.">
            <input name="prize" defaultValue={m?.prize ?? ""} className="input" placeholder="Bottle of wine for the winning pair" />
          </Field>
        </div>
        <Field label="Status">
          <select name="status" defaultValue={m?.status ?? "open"} className="select">
            <option value="open">Open for booking</option>
            <option value="draft">Draft (hidden)</option>
            <option value="cancelled">Cancelled</option>
            <option value="completed">Completed</option>
          </select>
        </Field>
        {!m && (
          <Field label="Repeat weekly" hint="Creates copies for the following weeks.">
            <select name="repeatWeeks" defaultValue="0" className="select">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 11].map((n) => (
                <option key={n} value={n}>
                  {n === 0 ? "Just this one" : `+${n} more week${n > 1 ? "s" : ""}`}
                </option>
              ))}
            </select>
          </Field>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="notify" className="h-4 w-4 accent-indigo" defaultChecked={!m} />
          Notify eligible members that this session is open
        </label>
        {actionData?.error && <Alert kind="error">{actionData.error}</Alert>}
        <button className="btn btn-ink w-full" disabled={nav.state !== "idle"}>
          {m ? "Save changes" : "Create session"}
        </button>
      </Form>
    </div>
  );
}
