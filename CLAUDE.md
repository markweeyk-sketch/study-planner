# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A block-based study planner: a single-page web app, installable as a PWA, with optional Firebase auth + Firestore cross-device sync. There is **no build system, no package.json, no tests, no linter** — React 18 UMD and Babel Standalone are loaded from CDNs, and the `.jsx` files are compiled in the browser at page load via `<script type="text/babel">`.

## Running

The app must be served over HTTP (not `file://`) for the service worker and auth to work:

```bash
python -m http.server 8080   # or: npx serve .
```

Then open `http://localhost:8080/`. There is no compile step — edit a file and refresh. Note the service worker caches the shell (stale-while-revalidate), so a hard refresh may be needed to see changes.

## Architecture

### Globals, not modules

There are no ES modules or imports. Each `js/*.jsx` file ends with `Object.assign(window, {...})` exposing its functions/components, and later scripts use them as bare globals. Consequences:

- **Script order in `index.html` matters**: `store.jsx` → `components.jsx` → `modals.jsx` → `session.jsx` → views (`today`, `week`, `day`, `manage`, `log`, `schedule`) → `app.jsx` (mounts React). `session.jsx` loads before the views because `today.jsx` uses its `StartButton`.
- Adding a new file means adding it to **both** the `index.html` script list (in dependency order) **and** the `SHELL` array in `sw.js`.
- New exports must be added to the `Object.assign(window, ...)` block at the bottom of their file.

### State & sync (the part that's easy to break)

- All app state is one plain object (shape defined by `emptyState()` in `js/store.jsx`): `schedule` (weekly block slots per weekday), `recurring` (weekly-target task templates), `tasks`, `log`, `reviews`, `assessments`.
- **Assessments** (exams/tests) are objects `{ id, label, subject, date, importance, minSessions, sessionMins }` edited in Manage → Assessments. `revisionPlanFor`/`assessmentRevisionTarget` (store.jsx) compute how many revision sessions to reserve before each: a `minSessions` floor, +2 if important, plus `assessmentStruggleBonus` (extra sessions driven by that subject's logged struggle ratings — capped). Tasks gain a `type` (`homework`/`revision`/`general`), `due`, `assessmentId`, and `reason` (shown on the task row title + Today).
- The **advisory planner** (`planSchedule`/`applyPlan` in store.jsx, `PlanReviewModal` in modals.jsx, opened via `'open-planner'` from the "Plan my schedule" buttons) proposes a whole schedule. It's **earliest-deadline-first**: homework (backlog, due-dated) and exam revision are split into sessions with a deadline (homework `due-1d`, exam `date-1d`) and an earliest date (revision only within a 14-day run-up window), placed deadline-soonest-first into the earliest valid block (one revision session per exam per day for spacing); general revision fills the rest of the current week. Non-destructive (fills FREE space, counts what's placed → re-run adds only the shortfall). Returns `{placements, unfit, horizon}`; `unfit` drives the overcommitment warning. The user reviews and clicks **Apply** — nothing is placed until then. `autoPlanWeek` is now superseded by this but kept in the code.
- `StoreShell` in `js/app.jsx` owns the state. **localStorage** (key `studyPlanner:v1:{uid}`) is always the instant local cache; **Firestore** (one doc per user: `studyPlanner/{uid}`, compat SDK) is the cross-device source of truth when signed in.
- **Critical invariant**: never write to Firestore before the initial remote fetch for that uid has resolved (`readyRef` guard in `StoreShell`). Writing early lets a fresh device push empty default state and clobber data synced from another device. Remote saves are debounced 700ms; local saves are synchronous on every `setState`.
- **Device-local scratch never syncs**: the running-session clock (`:session` key) and reminder de-dupe markers (`:notified` key) live in localStorage only — see `loadSession`/`saveSession`/`loadNotified` in store.jsx. They are per-device by nature; syncing the timer would push a per-second write to Firestore. `useStore()` exposes `uid` (added to the context in `StoreShell`) so components can key these.
- When `firebase-config.js` holds placeholder values, the app runs in **local-only mode**: a synthetic user with uid `'local'`, sign-in screen skippable, no remote sync.

### Domain concepts

- A **block** is a scheduled study slot; a concrete block instance is identified by `blockKey = "YYYY-MM-DD/slotId"` (`blockKeyOf`/`parseBlockKey` in store.jsx). A task with no `blockKey` lives in the backlog.
- **Recurring** items are templates with a weekly `target` count; dragging one into a block instantiates a task with `recurringId` linking back. Weekly progress is derived by counting placed tasks in the Mon-start week (`recurringDoneThisWeek`).
- Weeks always start Monday (`mondayOf`, `weekdayKey`). **All date math is LOCAL time**: `isoDate` formats `YYYY-MM-DD` from local getters (never `toISOString`, which is UTC and shifted stored block dates a day in +ve-UTC zones). `migrateState` (store.jsx) is a one-time, idempotent (`tzMigrated` flag) fixup that re-aligns pre-fix blockKeys/review keys to the weekday their slot belongs to; it runs in `loadState` and on the remote merge in `StoreShell`, pushing the corrected doc back up so devices converge.
- The **log** records completed sessions. Entries carry an optional `struggle` text note and a 1–5 `struggleRating`; `isStruggleEntry` (store.jsx) treats rating ≥ 4 *or* any note as a struggle. The Struggle Index (`js/log.jsx`) drives suggested **review** slots (`state.reviews`, keyed by blockKey). Timer-completed entries have `source:'timer'`, a `taskId` back-link (used to keep auto-logging idempotent), and `mins`.
- A long task can span **multiple sessions**: the `＋` on a task row (`addSessionFor`/`nextSessionBlock` in store.jsx) appends a linked follow-up task — same `seriesId`, incrementing `session` number — into the current block if it still fits ("at the end of the first") else the next block that does, respecting the activity one-per-day rule; falls back to backlog. Used for long Teams assignments split across days.
- A **session** (running timer) is for one task (`js/session.jsx`). Start via the `'start-session'`-style flow (`StartButton` → `startSession`); the `SessionTimer` bar is rendered app-wide in app.jsx. Finishing opens `RatingSheet`, which marks the task `done`/`doneAt` and writes one log entry. Completed tasks stay in their block (so they still count toward recurring targets) and render struck-through.
- **Auto-plan** (`autoPlanWeek` in store.jsx, surfaced as "Plan my week" on Today and Week) appends tasks to fill open blocks from remaining weekly targets. It is **non-destructive and idempotent**: it only adds, skips past days, and measures "remaining" against tasks already placed — so a second run adds nothing. **Hard rule: a recurring item is never placed twice on the same day** (one Piano/day is why it's 7×/wk); if there aren't enough distinct days it leaves the target short rather than doubling up. The same one-per-day rule is enforced for *activities* on manual placement too via `activityConflict` (used by the drop handlers in week.jsx/day.jsx and the inline composer) — subjects may still be doubled by hand.
- **Reminders** (`Reminders` in session.jsx) fire a browser `Notification` ~10 min before a block, but only while the app is open — a static PWA has no push backend. `scheduleNativeReminders` is a documented no-op placeholder for the future Expo native build (fire-when-closed).
- Subject colors are CSS custom properties in `app.css` named after the subject slug (`subjectColor()` maps "Computer Science" → `var(--computer-science)`); the taxonomy is `SUBJECTS_LIST` in store.jsx. Adding a subject means updating both.

### UI plumbing

- Routing is a hash router (`useHash` in components.jsx); routes `today` (default), `week`, `day`, `manage`, `log`, `schedule` map 1:1 to the view files. `today` is the landing screen — "what to do right now" plus the weekly payoff summary.
- Drag-and-drop state lives on `window.__drag` (not React state) with a `source` tag like `'block:KEY'`, `'backlog'`, `'recurring:ID'` — drop handlers branch on it.
- Cross-component actions use window CustomEvents (e.g. `'open-add-task'`) and the `toast()` helper.
- All styles are in the single `app.css`; dark theme only.

### Teams import

- `js/teams.jsx` imports **Microsoft Teams for Education assignments** into the one-off backlog. Auth is MSAL.js (CDN in index.html); config + gating live in `teams-config.js`, mirroring `firebase-config.js` — placeholder `clientId` means `STUDY_TEAMS_ENABLED` is false and the modal shows Azure setup steps instead of connecting. Flow: MSAL delegated token → Graph `/education/me/classes` then `/education/classes/{id}/assignments` → `TeamsImportModal` lists them with a guessed subject and a per-subject default duration (`subjectDefaultMins`, editable per row) → selected ones become backlog tasks with `source:'teams'` (lights the existing Teams badge) and a `teamsId` used to dedupe re-imports. Opened via the `'open-teams-import'` event (user menu + backlog rail). Long assignments are split later with the task-row `＋` (see sessions above).

### PWA

`sw.js` caches the app shell. Bump the `CACHE` version string on every release so old assets are evicted.
