import { Form, Link, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/login-verify";
import { completeLogin, postLoginTarget } from "~/lib/auth.server";
import { Alert, Field } from "~/components/ui";
import { AuthFrame } from "./login";

export const meta: Route.MetaFunction = () => [{ title: "Enter your code · Crosscourt Social" }];

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const email = url.searchParams.get("email");
  if (!email) throw redirect("/login");
  return { email, next: url.searchParams.get("next") ?? "/", dev: url.searchParams.get("dev"), nomail: url.searchParams.get("nomail") === "1" };
}

export async function action({ request, context }: Route.ActionArgs) {
  const form = await request.formData();
  const email = String(form.get("email") ?? "");
  const code = String(form.get("code") ?? "");
  const next = String(form.get("next") ?? "/");
  const result = await completeLogin(context.cloudflare.env, request, email, code);
  if (!result.ok) return { error: result.error };
  const target = postLoginTarget(result.user, next);
  throw redirect(target, { headers: result.headers });
}

export default function Verify({ loaderData, actionData }: Route.ComponentProps) {
  const nav = useNavigation();
  return (
    <AuthFrame>
      <h1 className="text-2xl font-semibold">Check your email</h1>
      <p className="mt-1 text-sm text-ink-50">
        We sent a code to <strong className="text-ink">{loaderData.email}</strong>.
      </p>
      {loaderData.dev && (
        <Alert kind="warn">
          Dev mode, email not configured. Your code is <strong>{loaderData.dev}</strong>.
        </Alert>
      )}
      {loaderData.nomail && <Alert kind="error">We couldn't email your code right now. Ask the club to send you a sign-in link on WhatsApp instead.</Alert>}
      <Form method="post" className="mt-6 space-y-4">
        <input type="hidden" name="email" value={loaderData.email} />
        <input type="hidden" name="next" value={loaderData.next} />
        <Field label="6-digit code">
          <input
            name="code"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            autoComplete="one-time-code"
            className="input text-center font-display text-2xl tracking-[0.4em]"
            autoFocus
          />
        </Field>
        {actionData?.error && <Alert kind="error">{actionData.error}</Alert>}
        <button className="btn btn-ink w-full" disabled={nav.state !== "idle"}>
          {nav.state !== "idle" ? "Checking…" : "Sign in"}
        </button>
      </Form>
      <p className="mt-6 text-center text-xs text-ink-50">
        Wrong email or no code?{" "}
        <Link to="/login" className="font-semibold text-indigo">
          Start again
        </Link>
      </p>
    </AuthFrame>
  );
}
