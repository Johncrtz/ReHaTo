# 🌱 ReHaTo

**Re**flektieren · **Ha**bits · **To**-dos — a calm little companion for
reflecting on your day, building habits, and keeping track of your thoughts.

**Live:** https://johncrtz.github.io/ReHaTo/
**Demo with sample data:** https://johncrtz.github.io/ReHaTo/?demo=1
**Sync diagnostics:** https://johncrtz.github.io/ReHaTo/synctest.html — full
end-to-end test of the Supabase backend, with fix-it links for anything red

## Features

- 📅 **Calendar reflections** — tap any day, write how it went, tag a mood.
  Days with entries are marked; recent entries listed below the calendar.
- 🌱 **Habits** — daily check-ins on a 7-day strip, streak counters, progress
  bar, and a daily reminder (browser notification) that tells you what's
  still open — or congratulates you when everything's done.
- 📝 **Notes & to-dos** — quick capture for tasks (checkable) and free
  thoughts.
- 📚 **Books** — track reading progress (page / total with a progress bar),
  and capture quotes & notes per book.
- ❝ **Quotes** — every saved quote on one quiet wall, in italics with
  proper quotation marks and book attribution.
- ☁️ **Opt-in anonymous cloud sync** (Supabase) — off by default; one tap
  creates an anonymous account (no name/email) and keeps data synced.
- 🌗 Dark/light mode · 🇩🇪/🇬🇧 language toggle · 📲 installable as a PWA ·
  works offline.

## Privacy

By default **everything stays in your browser** (`localStorage`) — nothing
leaves your device. The cloud button in the header enables optional sync
via Supabase with an **anonymous account** (no name, no email); Row Level
Security keeps every user's rows private. Setup steps and details:
[`backend/README.md`](backend/README.md).

## Development

No build step — plain HTML/CSS/ES modules.

```bash
python3 -m http.server 8000   # or any static file server
# open http://localhost:8000
```

Useful URLs while developing:

| URL | Effect |
|-----|--------|
| `/?demo=1` | In-memory sample data, nothing persisted |
| `/?open=today` | Opens today's reflection editor on load |
| `/#habits`, `/#todos` | Deep link to a view |

## Deployment

Pushes to the active branch auto-deploy via
[`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml).

First-time setup, if the site isn't live yet: repo **Settings → Pages →
Build and deployment → Source: “GitHub Actions”**, then re-run the latest
“Deploy to GitHub Pages” workflow from the Actions tab.

## Project structure

```
index.html              app shell
css/styles.css          design system (light/dark, mobile-first)
js/main.js              boot, navigation, theme/language
js/store.js             data layer — ALL data flows through here
js/calendar.js          calendar + reflection editor
js/habits.js            habits, streaks, reminder settings
js/todos.js             notes & to-dos
js/reminders.js         notification scheduling
js/i18n.js              DE/EN strings
js/config.js            backend switch (Phase 2: Supabase keys go here)
sw.js                   service worker (offline + notifications)
backend/                Supabase schema + connection guide (not live yet)
```

## Roadmap

- [x] **Phase 1** — frontend on GitHub Pages, data in localStorage
- [x] **Phase 2** — Supabase: opt-in anonymous auth + sync
      (requires one-time dashboard setup, see `backend/README.md`)
- [x] **Phase 3** — books with reading progress + quotes collection
- [ ] **Phase 4** — real push reminders via Edge Functions + Web Push
- [ ] **Phase 5** — custom domain (staying on the github.io URL for now)
