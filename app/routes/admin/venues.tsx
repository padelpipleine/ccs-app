import { eq } from "drizzle-orm";
import { Form } from "react-router";
import type { Route } from "./+types/venues";
import { requireAdmin } from "~/lib/auth.server";
import { getDb, newId, schema } from "~/lib/db.server";
import { Field, PageHeader } from "~/components/ui";

export const meta: Route.MetaFunction = () => [{ title: "Venues · Admin" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  await requireAdmin(request, env);
  return { venues: await getDb(env).select().from(schema.venues).orderBy(schema.venues.name) };
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  await requireAdmin(request, env);
  const db = getDb(env);
  const form = await request.formData();
  const intent = String(form.get("intent"));
  const id = String(form.get("id") ?? "");
  if (intent === "toggle" && id) {
    const v = await db.select().from(schema.venues).where(eq(schema.venues.id, id)).get();
    if (v) await db.update(schema.venues).set({ active: !v.active }).where(eq(schema.venues.id, id));
    return null;
  }
  if (intent === "delete" && id) {
    await db.update(schema.matchDays).set({ venueId: null }).where(eq(schema.matchDays.venueId, id));
    await db.delete(schema.venues).where(eq(schema.venues.id, id));
    return null;
  }
  const values = {
    name: String(form.get("name") ?? "").trim(),
    address: String(form.get("address") ?? "").trim() || null,
    city: String(form.get("city") ?? "").trim() || "Palma",
    mapUrl: String(form.get("mapUrl") ?? "").trim() || null,
    notes: String(form.get("notes") ?? "").trim() || null,
  };
  if (!values.name) return { error: "Name is required" };
  if (id) await db.update(schema.venues).set(values).where(eq(schema.venues.id, id));
  else await db.insert(schema.venues).values({ id: newId("v"), ...values });
  return null;
}

export default function Venues({ loaderData: d }: Route.ComponentProps) {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Admin" title="Venues" subtitle="Courts where sessions are held." />
      <div className="space-y-3">
        {d.venues.map((v) => (
          <Form key={v.id} method="post" className={`card space-y-3 p-4 ${v.active ? "" : "opacity-60"}`}>
            <input type="hidden" name="id" value={v.id} />
            <VenueFields v={v} />
            <div className="flex flex-wrap gap-2">
              <button name="intent" value="save" className="btn btn-ink btn-sm">
                Save
              </button>
              <button name="intent" value="toggle" className="btn btn-ghost btn-sm">
                {v.active ? "Deactivate" : "Activate"}
              </button>
              <button name="intent" value="delete" className="btn btn-danger btn-sm" onClick={(e) => !confirm("Delete venue?") && e.preventDefault()}>
                Delete
              </button>
            </div>
          </Form>
        ))}
      </div>
      <Form method="post" className="card mt-6 space-y-3 border-dashed p-4">
        <p className="font-display font-semibold text-ink">Add a venue</p>
        <VenueFields />
        <button name="intent" value="save" className="btn btn-primary btn-sm">
          Add venue
        </button>
      </Form>
    </div>
  );
}

function VenueFields({ v }: { v?: { name: string; address: string | null; city: string | null; mapUrl: string | null; notes: string | null } }) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name">
          <input name="name" required defaultValue={v?.name ?? ""} className="input" placeholder="Padel Indoor Palma" />
        </Field>
        <Field label="City">
          <input name="city" defaultValue={v?.city ?? "Palma"} className="input" />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Address">
          <input name="address" defaultValue={v?.address ?? ""} className="input" />
        </Field>
        <Field label="Google Maps link">
          <input name="mapUrl" type="url" defaultValue={v?.mapUrl ?? ""} className="input" placeholder="https://maps.app.goo.gl/…" />
        </Field>
      </div>
      <Field label="Notes for members" hint="Parking, which entrance, bring your own balls…">
        <input name="notes" defaultValue={v?.notes ?? ""} className="input" />
      </Field>
    </>
  );
}
