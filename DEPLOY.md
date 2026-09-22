# Deploying Crosscourt Social to Cloudflare

The app is a single **Cloudflare Worker** (React Router v7 with server rendering) plus a **D1** database.
Static files are served by the Worker's built-in assets. There is nothing else to host.

> **Use Workers, not Pages.** Cloudflare Pages builds fail for this project because it needs a Worker
> entry (`workers/app.ts`), a D1 binding and a cron trigger, which Pages does not support.
> If you already created a Pages project for this repo, delete it and follow the steps below.

## 1. One-time setup (5 minutes, from your laptop)

```bash
git clone https://github.com/padelpipleine/ccs-app
cd ccs-app
npm install
npx wrangler login          # opens the browser, log in to Cloudflare
npm run setup:cloudflare    # creates the D1 database, runs migrations, sets secrets, deploys
git commit -am "Add D1 database id" && git push
```

`setup:cloudflare` writes the new D1 `database_id` into `wrangler.jsonc`. **Commit that change**, otherwise
Cloudflare's git builds will fail with *"Couldn't find a D1 DB with the name or binding 'ccs-db'"*.

Then set the secrets the script can't create for you (dashboard → Workers & Pages → `ccs-app` → Settings →
Variables and Secrets, or `npx wrangler secret put NAME`):

| Secret | Required | Where to get it |
| --- | --- | --- |
| `RESEND_API_KEY` | **Yes** — members sign in with an emailed code | [resend.com](https://resend.com) → API Keys. Also verify your sending domain there. |
| `EMAIL_FROM` | Yes | e.g. `Crosscourt Social <club@crosscourt.social>` (must be on the verified domain) |
| `STRIPE_SECRET_KEY` | Optional | Stripe dashboard → Developers → API keys. Enables card payments for extra sessions and tickets. |
| `STRIPE_WEBHOOK_SECRET` | Optional | Stripe → Webhooks → add endpoint `https://<your-worker-url>/webhooks/stripe` for `checkout.session.completed`. |

Already set by the script: `SESSION_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.

Finally, in `wrangler.jsonc` set:

- `APP_URL` to your real URL (the `*.workers.dev` URL printed by the deploy, or your custom domain), and
- `ADMIN_EMAILS` to the admins' email addresses, comma separated. Those people get the admin area
  automatically when they sign in.

## 2. Automatic deploys on every push (Cloudflare git integration)

Dashboard → **Workers & Pages → Create → Workers → Import a repository** → pick `padelpipleine/ccs-app`.

Use exactly these settings:

| Setting | Value |
| --- | --- |
| Project / Worker name | `ccs-app` (must match `name` in `wrangler.jsonc`) |
| Production branch | `main` (or whichever branch you merge to) |
| Build command | `npm run build` |
| Deploy command | `npx wrangler d1 migrations apply ccs-db --remote && npx wrangler deploy` |
| Root directory | `/` |
| Build variables | none needed (`NODE_VERSION` 22 is picked up from `.nvmrc`) |

The deploy command applies any new database migrations first, so schema changes ship with the code.

### Why builds were failing before

The usual causes, in order of likelihood:

1. **Project created as Pages instead of Workers.** Pages has no Worker entry / D1 / cron support. Recreate it under Workers.
2. **Placeholder `database_id` in `wrangler.jsonc`.** Run `npm run setup:cloudflare` once and commit the result.
3. **Wrong build or deploy command.** They must be `npm run build` and `npx wrangler deploy` (see table).
4. **Worker name mismatch** between the dashboard project and `wrangler.jsonc` → creates a second Worker without bindings.
5. **Node version too old.** The build needs Node 20+; `.nvmrc` pins 22.

## 3. Alternative: deploy from GitHub Actions

`.github/workflows/deploy.yml` is included but disabled. To use it instead of the git integration, add
repository secrets `CLOUDFLARE_API_TOKEN` (Workers Scripts: Edit, D1: Edit) and `CLOUDFLARE_ACCOUNT_ID`,
then uncomment the `push:` trigger. Don't enable both methods.

## 4. Custom domain

Dashboard → the Worker → Settings → Domains & Routes → Add → Custom domain, e.g. `app.crosscourt.social`.
Then update `APP_URL` in `wrangler.jsonc` and redeploy. Push notifications and the PWA "Add to Home Screen"
need HTTPS, which Cloudflare provides automatically.

## 5. Day-to-day

- **Logs:** dashboard → Worker → Observability (enabled in `wrangler.jsonc`), or `npx wrangler tail`.
- **Database:** `npx wrangler d1 execute ccs-db --remote --command "select count(*) from users"`.
- **Schema change:** edit `app/db/schema.ts` → `npm run db:generate` → commit the new file in `drizzle/`.
  It is applied on the next deploy.
- **Hourly cron** (`triggers.crons`) sends session reminders, expires stale partner invites and closes
  past sessions. Nothing to configure.
