import { and, count, eq, isNull } from "drizzle-orm";
import { Outlet } from "react-router";
import type { Route } from "./+types/app-layout";
import { AppShell } from "~/components/shell";
import { requireActiveMember } from "~/lib/auth.server";
import { getDb, schema } from "~/lib/db.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const user = await requireActiveMember(request, env);
  const db = getDb(env);
  const [{ unread }] = await db
    .select({ unread: count() })
    .from(schema.notifications)
    .where(and(eq(schema.notifications.userId, user.id), isNull(schema.notifications.readAt)));
  return { user: { id: user.id, name: user.name, avatarUrl: user.avatarUrl, role: user.role, status: user.status }, unread };
}

export default function AppLayout({ loaderData }: Route.ComponentProps) {
  return (
    <AppShell user={loaderData.user} unread={loaderData.unread}>
      <Outlet />
    </AppShell>
  );
}
