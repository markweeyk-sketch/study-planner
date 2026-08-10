// ─────────────────────────────────────────────────────────────
// session.jsx — active study-session timer, completion → auto-log,
//               Start button, and block reminders.
// ─────────────────────────────────────────────────────────────
//
// The active session lives on window.__session (survives route changes
// and re-renders) and is mirrored to localStorage. It is DELIBERATELY
// never written to Firestore: a running clock is inherently per-device,
// and per-second syncing would hammer the debounced remote save. Only
// the start timestamp is persisted — elapsed time is derived live, so a
// reload (or the service worker refreshing the shell) resumes cleanly.

function setActiveSession(uid, s) {
  window.__session = s || null;
  saveSession(uid, s || null);
  window.dispatchEvent(new CustomEvent('session-changed'));
}

function startSession(uid, task) {
  setActiveSession(uid, {
    taskId: task.id,
    blockKey: task.blockKey || null,
    blockLabel: task.blockLabel || '',
    label: task.label,
    subject: task.subject,
    targetMins: task.mins || 0,
    startedAt: Date.now(),
  });
}

// Subscribe to session changes without owning the state.
function useSession() {
  const [, force] = React.useReducer(x => x + 1, 0);
  React.useEffect(() => {
    const fn = () => force();
    window.addEventListener('session-changed', fn);
    return () => window.removeEventListener('session-changed', fn);
  }, []);
  return window.__session || null;
}

function fmtElapsed(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60), ss = s % 60;
  return `${m}:${String(ss).padStart(2, '0')}`;
}

// ── Start button — drop onto any task row to begin a session ──
function StartButton({ task, blockLabel }) {
  const { uid } = useStore();
  const active = useSession();
  if (task.done) return <span className="task-done-chip">✓ done</span>;
  const isRunning = active && active.taskId === task.id;
  if (isRunning) return <span className="task-run-chip">● running</span>;
  return (
    <button className="btn sm primary start-btn"
      disabled={!!active}
      onClick={() => startSession(uid, { ...task, blockLabel })}
      title={active ? 'Finish the current session first' : 'Start this session'}>
      ▶ Start
    </button>
  );
}

// ── The persistent timer bar (rendered app-wide in app.jsx) ──
function SessionTimer() {
  const { set, uid } = useStore();
  const active = useSession();
  const [, tick] = React.useReducer(x => x + 1, 0);
  const [rating, setRating] = React.useState(false);

  // Resume the persisted session for this account on mount / account switch.
  React.useEffect(() => { setActiveSession(uid, loadSession(uid)); }, [uid]);

  // Tick once a second only while something is running (display only).
  React.useEffect(() => {
    if (!active) return;
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [active]);

  if (!active) return null;
  const elapsedMs = Date.now() - active.startedAt;
  const c = subjectColor(active.subject);

  const cancel = () => { setRating(false); setActiveSession(uid, null); toast('Session discarded'); };

  const complete = (struggleRating, note) => {
    const elapsedMin = Math.max(1, Math.round((Date.now() - active.startedAt) / 60000));
    const logMins = active.targetMins || elapsedMin;
    set(st => {
      const tasks = st.tasks.map(t => t.id === active.taskId
        ? { ...t, done: true, doneAt: new Date().toISOString() } : t);
      // Idempotent: one log entry per completed task.
      const log = (st.log || []).filter(e => e.taskId !== active.taskId);
      log.push({
        id: 'log-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        date: todayISO(),
        taskId: active.taskId,
        blockKey: active.blockKey,
        block: active.blockLabel || '',
        subject: active.subject,
        topic: active.label,
        mins: logMins,
        struggleRating: struggleRating || null,
        struggle: (note && note.trim()) || null,
        source: 'timer',
      });
      return { ...st, tasks, log };
    });
    setRating(false);
    setActiveSession(uid, null);
    toast('Logged · nice work', { kind: 'voice' });
  };

  return (
    <>
      <div className="session-bar">
        <span className="sb-bar3" style={{ background: c }}/>
        <div className="sb-main">
          <div className="sb-label">{active.label}</div>
          <div className="sb-meta">{active.subject}{active.blockLabel ? ` · ${active.blockLabel}` : ''}</div>
        </div>
        <div className="sb-clock mono">
          {fmtElapsed(elapsedMs)}
          {active.targetMins ? <span className="sb-target"> / {active.targetMins}m</span> : null}
        </div>
        <button className="btn sm" onClick={cancel}>Discard</button>
        <button className="btn sm primary" onClick={() => setRating(true)}>Done</button>
      </div>
      {rating && <RatingSheet label={active.label}
        onSubmit={complete} onCancel={() => setRating(false)}/>}
    </>
  );
}

// ── Post-session rating — turns finishing into the whole log ──
function RatingSheet({ label, onSubmit, onCancel }) {
  const [rating, setRating] = React.useState(0);
  const [note, setNote] = React.useState('');
  const LABELS = ['', 'Easy', 'OK', 'Fair', 'Tough', 'Struggled'];
  return (
    <Modal onClose={onCancel}>
      <div className="modal-head">
        <h3>How did that go?</h3>
        <button className="close" onClick={onCancel}>✕</button>
      </div>
      <div className="modal-body">
        <div className="field">
          <div className="field-label">{label}</div>
          <div className="rate-row">
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} className={"rate-dot" + (rating === n ? ' active' : '') + (n >= 4 ? ' hard' : '')}
                onClick={() => setRating(n)} title={LABELS[n]}>{n}</button>
            ))}
            <span className="rate-label">{rating ? LABELS[rating] : 'rate difficulty'}</span>
          </div>
        </div>
        <div className="field">
          <div className="field-label">What tripped you up?
            <span style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--subtle)', fontWeight: 400 }}> (optional — surfaces in reviews)</span>
          </div>
          <input className="input" placeholder="e.g. chain rule on composite trig"
            value={note} onChange={e => setNote(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') onSubmit(rating, note); }}/>
        </div>
      </div>
      <div className="modal-foot">
        <div className="hint">logs this session</div>
        <button className="btn ghost" onClick={() => onSubmit(0, '')}>Skip</button>
        <button className="btn primary" onClick={() => onSubmit(rating, note)}>Save &amp; log</button>
      </div>
    </Modal>
  );
}

// ── Reminders — nudge 10 min before a block while the app is open ──
// NOTE: a static PWA (no push backend) can only notify while it is
// running. True fire-when-closed reminders belong to the future Expo
// build — see scheduleNativeReminders() below, left as a placeholder.
function Reminders() {
  const { state, uid } = useStore();
  React.useEffect(() => {
    const check = () => {
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
      const now = new Date();
      const nowMin = now.getHours() * 60 + now.getMinutes();
      const dISO = isoDate(now);
      const prev = loadNotified(uid);
      const keys = (prev && prev.date === dISO) ? new Set(prev.keys) : new Set();
      (state.schedule[weekdayKey(now)] || []).forEach(sl => {
        const lead = parseTime(sl.start) - nowMin;
        const bk = blockKeyOf(dISO, sl.id);
        if (lead > 0 && lead <= 10 && !keys.has(bk)) {
          const first = tasksInBlock(state, bk).find(t => !t.done);
          const body = first ? `${sl.label} · ${first.label} (${first.mins}m)` : `${sl.label} block starts soon`;
          try { new Notification(`Study block in ${lead} min`, { body, tag: bk }); } catch (e) {}
          toast(`${sl.label} in ${lead}m`, { kind: 'voice' });
          keys.add(bk);
        }
      });
      saveNotified(uid, { date: dISO, keys: [...keys] });
    };
    check();
    const id = setInterval(check, 60000);
    return () => clearInterval(id);
  }, [state, uid]);
  return null;
}

// Placeholder for the Expo native build: OS-scheduled local notifications
// that fire even when the app is closed. No-op on the web.
function scheduleNativeReminders(/* schedule */) { /* TODO: Expo Notifications */ }

Object.assign(window, {
  setActiveSession, startSession, useSession, fmtElapsed,
  StartButton, SessionTimer, RatingSheet, Reminders, scheduleNativeReminders,
});
