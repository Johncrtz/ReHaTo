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

## Current state (Phase 1)

All data lives in `localStorage` in the user's browser. The entire app
talks to one interface — `store` in [`js/store.js`](../js/store.js) — so
swapping the storage backend never touches view code.

## Phase 2: connect Supabase

1. Create a project at [supabase.com](https://supabase.com) (free tier).
2. Open the SQL editor, paste and run [`schema.sql`](./schema.sql).
3. In **Authentication → Sign In / Up**, enable **Anonymous sign-ins**.
4. Copy the project's **URL** and **anon public key**
   (Settings → API) into [`js/config.js`](../js/config.js):
   ```js
   export const CONFIG = {
     backend: 'supabase',
     supabaseUrl: 'https://xyz.supabase.co',
     supabaseAnonKey: 'eyJ...',
   };
   ```
5. Implement `SupabaseAdapter` in `js/store.js` with the same method
   signatures as `LocalAdapter` (the interface is documented at the top
   of that file). Include a one-time migration that uploads existing
   localStorage data on first sign-in.

Note: the anon key is *meant* to be public — security comes from Row
Level Security in the database, not from hiding the key.

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
