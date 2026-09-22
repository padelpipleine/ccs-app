# Crosscourt Social · members app

The booking and social hub for [Crosscourt Social](https://club.crosscourt.social/), Mallorca's members'
padel club. Members book hosted sessions, bring partners at their level, join events and use perks from Crosscourt Partners.
Admins run the club from the same app.

**Deployment:** see [DEPLOY.md](./DEPLOY.md). The app runs on a Cloudflare Worker with a D1 database.

## What it does

### Members
- **Sign in with an emailed code**, no passwords. New sign-ups land as *pending* until an admin approves them.
- **Player profile**: gender, handedness, preferred side, playing style, bio, Instagram, photo. Opt in/out of the
  member directory.
- **Play**: browse upcoming hosted sessions filtered by group (ladies / mixed), level range and eligibility.
  Book a spot, or **bring a partner** – only members within the allowed level gap are offered. The partner gets a
  notification and confirms. Full sessions have a **waitlist** that promotes automatically.
- **Weekly allowance**: one hosted session per ISO week is included. A second one is an **extra session (€25)**
  and goes through payment (card via Stripe, or Bizum/transfer instructions which the admin marks as paid).
- **Cancellation policy**: free until *N* hours before, after that it still counts as the week's session and costs
  social points.
- **Events**: fashion show, retreats, pool parties, drinks. Free or ticketed, optional +1 guests and guest price,
  capacity with waitlist.
- **Member perks**: Crosscourt Partner discounts by category, with codes and how-to-redeem, unlocked for active members.
- **Members directory** to find partners at your level.
- **Club status**: club points for playing, attending events and bringing partners; status tiers (Rookie → Icon),
  badges and a club ranking. The **padel level** is separate and set only by the coach.
- **Inbox + push notifications** (installable PWA): reminders the day before, partner invites, waitlist promotions,
  new sessions/events/perks, club announcements.

### Admins (`/admin`)
- Dashboard with setup checklist, member counts, payments owed, upcoming sessions/events.
- **Members**: approve, set **playing level** (with history and a note sent to the member), group (mixed / ladies
  only – men are always mixed), status, role, membership plan, private notes, points adjustments. Bulk add by
  pasting `email, name, group` lines.
- **Sessions**: venue, date/time, group, level range, courts (4 players each), hosted or not, price override,
  description, social afterwards, prize; repeat weekly; notify eligible members on publish. Per session: player
  list with attendance (awards points), mark payments received / waive, remove players, message the players,
  cancel with reason (notifies everyone).
- **Events**: same idea with guest list, check-in, payments, messaging.
- **Venues**, **Perks & partners**, **Notify members** (push + in-app, by audience), **Club settings** (weekly
  allowance, extra price, partner level gap, cancellation window, booking window, payment mode and instructions,
  points values, welcome message, WhatsApp link).

### Automatic (hourly cron)
Reminders for tomorrow's sessions and events, expiry of partner invites not accepted within 48 h (spot goes to
the waitlist), closing of past sessions.

## Business rules (as implemented)

| Rule | Where |
| --- | --- |
| Men can only be in the mixed group; women can be mixed (play both) or ladies-only | `app/lib/bookings.server.ts` `groupEligible` |
| A session has a level range; you must be inside it | `levelEligible` |
| Partners must be within `partnerLevelGap` of each other (default 0.5, set to 0 for "identical") | `partnerEligibility` |
| 1 hosted session per ISO week included; extras cost `extraSessionPriceCents` | `pricing`, `weeklyUsage` |
| Capacity = courts × 4; overflow goes to the waitlist and is promoted in order | `createBooking`, `promoteWaitlist` |
| Level is set only by admins (level day); members can't change it | `app/routes/admin/member.tsx` |

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars      # dev secrets; the sign-in code is shown on screen
npm run db:migrate:local            # create the local D1 database
npm run db:seed:local               # optional demo venues, sessions, events, perks
npm run dev                         # http://localhost:5173
```

Sign in with an email listed in `ADMIN_EMAILS` (`wrangler.jsonc`) to get the admin area. The database schema is
applied automatically by the Worker on first request (locally and in production).

Other scripts: `npm run typecheck`, `npm run build`, `npm run db:generate` (after editing the schema),
`node scripts/generate-vapid.mjs` (push keys).

## Stack

React Router v7 (framework mode, SSR) · Cloudflare Workers + D1 · Drizzle ORM · Tailwind v4 · Web Push (VAPID)
· Resend (email) · Stripe Checkout (optional). Brand tokens mirror club.crosscourt.social (ink / bone / indigo /
pink / teal, Space Grotesk / Inter Tight / Cormorant Garamond).

## Project layout

```
app/
  routes/           member pages (home, matches, events, perks, members, leaderboard, inbox, profile)
  routes/admin/     admin pages
  lib/              server logic: auth, bookings rules, payments, push, points, jobs, settings
  db/schema.ts      database schema (Drizzle)
  components/       shell, cards, UI primitives
workers/app.ts      Worker entry: HTTP → React Router, cron → jobs, /webhooks/stripe
drizzle/            SQL migrations (applied by wrangler)
scripts/            setup-cloudflare, generate-vapid, seed
public/             PWA manifest, service worker, brand assets
```
