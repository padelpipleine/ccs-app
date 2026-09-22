import { Outlet } from "react-router";
import type { Route } from "./+types/layout";
import { AppShell } from "~/components/shell";
import { requireAdmin } from "~/lib/auth.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireAdmin(request, context.cloudflare.env);
  return { user: { id: user.id, name: user.name || "Admin", avatarUrl: user.avatarUrl, role: user.role } };
}

export default function AdminLayout({ loaderData }: Route.ComponentProps) {
  return (
    <AppShell user={loaderData.user} unread={0} admin>
      <Outlet />
    </AppShell>
  );
}
