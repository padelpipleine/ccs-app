// Secrets are not listed in wrangler.jsonc `vars`, so they are declared here.
// Set them with `wrangler secret put NAME` (or in .dev.vars for local dev).
interface Env {
  SESSION_SECRET?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  DEV_SHOW_LOGIN_CODE?: string;
}
