import { Form, useNavigation } from "react-router";
import type { Route } from "./+types/settings";
import { requireAdmin } from "~/lib/auth.server";
import { getDb } from "~/lib/db.server";
import { DEFAULT_SETTINGS, getSettings, setSetting, type SettingKey } from "~/lib/settings.server";
import { stripeEnabled } from "~/lib/payments.server";
import { Alert, Field, PageHeader } from "~/components/ui";

export const meta: Route.MetaFunction = () => [{ title: "Club settings · Admin" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  await requireAdmin(request, env);
  return { s: await getSettings(getDb(env)), stripe: stripeEnabled(env) };
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  await requireAdmin(request, env);
  const db = getDb(env);
  const f = await request.formData();
  for (const key of Object.keys(DEFAULT_SETTINGS) as SettingKey[]) {
    const v = f.get(key);
    if (typeof v !== "string") continue;
    let value = v.trim();
    if (key === "extraSessionPriceCents") value = String(Math.round((Number(value) || 0) * 100));
    if (key === "paymentMode" && value === "stripe" && !stripeEnabled(env)) value = "manual";
    await setSetting(db, key, value);
  }
  return { success: "Settings saved." };
}

export default function Settings({ loaderData: { s, stripe }, actionData }: Route.ComponentProps) {
  const nav = useNavigation();
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader eyebrow="Admin" title="Club settings" />
      <Form method="post" className="space-y-6">
        <section className="card space-y-4 p-5">
          <h2 className="font-display font-semibold text-ink">Booking rules</h2>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Hosted sessions included per week">
              <input name="weeklyAllowance" type="number" min={0} max={7} defaultValue={s.weeklyAllowance} className="input" />
            </Field>
            <Field label="Extra session price (€)">
              <input name="extraSessionPriceCents" type="number" step="0.5" min={0} defaultValue={Number(s.extraSessionPriceCents) / 100} className="input" />
            </Field>
            <Field label="Max level gap between partners" hint="0 = must be identical. 0.5 = one step apart.">
              <select name="partnerLevelGap" defaultValue={s.partnerLevelGap} className="select">
                {["0", "0.5", "1", "1.5", "2"].map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Free cancellation (hours before)">
              <input name="freeCancelHours" type="number" min={0} defaultValue={s.freeCancelHours} className="input" />
            </Field>
            <Field label="Booking opens (days ahead)">
              <input name="bookingOpensDays" type="number" min={1} max={90} defaultValue={s.bookingOpensDays} className="input" />
            </Field>
          </div>
        </section>
        <section className="card space-y-4 p-5">
          <h2 className="font-display font-semibold text-ink">Payments</h2>
          <Field label="How members pay for extras & tickets">
            <select name="paymentMode" defaultValue={s.paymentMode} className="select">
              <option value="manual">Manual (Bizum / transfer, you mark as paid)</option>
              <option value="stripe" disabled={!stripe}>
                Card via Stripe {stripe ? "" : "(add STRIPE_SECRET_KEY to enable)"}
              </option>
            </select>
          </Field>
          <Field label="Manual payment instructions" hint="Shown to members when they owe a payment.">
            <textarea name="paymentInstructions" rows={3} defaultValue={s.paymentInstructions} className="textarea" />
          </Field>
        </section>
        <section className="card space-y-4 p-5">
          <h2 className="font-display font-semibold text-ink">Social points</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {(
              [
                ["pointsAttend", "Play a session"],
                ["pointsEvent", "Attend an event"],
                ["pointsPartner", "Bring a partner"],
                ["pointsLateCancel", "Late cancel"],
                ["pointsNoShow", "No-show"],
              ] as const
            ).map(([k, label]) => (
              <Field key={k} label={label}>
                <input name={k} type="number" defaultValue={s[k]} className="input" />
              </Field>
            ))}
          </div>
        </section>
        <section className="card space-y-4 p-5">
          <h2 className="font-display font-semibold text-ink">Club</h2>
          <Field label="Welcome message on the home screen">
            <textarea name="welcomeMessage" rows={2} defaultValue={s.welcomeMessage} className="textarea" />
          </Field>
          <Field label="WhatsApp group invite link" hint="Optional. Shown on the home screen.">
            <input name="whatsappUrl" type="url" defaultValue={s.whatsappUrl} className="input" placeholder="https://chat.whatsapp.com/…" />
          </Field>
        </section>
        {actionData?.success && <Alert kind="success">{actionData.success}</Alert>}
        <button className="btn btn-ink w-full" disabled={nav.state !== "idle"}>
          Save settings
        </button>
      </Form>
    </div>
  );
}
