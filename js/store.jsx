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
    tasks: [],         // { id, label, subject, mins, due?, blockKey?, recurringId?, source? }
    log: [],           // { id, date, blockKey, subject, topic, struggle? }
    reviews: {},       // blockKey -> { logId, mins }  (the review slot in that block)
    weekStart: 'Mon',
    onboarded: false,
  };
}

// ─── Persistence ────────────────────────────────────────────
function storageKey(uid) { return STORAGE_KEY_PREFIX + (uid || ANON_UID); }

function loadState(uid) {
  try {
    const raw = localStorage.getItem(storageKey(uid));
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw);
    // shallow-merge to pick up any new keys added to emptyState
    return Object.assign(emptyState(), parsed);
  } catch (e) {
    console.warn('Failed to load state', e);
    return emptyState();
  }
}

function saveState(uid, state) {
  try {
    localStorage.setItem(storageKey(uid), JSON.stringify(state));
  } catch (e) {
    console.warn('Failed to save state', e);
  }
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
function todayISO() { return new Date().toISOString().slice(0,10); }
function dateFromISO(s) { return new Date(s + 'T00:00:00'); }
function isoDate(d) { return d.toISOString().slice(0,10); }
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
  loadState, saveState,
  onAuthChanged, signInWithGoogle, signInWithEmail, signOut,
  firestoreDb, loadRemoteState, saveRemoteState,
  todayISO, dateFromISO, isoDate, mondayOf, addDays, weekDays,
  WEEKDAY_KEYS, weekdayKey, fmtDayShort,
  blockKeyOf, parseBlockKey,
  tasksInBlock, backlogTasks, blockUsedMins, recurringDoneThisWeek,
  makeStore,
});
