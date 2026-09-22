import { Form, redirect, useNavigation } from "react-router";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/profile-edit";
import { requireActiveMember } from "~/lib/auth.server";
import { getDb, schema } from "~/lib/db.server";
import { firstError, formToObject, profileSchema, profileToUpdate } from "~/lib/validate";
import { Alert, BackLink, PageHeader } from "~/components/ui";
import { ProfileFields } from "~/components/profile-fields";

export const meta: Route.MetaFunction = () => [{ title: "Edit profile · Crosscourt Social" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  return { user: await requireActiveMember(request, context.cloudflare.env) };
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const user = await requireActiveMember(request, env);
  const parsed = profileSchema.safeParse(formToObject(await request.formData()));
  if (!parsed.success) return { error: firstError(parsed.error) };
  const d = parsed.data;
  await getDb(env)
    .update(schema.users)
    .set(profileToUpdate(d, user.memberType))
    .where(eq(schema.users.id, user.id));
  throw redirect("/profile");
}

export default function ProfileEdit({ loaderData, actionData }: Route.ComponentProps) {
  const nav = useNavigation();
  return (
    <div className="mx-auto max-w-lg">
      <BackLink to="/profile">Profile</BackLink>
      <PageHeader title="Edit profile" />
      <Form method="post" className="card space-y-4 p-5">
        <ProfileFields user={loaderData.user} />
        {actionData?.error && <Alert kind="error">{actionData.error}</Alert>}
        <button className="btn btn-ink w-full" disabled={nav.state !== "idle"}>
          Save changes
        </button>
      </Form>
    </div>
  );
}
