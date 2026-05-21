// ─────────────────────────────────────────────────────────────
// modals.jsx — AddTaskModal, CommandPalette, SignInScreen, ReviewPicker
// ─────────────────────────────────────────────────────────────

// ── Generic modal wrapper ────────────────────────────────────
function Modal({ children, onClose }) {
  // Close on Esc
  React.useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Add Task modal
// Used for: creating a new one-off (target=backlog) OR placing into a block.
// Props: { onClose, defaultBlockKey?, defaultSubject? }
// ─────────────────────────────────────────────────────────────
function AddTaskModal({ onClose, defaultBlockKey, defaultSubject }) {
  const { state, set } = useStore();
  const [label, setLabel] = React.useState('');
  const [subject, setSubject] = React.useState(defaultSubject || 'Maths');
  const [mins, setMins] = React.useState(60);
  const [customMins, setCustomMins] = React.useState('');
  const [due, setDue] = React.useState('');
  const [blockKey, setBlockKey] = React.useState(defaultBlockKey || null);
  const inputRef = React.useRef(null);

  React.useEffect(() => { inputRef.current?.focus(); }, []);

  // Generate block options: current + next week's available blocks
  const blockOpts = React.useMemo(() => {
    const opts = [{ key: null, label: 'Add to backlog (one-off)' }];
    const wkStart = mondayOf(new Date());
    for (let w = 0; w < 2; w++) {
      const start = addDays(wkStart, w*7);
      weekDays(start).forEach(d => {
        const wk = weekdayKey(d);
        const slots = state.schedule[wk] || [];
        slots.forEach(slot => {
          const bk = blockKeyOf(isoDate(d), slot.id);
          const used = blockUsedMins(state, bk);
          const free = slot.mins - used;
          opts.push({
            key: bk,
            label: `${wk} ${fmtDayShort(d)} · ${slot.label}`,
            free, total: slot.mins,
          });
        });
      });
    }
    return opts;
  }, [state]);

  const onSave = () => {
    if (!label.trim()) return;
    const id = 't-' + Date.now() + '-' + Math.random().toString(36).slice(2,7);
    const task = {
      id, label: label.trim(), subject, mins: Number(mins) || 60,
      due: due || null, blockKey: blockKey || null,
    };
    set(s => ({ ...s, tasks: [...s.tasks, task] }));
    toast(blockKey ? 'Task scheduled' : 'Task added to backlog');
    onClose();
  };

  const onKey = (e) => {
    if ((e.key === 'Enter' && (e.ctrlKey || e.metaKey)) || (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA')) {
      e.preventDefault(); onSave();
    }
  };

  const minsPresets = [15, 30, 45, 60, 90, 120];
  const isCustom = !minsPresets.includes(Number(mins));

  return (
    <Modal onClose={onClose}>
      <div className="modal-head">
        <h3>New task</h3>
        <button className="close" onClick={onClose}>✕</button>
      </div>
      <div className="modal-body" onKeyDown={onKey}>
        <div className="field">
          <input ref={inputRef} className="input title" type="text" placeholder="What needs studying?"
            value={label} onChange={e=>setLabel(e.target.value)}/>
        </div>

        <div className="field">
          <div className="field-label">Subject</div>
          <div className="pill-row">
            {SUBJECTS_LIST.filter(s => s.key !== 'Custom').map(s => (
              <button key={s.key} className={"pill-btn"+(subject===s.key?' active':'')}
                onClick={() => setSubject(s.key)}>
                <span className="sw" style={{ background: subjectColor(s.key) }}/>
                {s.key === 'Computer Science' ? 'CS' : s.key}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <div className="field-label">Duration</div>
          <div className="pill-row">
            {minsPresets.map(m => (
              <button key={m} className={"pill-btn"+(Number(mins)===m?' active':'')}
                onClick={() => { setMins(m); setCustomMins(''); }}>
                {m}m
              </button>
            ))}
            <input type="number" className="input" style={{ width:80, padding:'4px 8px', fontSize:12 }}
              placeholder="custom" value={isCustom ? customMins || mins : customMins}
              onChange={e => { setCustomMins(e.target.value); setMins(Number(e.target.value)||0); }}/>
          </div>
        </div>

        <div className="field">
          <div className="field-label">Schedule into</div>
          <select className="input" value={blockKey || ''}
            onChange={e => setBlockKey(e.target.value || null)}>
            {blockOpts.map(o => (
              <option key={o.key || 'backlog'} value={o.key || ''}>
                {o.label}{o.free != null ? ` · ${o.free}m free of ${o.total}m` : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="field" style={{ marginBottom:6 }}>
          <div className="field-label">Due date <span style={{ textTransform:'none', letterSpacing:0, color:'var(--subtle)', fontWeight:400 }}>(optional)</span></div>
          <input className="input" type="date" value={due} onChange={e=>setDue(e.target.value)}/>
        </div>
      </div>
      <div className="modal-foot">
        <div className="hint"><span className="kbd">Ctrl</span><span className="kbd">↵</span> save</div>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={onSave} disabled={!label.trim()}>Add task</button>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────
// Command Palette — Ctrl+K
// ─────────────────────────────────────────────────────────────
function CommandPalette({ onClose }) {
  const { state, set } = useStore();
  const [q, setQ] = React.useState('');
  const [sel, setSel] = React.useState(0);
  const inputRef = React.useRef(null);

  React.useEffect(() => { inputRef.current?.focus(); }, []);

  // Build items: navigations + tasks (backlog) + recurring + "create new"
  const items = React.useMemo(() => {
    const out = [];
    const Q = q.trim().toLowerCase();
    // Navigations
    const navs = [
      { type:'nav', hash:'week',     label:'Go to Week view',     hint:'navigation' },
      { type:'nav', hash:'day',      label:'Go to Day view',      hint:'navigation' },
      { type:'nav', hash:'manage',   label:'Go to Manage',        hint:'navigation' },
      { type:'nav', hash:'log',      label:'Go to Log',           hint:'navigation' },
      { type:'nav', hash:'schedule', label:'Go to Schedule',      hint:'navigation' },
    ];
    navs.forEach(n => { if (!Q || n.label.toLowerCase().includes(Q)) out.push(n); });

    // Backlog tasks
    backlogTasks(state).forEach(t => {
      if (!Q || t.label.toLowerCase().includes(Q) || t.subject.toLowerCase().includes(Q)) {
        out.push({ type:'task', task:t, label:t.label, subject:t.subject, mins:t.mins, hint:'backlog · drag to a block' });
      }
    });

    // Recurring
    state.recurring.forEach(r => {
      if (!Q || r.label.toLowerCase().includes(Q) || r.subject.toLowerCase().includes(Q)) {
        out.push({ type:'recurring', rec:r, label:r.label, subject:r.subject, mins:r.mins, hint:`${r.target}×/wk · ${r.mins}m` });
      }
    });

    // Always offer "create new task with this name"
    if (Q.length > 0) {
      out.unshift({ type:'create', label: `Create "${q.trim()}" as new task`, hint:'opens add-task form' });
    }
    return out;
  }, [q, state]);

  const safeSel = items.length ? Math.min(sel, items.length-1) : 0;
  const current = items[safeSel];

  const choose = (it) => {
    if (!it) return;
    if (it.type === 'nav') { window.location.hash = it.hash; onClose(); return; }
    if (it.type === 'create') {
      onClose();
      // Defer opening to next tick so this modal unmounts first
      setTimeout(() => window.dispatchEvent(new CustomEvent('open-add-task', { detail:{ label: q.trim() } })), 0);
      return;
    }
    if (it.type === 'task') {
      // jump to week view, surface backlog item
      window.location.hash = 'week';
      toast(`"${it.task.label}" is in backlog — drag onto a block`);
      onClose();
      return;
    }
    if (it.type === 'recurring') {
      // create instance, put in backlog (user drags)
      const r = it.rec;
      const id = 't-' + Date.now();
      set(s => ({ ...s, tasks: [...s.tasks, { id, label:r.label, subject:r.subject, mins:r.mins, recurringId:r.id, blockKey:null }]}));
      toast(`Added "${r.label}" to backlog`);
      onClose();
      return;
    }
  };

  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(items.length-1, s+1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(0, s-1)); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(current); }
    else if (e.key === 'Escape') { onClose(); }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="palette" onClick={e => e.stopPropagation()}>
        <div className="palette-search">
          <span className="glyph">⌕</span>
          <input ref={inputRef} className="palette-input" type="text"
            placeholder="Search tasks, recurring, or pages…"
            value={q} onChange={e=>{ setQ(e.target.value); setSel(0); }}
            onKeyDown={onKey}/>
          <span className="kbd">esc</span>
        </div>
        <div className="palette-list">
          {items.length === 0 ? (
            <div className="palette-section">
              <div className="palette-head">No matches</div>
              <div style={{ padding:'10px 12px', color:'var(--muted)', fontSize:12.5 }}>
                Try typing a subject or task name.
              </div>
            </div>
          ) : (
            <div className="palette-section">
              {items.map((it, i) => (
                <div key={i} className={"palette-item"+(i===safeSel?' sel':'')}
                  onMouseEnter={() => setSel(i)}
                  onClick={() => choose(it)}>
                  <span className="bar3" style={{ background: it.subject ? subjectColor(it.subject) : 'var(--accent)' }}/>
                  <span className="name">{it.label}</span>
                  <span className="tag">{it.hint}</span>
                  {it.mins ? <span className="meta">{it.mins}m</span> : null}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="palette-foot">
          <span><span className="kbd">↑</span><span className="kbd">↓</span> navigate</span>
          <span><span className="kbd">↵</span> select</span>
          <span><span className="kbd">Esc</span> close</span>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Sign-in screen (rendered when no user yet)
// ─────────────────────────────────────────────────────────────
function SignInScreen({ onLocalContinue }) {
  const [email, setEmail] = React.useState('');
  const [pwd, setPwd] = React.useState('');
  const [err, setErr] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const enabled = !!window.STUDY_FIREBASE_ENABLED;

  const onGoogle = async () => {
    setErr(''); setBusy(true);
    try { await signInWithGoogle(); }
    catch (e) { setErr(e.message || 'Sign-in failed'); }
    finally { setBusy(false); }
  };
  const onEmail = async () => {
    if (!email || !pwd) { setErr('Enter email and password'); return; }
    setErr(''); setBusy(true);
    try { await signInWithEmail(email, pwd); }
    catch (e) { setErr(e.message || 'Sign-in failed'); }
    finally { setBusy(false); }
  };

  return (
    <div className="signin-wrap">
      <div className="signin-card">
        <div className="logo">S</div>
        <h1>Study Planner</h1>
        <p className="sub">Block-based study planner that fills itself with what you said you'd do.</p>

        {!enabled && (
          <>
            <button className="btn primary" onClick={onLocalContinue}>
              Continue (local-only)
            </button>
            <p style={{ fontSize:11.5, color:'var(--subtle)', textAlign:'center', margin:'12px 0 0', lineHeight:1.5 }}>
              Firebase not configured. Data lives in this browser only.
              <br/>Edit <span className="mono" style={{ color:'var(--ink-2)' }}>firebase-config.js</span> to enable sign-in.
            </p>
          </>
        )}

        {enabled && (
          <>
            <button className="btn google" onClick={onGoogle} disabled={busy}>
              <svg width="16" height="16" viewBox="0 0 48 48" style={{ display:'inline-block', verticalAlign:'middle' }}>
                <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6 8-11.3 8c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4C12.9 4 4 12.9 4 24s8.9 20 20 20s20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
                <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4C16.3 4 9.7 8.3 6.3 14.7z"/>
                <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.5-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.3 2.4c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
                <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.1 5.6l6.2 5.2c-.4.3 6.6-4.8 6.6-14.8c0-1.3-.1-2.4-.4-3.5z"/>
              </svg>
              Continue with Google
            </button>
            <div className="or">or</div>
            <input className="input" type="email" placeholder="Email"
              value={email} onChange={e=>setEmail(e.target.value)} style={{ marginBottom:8 }}/>
            <input className="input" type="password" placeholder="Password"
              value={pwd} onChange={e=>setPwd(e.target.value)}
              onKeyDown={e => e.key==='Enter' && onEmail()}/>
            <button className="btn primary" onClick={onEmail} disabled={busy} style={{ marginTop:10 }}>
              {busy ? 'Signing in…' : 'Sign in / Sign up'}
            </button>
            {err && <div className="err">{err}</div>}
            <div className="local"><a onClick={onLocalContinue}>or continue without an account</a></div>
          </>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { Modal, AddTaskModal, CommandPalette, SignInScreen });
