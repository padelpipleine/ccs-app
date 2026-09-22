import { Form, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/membership";
import { JOIN_URL, membershipBlocked, requireUser } from "~/lib/auth.server";
import { fetchSiteMembers, siteSyncConfigured, upsertSiteMember } from "~/lib/site-sync.server";
import { getDb } from "~/lib/db.server";
import { Alert } from "~/components/ui";
import { AuthFrame } from "./login";

export const meta: Route.MetaFunction = () => [{ title: "Membership · Crosscourt Social" }];

/** Shown instead of the app to anyone signed in without an active (paid) membership. */
export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const user = await requireUser(request, env);
  if (!membershipBlocked(user)) throw redirect("/");
  return { status: user.status, siteStatus: user.siteStatus, email: user.email, name: user.name, canCheck: siteSyncConfigured(env) };
}

/** "I've paid — check again": re-reads this member from the sign-up site right now. */
export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const user = await requireUser(request, env);
  if (!siteSyncConfigured(env)) return { checked: false, error: "Checking isn't available right now. The club will activate you shortly." };
  try {
    const members = await fetchSiteMembers(env);
    const rec = members.find((m) => (m.email ?? "").toLowerCase() === user.email);
    if (rec) await upsertSiteMember(env, rec);
    const fresh = await getDb(env).query.users.findFirst({ where: (u, { eq }) => eq(u.id, user.id) });
    if (fresh && !membershipBlocked(fresh)) throw redirect("/");
    return { checked: true, error: null };
  } catch (err) {
    if (err instanceof Response) throw err;
    return { checked: false, error: "Couldn't reach the club site just now. Try again in a minute." };
  }
}

export default function Membership({ loaderData: d, actionData }: Route.ComponentProps) {
  const nav = useNavigation();
  const first = d.name.split(" ")[0];
  const lapsed = d.status === "paused" || d.siteStatus === "lapsed";
  return (
    <AuthFrame>
      <p className="eyebrow">{lapsed ? "Membership lapsed" : "Almost there"}</p>
      <h1 className="mt-1 text-2xl font-semibold">{lapsed ? `Welcome back${first ? `, ${first}` : ""}.` : `Hola${first ? ` ${first}` : ""}, your membership isn't active yet.`}</h1>
      <p className="mt-2 text-sm text-ink-70">
        {lapsed
          ? "Your membership has lapsed, so the app is paused for now. Renew and you're straight back in: sessions, events and partner perks, and your padel level and club status are kept."
          : d.siteStatus === "started"
            ? "Looks like the payment on the sign-up page didn't complete. Finish it and this page turns into the app."
            : "The app is for members of Crosscourt Social. If you've just paid, give it a moment and check again. If you haven't joined yet, it takes two minutes."}
      </p>
      <p className="mt-3 rounded-lg bg-bone-deep px-3 py-2 text-xs text-ink-70">
        Signed in as <strong className="text-ink">{d.email}</strong>. If you joined with a different email, sign out and use that one.
      </p>
      <div className="mt-6 space-y-3">
        <a href={JOIN_URL} className="btn btn-ink w-full">
          {lapsed ? "Renew my membership" : "Join Crosscourt Social"}
        </a>
        {d.canCheck && (
          <Form method="post">
            <button className="btn btn-outline w-full" disabled={nav.state !== "idle"}>
              {nav.state !== "idle" ? "Checking…" : "I've paid — check again"}
            </button>
          </Form>
        )}
        {actionData?.checked && <Alert kind="info">Still not showing as paid. Payments usually appear within a minute; if it's been longer, message the club.</Alert>}
        {actionData?.error && <Alert kind="error">{actionData.error}</Alert>}
        <Form method="post" action="/logout" className="text-center">
          <button className="text-xs text-ink-50 underline">Sign out</button>
        </Form>
      </div>
      <p className="mt-6 text-center text-xs text-ink-50">
        Questions?{" "}
        <a href="mailto:contact@crosscourt.social" className="text-indigo">
          contact@crosscourt.social
        </a>
      </p>
    </AuthFrame>
  );
}
