import { Link, redirect } from "react-router";
import type { Route } from "./+types/login-link";
import { completeLogin, needsOnboarding } from "~/lib/auth.server";
import { Alert } from "~/components/ui";
import { AuthFrame } from "./login";

export const meta: Route.MetaFunction = () => [{ title: "Sign in · Crosscourt Social" }];

/** One-time sign-in links created by an admin (see createLoginLink). */
export async function loader({ request, context }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const email = url.searchParams.get("email") ?? "";
  const token = url.searchParams.get("token") ?? "";
  if (!email || !token) throw redirect("/login");
  const result = await completeLogin(context.cloudflare.env, request, email, token);
  if (!result.ok) return { error: result.error };
  throw redirect(needsOnboarding(result.user) ? "/onboarding" : "/", { headers: result.headers });
}

export default function LoginLink({ loaderData }: Route.ComponentProps) {
  return (
    <AuthFrame>
      <h1 className="text-2xl font-semibold">This link no longer works</h1>
      <Alert kind="error">{loaderData.error}</Alert>
      <p className="mt-4 text-sm text-ink-50">
        Sign-in links work once and expire after 7 days. Ask the club for a new one, or{" "}
        <Link to="/login" className="font-semibold text-indigo">
          sign in with your email
        </Link>
        .
      </p>
    </AuthFrame>
  );
}
