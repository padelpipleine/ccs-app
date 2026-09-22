import { eq } from "drizzle-orm";
import { Form, useSearchParams } from "react-router";
import type { Route } from "./+types/perks";
import { requireAdmin } from "~/lib/auth.server";
import { getDb, newId, schema } from "~/lib/db.server";
import { audienceUserIds, notifyUsers } from "~/lib/push.server";
import { Alert, Field, PageHeader } from "~/components/ui";
import { PERK_CATEGORIES } from "~/lib/format";
import type { Perk } from "~/db/schema";

export const meta: Route.MetaFunction = () => [{ title: "Perks & partners · Admin" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  await requireAdmin(request, env);
  return { perks: await getDb(env).select().from(schema.perks).orderBy(schema.perks.sponsorName) };
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  await requireAdmin(request, env);
  const db = getDb(env);
  const f = await request.formData();
  const intent = String(f.get("intent"));
  const id = String(f.get("id") ?? "");
  if (intent === "delete" && id) {
    await db.delete(schema.perks).where(eq(schema.perks.id, id));
    return { success: "Deleted." };
  }
  const s = (k: string) => String(f.get(k) ?? "").trim();
  if (!s("sponsorName") || !s("title")) return { error: "Partner name and offer title are required." };
  const values = {
    sponsorName: s("sponsorName"),
    category: s("category") || "other",
    title: s("title"),
    description: s("description") || null,
    howToRedeem: s("howToRedeem") || null,
    code: s("code") || null,
    address: s("address") || null,
    url: s("url") || null,
    instagram: s("instagram") || null,
    logoUrl: s("logoUrl") || null,
    validUntil: s("validUntil") || null,
    featured: f.get("featured") === "on",
    active: f.get("active") === "on",
  };
  if (id) await db.update(schema.perks).set(values).where(eq(schema.perks.id, id));
  else {
    await db.insert(schema.perks).values({ id: newId("pk"), ...values });
    if (f.get("notify") === "on" && values.active) {
      const ids = await audienceUserIds(env, "all");
      await notifyUsers(env, ids, { title: `New member perk: ${values.sponsorName}`, body: values.title, url: "/perks", kind: "perk" });
    }
  }
  return { success: "Saved." };
}

export default function AdminPerks({ loaderData: d, actionData }: Route.ComponentProps) {
  const [params] = useSearchParams();
  const editing = params.get("edit");
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Admin" title="Perks & partners" subtitle="Crosscourt Partners: member deals from restaurants, bars, spas, shops and more." />
      {actionData?.error && <Alert kind="error">{actionData.error}</Alert>}
      {actionData?.success && <Alert kind="success">{actionData.success}</Alert>}
      <div className="mt-4 space-y-3">
        {d.perks.map((p) =>
          editing === p.id ? (
            <PerkForm key={p.id} p={p} />
          ) : (
            <div key={p.id} className={`card flex flex-wrap items-center gap-3 p-4 ${p.active ? "" : "opacity-60"}`}>
              <div className="min-w-0 flex-1">
                <p className="font-display font-semibold text-ink">
                  {p.sponsorName} <span className="pill pill-bone ml-1">{p.category}</span> {p.featured && <span className="pill pill-indigo">featured</span>}
                  {!p.active && <span className="pill pill-outline">inactive</span>}
                </p>
                <p className="text-sm text-indigo">{p.title}</p>
              </div>
              <a href={`?edit=${p.id}`} className="btn btn-ghost btn-sm">
                Edit
              </a>
              <Form method="post" onSubmit={(e) => !confirm("Delete this perk?") && e.preventDefault()}>
                <input type="hidden" name="id" value={p.id} />
                <button name="intent" value="delete" className="btn btn-danger btn-sm">
                  Delete
                </button>
              </Form>
            </div>
          ),
        )}
      </div>
      <div className="mt-8">
        <h2 className="mb-2 text-lg font-semibold">Add a partner perk</h2>
        <PerkForm />
      </div>
    </div>
  );
}

function PerkForm({ p }: { p?: Perk }) {
  return (
    <Form method="post" className="card space-y-3 p-4">
      {p && <input type="hidden" name="id" value={p.id} />}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Crosscourt Partner">
          <input name="sponsorName" required defaultValue={p?.sponsorName ?? ""} className="input" placeholder="Bodega Son Vives" />
        </Field>
        <Field label="Category">
          <select name="category" defaultValue={p?.category ?? "restaurant"} className="select">
            {PERK_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Offer">
          <input name="title" required defaultValue={p?.title ?? ""} className="input" placeholder="15% off all wines" />
        </Field>
      </div>
      <Field label="Description">
        <input name="description" defaultValue={p?.description ?? ""} className="input" placeholder="Valid in-store and online. Not combinable with other offers." />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="How to redeem">
          <input name="howToRedeem" defaultValue={p?.howToRedeem ?? ""} className="input" placeholder="Show this screen at the till" />
        </Field>
        <Field label="Code">
          <input name="code" defaultValue={p?.code ?? ""} className="input" placeholder="CROSSCOURT15" />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Address">
          <input name="address" defaultValue={p?.address ?? ""} className="input" />
        </Field>
        <Field label="Website">
          <input name="url" type="url" defaultValue={p?.url ?? ""} className="input" />
        </Field>
        <Field label="Instagram">
          <input name="instagram" defaultValue={p?.instagram ?? ""} className="input" placeholder="@handle" />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Logo URL">
          <input name="logoUrl" type="url" defaultValue={p?.logoUrl ?? ""} className="input" />
        </Field>
        <Field label="Valid until">
          <input name="validUntil" type="date" defaultValue={p?.validUntil ?? ""} className="input" />
        </Field>
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="active" defaultChecked={p?.active ?? true} className="h-4 w-4 accent-indigo" /> Active
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="featured" defaultChecked={p?.featured ?? false} className="h-4 w-4 accent-indigo" /> Featured on home
        </label>
        {!p && (
          <label className="flex items-center gap-2">
            <input type="checkbox" name="notify" defaultChecked className="h-4 w-4 accent-indigo" /> Notify members
          </label>
        )}
      </div>
      <button name="intent" value="save" className="btn btn-ink btn-sm">
        {p ? "Save" : "Add perk"}
      </button>
    </Form>
  );
}
