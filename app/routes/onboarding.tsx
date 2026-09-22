import { Form, redirect, useNavigation } from "react-router";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/onboarding";
import { requireUser } from "~/lib/auth.server";
import { getDb, schema } from "~/lib/db.server";
import { firstError, formToObject, profileSchema } from "~/lib/validate";
import { Alert, Field } from "~/components/ui";
import { AuthFrame } from "./login";
import { ProfileFields } from "~/components/profile-fields";

export const meta: Route.MetaFunction = () => [{ title: "Your player profile · Crosscourt Social" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireUser(request, context.cloudflare.env);
  if (user.name) throw redirect("/");
  return { user };
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const user = await requireUser(request, env);
  const parsed = profileSchema.safeParse(formToObject(await request.formData()));
  if (!parsed.success) return { error: firstError(parsed.error) };
  const d = parsed.data;
  await getDb(env)
    .update(schema.users)
    .set({
      name: d.name,
      phone: d.phone || null,
      gender: d.gender,
      memberType: d.gender === "male" ? "mixed" : user.memberType,
      handedness: d.handedness || null,
      preferredSide: d.preferredSide || null,
      playStyle: d.playStyle || null,
      bio: d.bio || null,
      instagram: d.instagram || null,
      avatarUrl: d.avatarUrl || null,
      showInDirectory: d.showInDirectory === "on",
    })
    .where(eq(schema.users.id, user.id));
  throw redirect("/");
}

export default function Onboarding({ loaderData, actionData }: Route.ComponentProps) {
  const nav = useNavigation();
  return (
    <AuthFrame>
      <p className="eyebrow">Welcome to the club</p>
      <h1 className="mt-1 text-2xl font-semibold">Your player profile</h1>
      <p className="mt-1 text-sm text-ink-50">Thirty seconds. This is what other members see when they look for a partner.</p>
      <Form method="post" className="mt-6 space-y-4">
        <ProfileFields user={loaderData.user} />
        {actionData?.error && <Alert kind="error">{actionData.error}</Alert>}
        <button className="btn btn-ink w-full" disabled={nav.state !== "idle"}>
          {nav.state !== "idle" ? "Saving…" : "Save and continue"}
        </button>
      </Form>
    </AuthFrame>
  );
}
