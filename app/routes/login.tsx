import { Form, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/login";
import { getUser, startLogin } from "~/lib/auth.server";
import { Alert, Field } from "~/components/ui";

export const meta: Route.MetaFunction = () => [{ title: "Sign in · Crosscourt Social" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await getUser(request, context.cloudflare.env);
  if (user) throw redirect("/");
  return null;
}

export async function action({ request, context }: Route.ActionArgs) {
  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim();
  const next = String(form.get("next") ?? "/");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Enter a valid email address." };
  const { devCode, emailSent } = await startLogin(context.cloudflare.env, email);
  const params = new URLSearchParams({ email, next });
  if (devCode) params.set("dev", devCode);
  if (!emailSent && !devCode) params.set("nomail", "1");
  throw redirect(`/login/verify?${params}`);
}

export default function Login({ actionData }: Route.ComponentProps) {
  const nav = useNavigation();
  const next = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("next") ?? "/" : "/";
  return (
    <AuthFrame>
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <p className="mt-1 text-sm text-ink-50">We'll email you a 6-digit code. No password to remember.</p>
      <Form method="post" className="mt-6 space-y-4">
        <input type="hidden" name="next" value={next} />
        <Field label="Email">
          <input name="email" type="email" required autoComplete="email" inputMode="email" className="input" placeholder="you@example.com" autoFocus />
        </Field>
        {actionData?.error && <Alert kind="error">{actionData.error}</Alert>}
        <button className="btn btn-ink w-full" disabled={nav.state !== "idle"}>
          {nav.state !== "idle" ? "Sending…" : "Send my code"}
        </button>
      </Form>
      <p className="mt-6 text-center text-xs text-ink-50">
        Not a member yet?{" "}
        <a href="https://club.crosscourt.social/" className="font-semibold text-indigo">
          Join Crosscourt Social
        </a>
      </p>
    </AuthFrame>
  );
}

export function AuthFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-bone">
      <div className="card-ink flex flex-col items-center rounded-none px-6 pb-10 pt-14">
        <img src="/brand/monogram-bone.png" alt="Crosscourt Social" className="h-16" />
        <p className="wordmark mt-4 text-xs text-bone">Crosscourt Social</p>
        <p className="mt-2 font-serif text-lg italic text-on-ink-muted">Padel, properly hosted.</p>
      </div>
      <div className="mx-auto -mt-5 w-full max-w-md px-4 pb-16">
        <div className="card p-6">{children}</div>
      </div>
    </div>
  );
}
