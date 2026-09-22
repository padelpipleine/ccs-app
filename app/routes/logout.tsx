import { redirect } from "react-router";
import type { Route } from "./+types/logout";
import { logout } from "~/lib/auth.server";

export async function action({ request, context }: Route.ActionArgs) {
  const headers = await logout(request, context.cloudflare.env);
  throw redirect("/login", { headers });
}

export async function loader() {
  throw redirect("/login");
}
