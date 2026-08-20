// ─────────────────────────────────────────────────────────────
// store.jsx — state, persistence (localStorage), auth, helpers
// ─────────────────────────────────────────────────────────────

const STORAGE_KEY_PREFIX = 'studyPlanner:v1:';
const ANON_UID = 'local';

// ─── Subject taxonomy ────────────────────────────────────────
const SUBJECTS_LIST = [
  { key:'Maths',            group:'subject' },
  { key:'Physics',          group:'subject' },
  { key:'Chemistry',        group:'subject' },
  { key:'Biology',          group:'subject' },
  { key:'Computer Science', group:'subject' },
  { key:'English',          group:'subject' },
  { key:'Mandarin',         group:'subject' },
  { key:'Business',         group:'subject' },
  { key:'Music',            group:'subject' },
  { key:'Piano',            group:'activity' },
  { key:'Coding',           group:'activity' },
  { key:'Custom',           group:'custom' },
];

function subjectColor(name) {
  if (!name) return 'var(--custom)';
  const slug = name.toLowerCase().replace(/\s+/g, '-');
  return `var(--${slug}, var(--custom))`;
}

// ─── Default seed data ───────────────────────────────────────
function defaultSchedule() {
  return {
    Mon:[{id:'mon-1',label:'Morning',start:'05:15',end:'06:45',mins:90},
         {id:'mon-2',label:'Afternoon',start:'16:30',end:'17:30',mins:60}],
    Tue:[{id:'tue-1',label:'Morning',start:'06:15',end:'06:45',mins:30},
         {id:'tue-2',label:'Afternoon',start:'16:30',end:'18:30',mins:120}],
    Wed:[{id:'wed-1',label:'Morning',start:'05:15',end:'06:45',mins:90},
         {id:'wed-2',label:'Afternoon',start:'16:30',end:'17:30',mins:60}],
    Thu:[],
    Fri:[{id:'fri-1',label:'Morning',start:'05:15',end:'06:45',mins:90}],
    Sat:[{id:'sat-1',label:'Morning',start:'07:30',end:'12:30',mins:300},
         {id:'sat-2',label:'Afternoon',start:'14:00',end:'18:30',mins:270}],
    Sun:[{id:'sun-1',label:'Morning',start:'07:45',end:'12:30',mins:285},
         {id:'sun-2',label:'Afternoon',start:'14:00',end:'18:00',mins:240}],
  };
}

function defaultRecurring() {
  return [
    {id:'rec-maths',  label:'Maths',            subject:'Maths',            target:2, mins:60, group:'subject'},
    {id:'rec-phys',   label:'Physics',          subject:'Physics',          target:2, mins:60, group:'subject'},
    {id:'rec-chem',   label:'Chemistry',        subject:'Chemistry',        target:2, mins:60, group:'subject'},
    {id:'rec-bio',    label:'Biology',          subject:'Biology',          target:2, mins:45, group:'subject'},
    {id:'rec-cs',     label:'Computer Science', subject:'Computer Science', target:2, mins:60, group:'subject'},
    {id:'rec-eng',    label:'English',          subject:'English',          target:1, mins:45, group:'subject'},
    {id:'rec-man',    label:'Mandarin',         subject:'Mandarin',         target:1, mins:45, group:'subject'},
    {id:'rec-biz',    label:'Business',         subject:'Business',         target:2, mins:45, group:'subject'},
    {id:'rec-mus',    label:'Music',            subject:'Music',            target:1, mins:45, group:'subject'},
    {id:'rec-piano',  label:'Piano practice',   subject:'Piano',            target:7, mins:30, group:'activity'},
    {id:'rec-code',   label:'Coding project',   subject:'Coding',           target:5, mins:60, group:'activity'},
  ];
}

function emptyState() {
  return {
    schedule: defaultSchedule(),
    recurring: defaultRecurring(),
    tasks: [],         // { id, label, subject, mins, due?, type?, assessmentId?, blockKey?, recurringId?, source? }
    log: [],           // { id, date, blockKey, subject, topic, struggle? }
    reviews: {},       // blockKey -> { logId, mins }  (the review slot in that block)
    assessments: [],   // { id, label, subject, date, importance, minSessions, sessionMins }
    weekStart: 'Mon',
    onboarded: false,
  };
}

// ─── Timezone migration (one-time) ───────────────────────────
// Data created before the isoDate/UTC fix stored some block dates a day
// off (in +ve-UTC zones). Re-align every blockKey's date to the weekday
// its slot actually belongs to. Idempotent via the tzMigrated flag, so it
// runs once per account then no-ops everywhere.
function migrateState(state) {
  if (!state || state.tzMigrated) return state;
  const slotWeekday = {};
  Object.keys(state.schedule || {}).forEach(wd => {
    (state.schedule[wd] || []).forEach(sl => { slotWeekday[sl.id] = wd; });
  });
  const fixDate = (dateISO, slotId) => {
    const wanted = slotWeekday[slotId];
    if (!wanted) return dateISO;                                  // unknown slot — leave it
    if (weekdayKey(dateFromISO(dateISO)) === wanted) return dateISO; // already correct
    for (const delta of [1, -1]) {
      const cand = isoDate(addDays(dateFromISO(dateISO), delta));
      if (weekdayKey(dateFromISO(cand)) === wanted) return cand;
    }
    return dateISO;                                               // can't reconcile — leave it
  };
  const tasks = (state.tasks || []).map(t => {
    if (!t.blockKey) return t;
    const { date, slotId } = parseBlockKey(t.blockKey);
    const nd = fixDate(date, slotId);
    return nd === date ? t : { ...t, blockKey: blockKeyOf(nd, slotId) };
  });
  const reviews = {};
  Object.keys(state.reviews || {}).forEach(k => {
    const { date, slotId } = parseBlockKey(k);
    reviews[blockKeyOf(fixDate(date, slotId), slotId)] = state.reviews[k];
  });
  return { ...state, tasks, reviews, tzMigrated: true };
}

// ─── Persistence ────────────────────────────────────────────
function storageKey(uid) { return STORAGE_KEY_PREFIX + (uid || ANON_UID); }

function loadState(uid) {
  try {
    const raw = localStorage.getItem(storageKey(uid));
    if (!raw) return migrateState(emptyState());
    const parsed = JSON.parse(raw);
    // shallow-merge to pick up any new keys added to emptyState
    return migrateState(Object.assign(emptyState(), parsed));
  } catch (e) {
    console.warn('Failed to load state', e);
    return migrateState(emptyState());
  }
}

function saveState(uid, state) {
  try {
    localStorage.setItem(storageKey(uid), JSON.stringify(state));
  } catch (e) {
    console.warn('Failed to save state', e);
  }
}

// ─── Device-local scratch (NEVER synced to Firestore) ────────
// The running-session clock and "already reminded" markers are
// inherently per-device; keeping them out of the synced state avoids
// per-second remote writes and cross-device reminder duplication.
function sessionStorageKey(uid) { return storageKey(uid) + ':session'; }
function loadSession(uid) {
  try { const r = localStorage.getItem(sessionStorageKey(uid)); return r ? JSON.parse(r) : null; }
  catch (e) { return null; }
}
function saveSession(uid, s) {
  try {
    if (s) localStorage.setItem(sessionStorageKey(uid), JSON.stringify(s));
    else localStorage.removeItem(sessionStorageKey(uid));
  } catch (e) { /* ignore */ }
}
function notifiedStorageKey(uid) { return storageKey(uid) + ':notified'; }
function loadNotified(uid) {
  try { const r = localStorage.getItem(notifiedStorageKey(uid)); return r ? JSON.parse(r) : null; }
  catch (e) { return null; }
}
function saveNotified(uid, v) {
  try { localStorage.setItem(notifiedStorageKey(uid), JSON.stringify(v)); } catch (e) { /* ignore */ }
}

// Layout preference is a per-device display setting ('auto' | 'panels' |
// 'stacked'), not per-account — it never syncs to Firestore.
const LAYOUT_PREF_KEY = 'studyPlanner:layout';
function loadLayoutPref() {
  try { return localStorage.getItem(LAYOUT_PREF_KEY) || 'auto'; } catch (e) { return 'auto'; }
}
function saveLayoutPref(v) {
  try { localStorage.setItem(LAYOUT_PREF_KEY, v); } catch (e) { /* ignore */ }
}

// ─── Auth ────────────────────────────────────────────────────
function authProvider() {
  if (window.STUDY_FIREBASE_ENABLED && window.firebase) {
    return window.firebase.auth();
  }
  return null;
}

function onAuthChanged(cb) {
  const auth = authProvider();
  if (auth) {
    return auth.onAuthStateChanged((user) => {
      cb(user ? { uid: user.uid, displayName: user.displayName, email: user.email, photoURL: user.photoURL } : null);
    });
  }
  // Local-only mode: emit a synthetic user immediately
  setTimeout(() => cb({ uid: ANON_UID, displayName: 'You', email: null, photoURL: null, local: true }), 0);
  return () => {};
}

async function signInWithGoogle() {
  const auth = authProvider();
  if (!auth) throw new Error('Firebase not configured');
  const provider = new window.firebase.auth.GoogleAuthProvider();
  await auth.signInWithPopup(provider);
}

async function signInWithEmail(email, password) {
  const auth = authProvider();
  if (!auth) throw new Error('Firebase not configured');
  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch (e) {
    if (e.code === 'auth/user-not-found' || e.code === 'auth/invalid-credential') {
      await auth.createUserWithEmailAndPassword(email, password);
    } else { throw e; }
  }
}

async function signOut() {
  const auth = authProvider();
  if (auth) await auth.signOut();
}

// ─── Firestore sync ──────────────────────────────────────────
// One document per user: studyPlanner/{uid}. Compat SDK, matches the
// auth setup above — no separate v9 modular import needed.
function firestoreDb() {
  if (window.STUDY_FIREBASE_ENABLED && window.firebase && window.firebase.firestore) {
    try { return window.firebase.firestore(); } catch (e) { return null; }
  }
  return null;
}

// Returns the remote state object, or null if there's no document yet
// (first sync for this account) or on any error. Callers treat both
// cases the same way — null means "nothing to overwrite local with".
async function loadRemoteState(uid) {
  const db = firestoreDb();
  if (!db) return null;
  try {
    const snap = await db.collection('studyPlanner').doc(uid).get();
    return snap.exists ? snap.data() : null;
  } catch (e) {
    console.warn('Failed to load remote state', e);
    return null;
  }
}

async function saveRemoteState(uid, state) {
  const db = firestoreDb();
  if (!db) return;
  try {
    await db.collection('studyPlanner').doc(uid).set(state);
  } catch (e) {
    console.warn('Failed to save remote state', e);
  }
}

// ─── Date helpers (week of Monday) ───────────────────────────
// Format a Date as YYYY-MM-DD in LOCAL time. Using toISOString() here (UTC)
// was a bug: in +ve-UTC zones it returned the previous day, so stored block
// dates drifted relative to weekdayKey/mondayOf (which are local). Keep all
// date helpers local so round-trips (isoDate∘dateFromISO) are stable.
function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function todayISO() { return isoDate(new Date()); }
function dateFromISO(s) { return new Date(s + 'T00:00:00'); }
function mondayOf(d) {
  const x = new Date(d);
  const day = x.getDay(); // 0=Sun..6=Sat
  const diff = (day === 0 ? -6 : 1 - day);
  x.setDate(x.getDate() + diff);
  x.setHours(0,0,0,0);
  return x;
}
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate()+n); return x; }
function weekDays(weekStartDate) {
  return Array.from({length:7}, (_,i) => addDays(weekStartDate, i));
}
const WEEKDAY_KEYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
function weekdayKey(d) { return WEEKDAY_KEYS[(d.getDay()+6) % 7]; } // Mon=0
function fmtDayShort(d) {
  const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()];
  return `${m} ${d.getDate()}`;
}

// blockKey = "YYYY-MM-DD/slotId"
function blockKeyOf(dateISO, slotId) { return `${dateISO}/${slotId}`; }
function parseBlockKey(k) {
  if (!k) return null;
  const [date, slotId] = k.split('/');
  return { date, slotId };
}

// ─── Derived helpers ─────────────────────────────────────────
function tasksInBlock(state, blockKey) {
  return state.tasks.filter(t => t.blockKey === blockKey);
}
function backlogTasks(state) {
  return state.tasks.filter(t => !t.blockKey);
}
function blockUsedMins(state, blockKey) {
  const tasks = tasksInBlock(state, blockKey);
  let sum = tasks.reduce((s,t) => s + (t.mins||0), 0);
  const r = state.reviews[blockKey];
  if (r) sum += r.mins || 0;
  return sum;
}
function recurringDoneThisWeek(state, weekStartDate, recurringId) {
  const wk = isoDate(weekStartDate);
  const wkEnd = isoDate(addDays(weekStartDate, 7));
  return state.tasks.filter(t => {
    if (t.recurringId !== recurringId) return false;
    if (!t.blockKey) return false;
    const { date } = parseBlockKey(t.blockKey);
    return date >= wk && date < wkEnd;
  }).length;
}

// ─── Auto-plan (idempotent, non-destructive) ─────────────────
// Fills a week's open blocks from recurring weekly targets. Returns
// the tasks to ADD — it never edits or removes what's already placed.
// Because "remaining" is measured against tasks already in the week,
// running it twice adds nothing the second time.
function autoPlanWeek(state, weekStartDate) {
  const today = todayISO();
  const days = weekDays(weekStartDate);
  const blocks = [];              // chronological, with live free-minutes
  const dayRecs = {};             // dISO -> Set(recurringId already placed that day)
  days.forEach(d => {
    const dISO = isoDate(d);
    dayRecs[dISO] = new Set(
      state.tasks
        .filter(t => t.blockKey && t.recurringId && parseBlockKey(t.blockKey).date === dISO)
        .map(t => t.recurringId)
    );
    (state.schedule[weekdayKey(d)] || []).forEach(slot => {
      const bk = blockKeyOf(dISO, slot.id);
      blocks.push({ bk, dISO, free: slot.mins - blockUsedMins(state, bk) });
    });
  });

  const wanted = state.recurring
    .map(r => ({ r, remaining: Math.max(0, r.target - recurringDoneThisWeek(state, weekStartDate, r.id)) }))
    .filter(x => x.remaining > 0)
    .sort((a, b) => {
      const ga = a.r.group === 'subject' ? 0 : 1, gb = b.r.group === 'subject' ? 0 : 1;
      if (ga !== gb) return ga - gb;          // subjects before activities
      return b.remaining - a.remaining;        // most behind first
    });

  // Hard rule: a recurring item is never placed twice on the same day. If
  // there aren't enough distinct days to meet a weekly target we leave it
  // short rather than doubling up — that's why e.g. Piano is 7×/wk (one a day).
  const additions = [];
  const place = (r) => {
    for (const blk of blocks) {
      if (blk.dISO < today) continue;          // don't plan into the past
      if (blk.free < r.mins) continue;
      if (dayRecs[blk.dISO].has(r.id)) continue;
      additions.push({
        id: 't-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
        label: r.label, subject: r.subject, mins: r.mins,
        recurringId: r.id, blockKey: blk.bk, auto: true,
      });
      blk.free -= r.mins;
      dayRecs[blk.dISO].add(r.id);
      return true;
    }
    return false;
  };

  wanted.forEach(({ r, remaining }) => {
    let n = remaining;
    while (n > 0 && place(r)) n--;
  });
  return additions;
}

// Guard for manual placement: an activity is scheduled at most once per day.
// Returns a human message if placing `recurringId` into `dateISO` would
// duplicate an activity that day (ignoring `exceptTaskId`), else null.
function activityConflict(state, recurringId, dateISO, exceptTaskId) {
  if (!recurringId) return null;
  const r = state.recurring.find(x => x.id === recurringId);
  if (!r || r.group !== 'activity') return null;
  const clash = state.tasks.some(t =>
    t.id !== exceptTaskId && t.recurringId === recurringId &&
    t.blockKey && parseBlockKey(t.blockKey).date === dateISO);
  return clash ? `${r.label} is already scheduled ${weekdayKey(dateFromISO(dateISO))}` : null;
}

// ─── Sessions (split a long task across blocks) ──────────────
// A task represents one study session. A long assignment can need several,
// linked by a shared `seriesId`. nextSessionBlock finds where a follow-up
// session should land: the current block if it still has room ("at the end
// of the first"), otherwise the earliest later block that fits — respecting
// the activity one-per-day rule. Returns a blockKey, or null for the backlog.
function nextSessionBlock(state, task) {
  const cur = parseBlockKey(task.blockKey);
  if (!cur) return null;
  const mins = task.mins || 0;
  const start = dateFromISO(cur.date);
  for (let off = 0; off < 21; off++) {
    const d = addDays(start, off);
    const dISO = isoDate(d);
    // Activities never repeat within a day — skip the whole day if it clashes.
    if (activityConflict(state, task.recurringId, dISO, null)) continue;
    const slots = state.schedule[weekdayKey(d)] || [];
    let startIdx = 0;
    if (off === 0) {
      const ci = slots.findIndex(sl => sl.id === cur.slotId);
      startIdx = ci < 0 ? 0 : ci; // include the current block as the first candidate
    }
    for (let i = startIdx; i < slots.length; i++) {
      const bk = blockKeyOf(dISO, slots[i].id);
      if (slots[i].mins - blockUsedMins(state, bk) >= mins) return bk;
    }
  }
  return null;
}

// Append one more session for `task`, grouped by seriesId. Places it via
// nextSessionBlock (or backlog if nothing fits). Mutates through `set`.
function addSessionFor(state, set, task) {
  const seriesId = task.seriesId || task.id;
  const bk = nextSessionBlock(state, task);
  const seriesCount = state.tasks.filter(x => (x.seriesId || x.id) === seriesId).length;
  const newTask = {
    id: 't-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
    label: task.label, subject: task.subject, mins: task.mins,
    recurringId: task.recurringId || null, blockKey: bk,
    source: task.source || null, due: task.due || null,
    seriesId, session: seriesCount + 1,
  };
  set(s => ({
    ...s,
    tasks: s.tasks.map(x => x.id === task.id ? { ...x, seriesId, session: x.session || 1 } : x).concat(newTask),
  }));
  toast(bk ? 'Follow-up session added' : 'Session queued to backlog — no room after', { kind: 'voice' });
}

// ─── Payoff (streaks + weekly recap) ─────────────────────────
function currentStreak(state) {
  const dates = new Set((state.log || []).map(e => e.date));
  let d = new Date();
  if (!dates.has(isoDate(d))) d = addDays(d, -1); // today not yet logged is OK
  let n = 0;
  while (dates.has(isoDate(d))) { n++; d = addDays(d, -1); }
  return n;
}
function isStruggleEntry(e) {
  return !!((e.struggle && e.struggle.trim()) || (e.struggleRating && e.struggleRating >= 4));
}
function weeklyRecap(state, weekStartDate) {
  const wsISO = isoDate(weekStartDate);
  const weISO = isoDate(addDays(weekStartDate, 7));
  const sessions = (state.log || []).filter(e => e.date >= wsISO && e.date < weISO);
  const subjects = state.recurring.filter(r => r.group === 'subject');
  return {
    count: sessions.length,
    mins: sessions.reduce((s, e) => s + (e.mins || 0), 0),
    subjectsHit: subjects.filter(r => recurringDoneThisWeek(state, weekStartDate, r.id) >= r.target).length,
    subjectsTotal: subjects.length,
    struggles: sessions.filter(isStruggleEntry).length,
  };
}

// ─── Assessments (exams) & the revision-budget brain ─────────
function daysUntil(dateISO) {
  return Math.round((dateFromISO(dateISO) - dateFromISO(todayISO())) / 86400000);
}

// Extra revision sessions earned by how much you've struggled in a subject.
// Uses only the signal you actually produce (logged struggle ratings/notes),
// so it's personalised and defensible — not a made-up number. Capped.
function assessmentStruggleBonus(state, subject) {
  const entries = (state.log || []).filter(e =>
    e.subject === subject && (e.struggleRating || (e.struggle && e.struggle.trim())));
  if (!entries.length) return 0;
  const rated = entries.filter(e => e.struggleRating);
  const avg = rated.length ? rated.reduce((s, e) => s + e.struggleRating, 0) / rated.length : 0;
  const hardCount = entries.filter(isStruggleEntry).length;
  let bonus = 0;
  if (avg >= 4) bonus += 2; else if (avg >= 3.2) bonus += 1;
  if (hardCount >= 3) bonus += 1;
  return Math.min(bonus, 4);
}

// How many revision sessions to aim for before an assessment: a minimum
// floor, +2 if flagged important, plus the struggle bonus above.
function revisionPlanFor(state, a) {
  const min = a.minSessions != null ? a.minSessions : 3;
  const importanceBonus = (a.importance || 2) >= 3 ? 2 : 0;
  const struggleBonus = assessmentStruggleBonus(state, a.subject);
  return { min, importanceBonus, struggleBonus, total: min + importanceBonus + struggleBonus };
}
function assessmentRevisionTarget(state, a) { return revisionPlanFor(state, a).total; }

// Assessments from today forward, soonest first.
function upcomingAssessments(state) {
  const today = todayISO();
  return (state.assessments || [])
    .filter(a => a.date >= today)
    .sort((x, y) => x.date.localeCompare(y.date));
}

// ─── The advisory planner (Increment 2) ──────────────────────
// Earliest-deadline-first: the classic, provably-good way to meet deadlines
// on a single limited resource (your blocks). Homework and exam revision are
// broken into sessions, each with a deadline (homework due-1d buffer; exam
// date-1d) and an earliest date (revision only within its run-up window), then
// placed deadline-soonest-first into the earliest valid block. General revision
// fills whatever's left. Non-destructive: it only ever fills FREE space, and
// counts what's already placed, so re-running adds only the shortfall.
const REV_WINDOW_DAYS = 14, HW_BUFFER_DAYS = 1, HW_SESSION_MAX = 90;
let __pid = 0;
function newTaskId() { return 't-' + Date.now() + '-' + (++__pid) + Math.random().toString(36).slice(2, 5); }
function maxISO(a, b) { return a > b ? a : b; }
function splitIntoSessions(totalMins, chunk) {
  chunk = chunk || HW_SESSION_MAX;
  let rem = totalMins || chunk; const out = [];
  if (rem <= 0) rem = chunk;
  while (rem > 0) { const m = Math.min(chunk, rem); out.push(m); rem -= m; }
  return out;
}

function planSchedule(state) {
  const today = todayISO();
  const deadlines = [
    ...(state.assessments || []).filter(a => a.date > today).map(a => a.date),
    ...state.tasks.filter(t => !t.recurringId && t.due && !t.done && !t.blockKey).map(t => t.due),
  ].sort();
  const last = deadlines[deadlines.length - 1];
  const horizon = last
    ? maxISO(isoDate(addDays(dateFromISO(last), 2)), isoDate(addDays(dateFromISO(today), 13)))
    : isoDate(addDays(dateFromISO(today), 13));

  // Supply: blocks today→horizon with their remaining free minutes.
  const blocks = [];
  const dayKeys = {}; // dISO -> { rec:Set(recurringId), exam:Set(assessmentId) } for spacing
  for (let d = dateFromISO(today); isoDate(d) <= horizon; d = addDays(d, 1)) {
    const dISO = isoDate(d);
    dayKeys[dISO] = { rec: new Set(), exam: new Set() };
    (state.schedule[weekdayKey(d)] || []).forEach(slot => {
      const bk = blockKeyOf(dISO, slot.id);
      blocks.push({ bk, dISO, label: slot.label, free: slot.mins - blockUsedMins(state, bk) });
    });
  }
  state.tasks.filter(t => t.blockKey).forEach(t => {
    const dt = parseBlockKey(t.blockKey).date;
    if (!dayKeys[dt]) return;
    if (t.recurringId) dayKeys[dt].rec.add(t.recurringId);
    if (t.assessmentId) dayKeys[dt].exam.add(t.assessmentId);
  });

  const placements = [], unfit = [];

  // Commitments: homework sessions + exam-revision sessions.
  const commitments = [];
  state.tasks.filter(t => !t.recurringId && t.due && !t.done && !t.blockKey).forEach(t => {
    const parts = splitIntoSessions(t.mins || 60, HW_SESSION_MAX);
    parts.forEach((m, i) => commitments.push({
      kind: 'homework', taskId: t.id, label: t.label, subject: t.subject, mins: m,
      earliest: today, deadline: isoDate(addDays(dateFromISO(t.due), -HW_BUFFER_DAYS)),
      part: i, parts: parts.length, due: t.due,
    }));
  });
  (state.assessments || []).filter(a => a.date > today).forEach(a => {
    const need = Math.max(0, assessmentRevisionTarget(state, a) - state.tasks.filter(t => t.assessmentId === a.id).length);
    const winStart = maxISO(today, isoDate(addDays(dateFromISO(a.date), -REV_WINDOW_DAYS)));
    const deadline = isoDate(addDays(dateFromISO(a.date), -1));
    const struggle = assessmentStruggleBonus(state, a.subject);
    for (let i = 0; i < need; i++) commitments.push({
      kind: 'revision', assessmentId: a.id, label: 'Revise ' + a.subject, subject: a.subject,
      mins: a.sessionMins || 45, earliest: winStart, deadline, examDate: a.date, examLabel: a.label, struggle,
    });
  });
  commitments.sort((x, y) =>
    x.deadline.localeCompare(y.deadline) || x.earliest.localeCompare(y.earliest) ||
    (x.kind === y.kind ? 0 : x.kind === 'homework' ? -1 : 1));

  commitments.forEach(c => {
    const b = blocks.find(bl => bl.dISO >= c.earliest && bl.dISO <= c.deadline && bl.free >= c.mins &&
      (c.kind === 'revision' ? !dayKeys[bl.dISO].exam.has(c.assessmentId) : true));
    if (!b) { unfit.push(c); return; }
    b.free -= c.mins;
    if (c.kind === 'revision') dayKeys[b.dISO].exam.add(c.assessmentId);
    const reason = c.kind === 'homework'
      ? 'Due ' + fmtDayShort(dateFromISO(c.due)) + (c.parts > 1 ? ` · part ${c.part + 1}/${c.parts}` : '')
      : `${c.examLabel || c.subject} exam · ${daysUntil(c.examDate)}d out` + (c.struggle ? ' · extra (struggling)' : '');
    placements.push({ bk: b.bk, dISO: b.dISO, blockLabel: b.label, kind: c.kind, label: c.label, subject: c.subject,
      mins: c.mins, reason, taskId: c.taskId, assessmentId: c.assessmentId });
  });

  // General revision fills the rest of THIS WEEK from weekly targets.
  const weekStart = mondayOf(dateFromISO(today));
  const weekEnd = isoDate(addDays(weekStart, 7));
  state.recurring.map(r => ({ r, remaining: Math.max(0, r.target - recurringDoneThisWeek(state, weekStart, r.id)) }))
    .filter(x => x.remaining > 0)
    .sort((a, b) => (a.r.group === 'subject' ? 0 : 1) - (b.r.group === 'subject' ? 0 : 1) || b.remaining - a.remaining)
    .forEach(({ r, remaining }) => {
      let n = remaining;
      while (n > 0) {
        const b = blocks.find(bl => bl.dISO >= today && bl.dISO < weekEnd && bl.free >= r.mins && !dayKeys[bl.dISO].rec.has(r.id));
        if (!b) break;
        b.free -= r.mins; dayKeys[b.dISO].rec.add(r.id);
        placements.push({ bk: b.bk, dISO: b.dISO, blockLabel: b.label, kind: 'general', label: r.label, subject: r.subject, mins: r.mins, reason: 'Weekly revision', recurringId: r.id });
        n--;
      }
    });

  placements.sort((a, b) => a.bk.localeCompare(b.bk));
  return { placements, unfit, horizon };
}

// Convert an accepted plan into tasks (non-destructive add/assign).
function applyPlan(state, placements) {
  const byTask = {};
  placements.filter(p => p.kind === 'homework').forEach(p => { (byTask[p.taskId] = byTask[p.taskId] || []).push(p); });
  let tasks = state.tasks.map(t => {
    const ps = byTask[t.id];
    if (!ps) return t;
    return { ...t, blockKey: ps[0].bk, mins: ps[0].mins, type: 'homework', reason: ps[0].reason, seriesId: ps.length > 1 ? t.id : t.seriesId };
  });
  Object.keys(byTask).forEach(tid => {
    const ps = byTask[tid]; if (ps.length <= 1) return;
    const base = state.tasks.find(t => t.id === tid);
    ps.slice(1).forEach((p, i) => tasks.push({
      id: newTaskId(), label: base.label, subject: base.subject, mins: p.mins, due: base.due || null,
      blockKey: p.bk, type: 'homework', source: base.source || null, seriesId: tid, session: i + 2, reason: p.reason,
    }));
  });
  placements.filter(p => p.kind === 'revision').forEach(p => tasks.push({
    id: newTaskId(), label: p.label, subject: p.subject, mins: p.mins, blockKey: p.bk,
    type: 'revision', assessmentId: p.assessmentId, reason: p.reason,
  }));
  placements.filter(p => p.kind === 'general').forEach(p => tasks.push({
    id: newTaskId(), label: p.label, subject: p.subject, mins: p.mins, blockKey: p.bk,
    recurringId: p.recurringId, type: 'general', reason: p.reason,
  }));
  return { ...state, tasks };
}

// ─── Reminders (browser Notification permission) ─────────────
function reminderPermission() {
  return (typeof Notification !== 'undefined') ? Notification.permission : 'unsupported';
}
async function requestReminderPermission() {
  if (typeof Notification === 'undefined') return 'unsupported';
  try { return await Notification.requestPermission(); } catch (e) { return 'denied'; }
}

// ─── Reducer ─────────────────────────────────────────────────
function makeStore(initial) {
  let state = initial;
  const subs = new Set();
  function set(updater) {
    state = typeof updater === 'function' ? updater(state) : updater;
    subs.forEach(fn => fn(state));
  }
  function get() { return state; }
  function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }
  return { get, set, subscribe };
}

// expose
Object.assign(window, {
  STORAGE_KEY_PREFIX, ANON_UID,
  SUBJECTS_LIST, subjectColor,
  defaultSchedule, defaultRecurring, emptyState,
  migrateState, loadState, saveState,
  loadSession, saveSession, loadNotified, saveNotified,
  loadLayoutPref, saveLayoutPref,
  onAuthChanged, signInWithGoogle, signInWithEmail, signOut,
  firestoreDb, loadRemoteState, saveRemoteState,
  todayISO, dateFromISO, isoDate, mondayOf, addDays, weekDays,
  WEEKDAY_KEYS, weekdayKey, fmtDayShort,
  blockKeyOf, parseBlockKey,
  tasksInBlock, backlogTasks, blockUsedMins, recurringDoneThisWeek,
  autoPlanWeek, activityConflict, nextSessionBlock, addSessionFor,
  currentStreak, isStruggleEntry, weeklyRecap,
  daysUntil, assessmentStruggleBonus, revisionPlanFor, assessmentRevisionTarget, upcomingAssessments,
  planSchedule, applyPlan, splitIntoSessions,
  reminderPermission, requestReminderPermission,
  makeStore,
});
