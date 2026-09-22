# Deploying Crosscourt Social to Cloudflare

The app is a single **Cloudflare Worker** (React Router v7 with server rendering) plus a **D1** database.
Static files are served by the Worker's built-in assets. There is nothing else to host.

> **Use Workers, not Pages.** Cloudflare Pages builds fail for this project because it needs a Worker
> entry (`workers/app.ts`), a D1 binding and a cron trigger, which Pages does not support.
> If you already created a Pages project for this repo, delete it and follow the steps below.

## 1. One-time setup: database and photo storage

The Worker needs one D1 database called `ccs-db` and one R2 bucket called `ccs-photos` (member profile photos).

**Photos bucket:** dashboard → R2 Object Storage → Create bucket → name `ccs-photos` (or `npx wrangler r2 bucket create ccs-photos`).
Nothing else to configure; the app serves photos itself at `/photos/…`. Without the bucket, deploys fail with
*"R2 bucket ccs-photos not found"*.

**Database:** create it once, either way:

- **Dashboard:** Storage & Databases → D1 SQL Database → Create → name `ccs-db` → copy its **Database ID**.
- **Terminal:** `npx wrangler login` then `npx wrangler d1 create ccs-db` and copy the id it prints.

Paste that id into `wrangler.jsonc` in place of `REPLACE_WITH_YOUR_D1_DATABASE_ID` and push. Nothing else is
needed for the database: **the Worker applies its own schema migrations on first request**, and on every deploy
after that, so there is no migration command to remember.

(`npm run setup:cloudflare` still exists and does the same plus secrets and a deploy, if you prefer one command.)

## 2. Connect the repo (Cloudflare git integration)

Dashboard → **Workers & Pages → Create → Workers → Import a repository** → pick `padelpipleine/ccs-app`.

| Setting | Value |
| --- | --- |
| Worker name | `ccs-app` (must match `name` in `wrangler.jsonc`) |
| Production branch | `main` (feature branches are merged into it via pull requests; pushes to other branches upload a preview version) |
| Build command | `npm run build` (recommended; the build also runs automatically after `npm install`, so it works if this is left blank) |
| Deploy command | `npx wrangler deploy` (the default; `npx wrangler versions upload` on preview branches is fine too) |
| Root directory | `/` |

Merging a pull request into `main` deploys live; pushes to other branches upload a preview version with its own URL.

### Secrets (Worker → Settings → Variables and Secrets)

| Secret | Required | Where to get it |
| --- | --- | --- |
| `SESSION_SECRET` | **Yes** | Any long random string (e.g. `openssl rand -hex 32`). Signs the login cookies. |
| `RESEND_API_KEY` | **Yes** for real sign-in emails | [resend.com](https://resend.com) → API Keys, and verify your sending domain there. |
| `EMAIL_FROM` | Yes | e.g. `Crosscourt Social <club@crosscourt.social>` on the verified domain. |
| `DEV_SHOW_LOGIN_CODE` | Temporary | Set to `1` to show the sign-in code on screen while email isn't configured yet. **Remove before members use it.** |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | For push (free) | Sign in as admin → Dashboard → setup checklist → **Generate push keys**, then paste the three values. (Or run `node scripts/generate-vapid.mjs`.) |
| `SITE_CRM_KEY` | Recommended | The `CRM_KEY` value from the sign-up site's `club/wrangler.jsonc` (repo `padelpipleine/crosscourtsocial`). Lets the app pull sign-ups and payment status from club.crosscourt.social every hour, and on demand from Admin → Members → "Sync from club site". |
| `STRIPE_SECRET_KEY` | Optional | Stripe → Developers → API keys. Enables card payments. |
| `STRIPE_WEBHOOK_SECRET` | Optional | Stripe → Webhooks → endpoint `https://<worker-url>/webhooks/stripe`, event `checkout.session.completed`. |

Also set `ADMIN_EMAILS` in `wrangler.jsonc` to the admins' emails, comma separated.

### If a build fails

- *"assets.directory … does not exist"*: the build didn't run. Set Build command to `npm run build` (or pull the
  latest code, which builds on install).
- *"binding DB of type d1 must have a valid database_id"*: step 1 above wasn't done.
- *"R2 bucket … not found"*: create the `ccs-photos` bucket (step 1).
- *"Couldn't find a D1 DB with the name or binding"*: the id in `wrangler.jsonc` doesn't belong to this account.
- Project created as **Pages** instead of Workers: Pages can't run this app; recreate it under Workers.

## 3. Alternative: deploy from GitHub Actions

`.github/workflows/deploy.yml` is included but disabled. To use it instead of the git integration, add
repository secrets `CLOUDFLARE_API_TOKEN` (Workers Scripts: Edit, D1: Edit) and `CLOUDFLARE_ACCOUNT_ID`,
then uncomment the `push:` trigger. Don't enable both methods.

## 4. Custom domain

Dashboard → the Worker → Settings → Domains & Routes → Add → Custom domain, e.g. `app.crosscourt.social`.
Push notifications and the PWA "Add to Home Screen" need HTTPS, which Cloudflare provides automatically.

## 5. How members get in

1. Someone joins on **club.crosscourt.social** (Airwallex payment) and fills the welcome form there.
2. Within the hour (or when an admin clicks **Sync from club site**), they appear in the app's Members list:
   *paid* → **active**, *started* (began checkout) → **pending**, *lapsed* → **paused**. Their name, phone, gender,
   hand, side, Instagram and self-declared level come across; the coach still sets the real padel level.
3. Admins get an in-app notification listing new members. If Resend is configured, each new paid member gets one
   welcome email with a one-time sign-in link, sent the moment they pay (same link as the button on the site's
   success screen) or, for members found by the hourly sync, when they're first seen. Otherwise open the member
   and use **Send via WhatsApp**.
4. **Straight after paying**, the site asks the app for a one-time sign-in link (`POST /webhooks/site-signup`,
   authenticated with the shared key) and sends the member into the app's onboarding questions, signed in with the
   email they paid with. The site's `/welcome` links in older emails redirect there too.
5. The app never changes anything on the site, and never overwrites data an admin or member has edited in the app.

The shared key must be identical on both Workers: `CRM_KEY` in the site's `club/wrangler.jsonc` and the
`SITE_CRM_KEY` secret here. The site's `APP_URL` var must point at this app.

## 6. Day-to-day

- **Logs:** dashboard → Worker → Observability (enabled in `wrangler.jsonc`), or `npx wrangler tail`.
- **Database:** `npx wrangler d1 execute ccs-db --remote --command "select count(*) from users"`.
- **Schema change:** edit `app/db/schema.ts` → `npm run db:generate` → commit the new file in `drizzle/`.
  The Worker applies it on the first request after the next deploy.
- **Hourly cron** (`triggers.crons`) sends session reminders, expires stale partner invites and closes
  past sessions. Nothing to configure.
