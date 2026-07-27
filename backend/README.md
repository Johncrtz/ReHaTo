# ReHaTo · Backend & Hosting Plan

The frontend is a static app; this folder holds everything needed to
connect it to a real backend when we're ready. **Nothing here is live yet.**

## Architecture

```
Browser (user)
   │  loads static files
   ▼
GitHub Pages  ──►  later: custom domain (e.g. rehato.app)
   │  HTML/CSS/JS only — no server of our own
   ▼
Supabase (Phase 2)
   ├─ Auth: anonymous sign-in (no name/email required)
   ├─ Postgres: reflections, habits, habit_logs, items
   ├─ Row Level Security: users only ever see their own rows
   └─ Edge Functions (Phase 3): scheduled Web Push reminders
```

Why Supabase: hosted Postgres + auth + auto REST API with a generous free
tier, and **anonymous auth** fits ReHaTo's privacy-first approach — users
get per-account data without handing over personal information.

## Current state (Phase 2 — client implemented ✅)

The app starts local-only (`localStorage`). Sync is **opt-in**: the
cloud button in the header signs the user in **anonymously** (no name,
no email), uploads their existing local data once, and from then on
reads/writes Supabase rows. Turning sync off snapshots the cloud state
back into `localStorage`; the anonymous session is kept so re-enabling
finds the same account.

Everything flows through the `store` facade in
[`js/store.js`](../js/store.js) (`LocalAdapter` / `SupabaseAdapter`);
credentials live in [`js/config.js`](../js/config.js).
`@supabase/supabase-js` is loaded on demand from a CDN — no build step.

### One-time dashboard setup (required before sync works)

1. Open the SQL editor of the project, paste and run
   [`schema.sql`](./schema.sql) — creates the four tables + RLS.
2. In **Authentication → Sign In / Up → Auth Providers**, enable
   **Anonymous sign-ins**.

Until both are done, enabling sync in the app shows a sync error and
the app keeps working locally.

Note: the publishable key is *meant* to be public — security comes from
Row Level Security in the database, not from hiding the key.

## Phase 3: real push reminders

Phase 1 reminders fire while the app is open (Notification API).
For reminders with the app closed:

1. Service worker subscribes to Web Push (VAPID keys).
2. Push subscriptions stored in a `push_subscriptions` table.
3. A scheduled Supabase Edge Function (cron) checks who still has open
   habits at their reminder time and sends the push.

## Hosting & custom domain

- **Now:** GitHub Pages, auto-deployed by
  [`.github/workflows/deploy-pages.yml`](../.github/workflows/deploy-pages.yml)
  on every push.
- **Custom domain later:** repo Settings → Pages → Custom domain
  (creates a `CNAME` file), then at the domain registrar:
  - subdomain `www` → `CNAME` record to `johncrtz.github.io`
  - apex domain → `A` records to `185.199.108.153`, `.109.153`, `.110.153`, `.111.153`
  - finally enable **Enforce HTTPS**.
- Pages soft limits: ~1 GB site, ~100 GB/month bandwidth — plenty for this app.
