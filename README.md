# Study Planner

A block-based study planner. Single-page web app, installable as a PWA, with optional Firebase auth.

## Running locally

Open `index.html` in a browser — but it must be served over HTTP for the service worker (and auth) to work. Easiest options:

```bash
# Python 3
python -m http.server 8080

# Node
npx serve .
```

Then visit `http://localhost:8080/`.

## Enabling auth + cross-device

1. Create a Firebase project at https://console.firebase.google.com/
2. Enable Authentication → Sign-in providers: Email/Password + Google
3. In Project Settings → Your apps → add a Web app, copy the config object
4. Paste the values into `firebase-config.js` (replace the `REPLACE_ME` strings)
5. Add your deploy domain (or `localhost`) to Authentication → Settings → Authorized domains

Until then, the app runs in **local-only mode** — single anonymous user, data in localStorage.

## Installing as a desktop app

Once served over HTTPS (or localhost), Chrome / Edge will show an install prompt — or use the **↓ Install** button in the top bar. The app then runs in its own window.

## Data

All data lives in `localStorage`, keyed by user ID. Use the avatar menu → "Reset data" to wipe.

## Files

```
index.html              entry point
app.css                 all styles
manifest.json           PWA manifest
sw.js                   service worker (offline shell)
firebase-config.js      Firebase config (you fill this in)
icons/                  PWA icons
js/
  store.jsx             state + localStorage + auth wrappers
  components.jsx        shared primitives (drag, toast, tasks)
  modals.jsx            Add Task + Command Palette + Sign In
  week.jsx              Week view (default)
  day.jsx               Day view
  manage.jsx            Recurring + one-off editor
  log.jsx               Study log + Struggle Index
  schedule.jsx          Schedule editor (define blocks)
  app.jsx               top-level: auth gate, router, chrome
```

## Keyboard shortcuts

- `Ctrl+K` — command palette
- `Ctrl+N` — new task
- `Esc` — close any modal
