// ─────────────────────────────────────────────────────────────
// week.jsx — Week view: sidebar (recurring) + days (stacked) + one-offs
// ─────────────────────────────────────────────────────────────

function WeekView() {
  const { state, set } = useStore();
  const [weekStart, setWeekStart] = React.useState(() => mondayOf(new Date()));
  const today = isoDate(new Date());

  // Drop handler — moves a task into a block, or removes-and-readds for recurring
  const handleDrop = React.useCallback((dragPayload, targetBlockKey) => {
    if (!dragPayload) return;
    const { task, source } = dragPayload;

    if (source === 'recurring' || source === 'subj-card') {
      // create a placement task from the recurring def
      const id = 't-' + Date.now() + '-' + Math.random().toString(36).slice(2,7);
      set(s => ({ ...s, tasks: [...s.tasks, {
        id, label: task.label, subject: task.subject, mins: task.mins,
        recurringId: task.recurringId, blockKey: targetBlockKey,
      }]}));
      toast(`Added ${task.label}`);
      return;
    }

    // From block or backlog: just reassign blockKey
    set(s => ({
      ...s,
      tasks: s.tasks.map(t => t.id === task.id ? { ...t, blockKey: targetBlockKey } : t),
    }));
  }, [set]);

  // Backlog drop — recurring/subj-card items don't belong in the one-off backlog
  const handleBacklogDrop = React.useCallback((dragPayload) => {
    if (!dragPayload) return;
    const { task, source } = dragPayload;
    if (source === 'recurring' || source === 'subj-card') return;
    set(s => ({ ...s, tasks: s.tasks.map(t => t.id === task.id ? { ...t, blockKey: null } : t) }));
  }, [set]);

  const removeTaskFromBlock = (taskId) => {
    set(s => {
      const t = s.tasks.find(x => x.id === taskId);
      // Recurring instances (created by dragging a subject card) don't have a
      // home in the backlog — delete them outright so they don't pollute one-offs.
      if (t && t.recurringId) return { ...s, tasks: s.tasks.filter(x => x.id !== taskId) };
      return { ...s, tasks: s.tasks.map(x => x.id === taskId ? { ...x, blockKey: null } : x) };
    });
  };

  const weekDates = weekDays(weekStart);
  const weekStartISO = isoDate(weekStart);

  const planWeek = () => {
    const adds = autoPlanWeek(state, weekStart);
    if (!adds.length) { toast("Nothing to add — this week is planned", { kind: 'voice' }); return; }
    set(s => ({ ...s, tasks: [...s.tasks, ...adds] }));
    toast(`Planned ${adds.length} session${adds.length > 1 ? 's' : ''}`, { kind: 'voice' });
  };

  return (
    <div className="main">
      <Sidebar weekStartDate={weekStart} weekStartISO={weekStartISO}/>
      <main className="content">
        <div className="week-toolbar">
          <button className="btn primary sm" onClick={planWeek} title="Fill open blocks from your weekly targets">✦ Plan my week</button>
          <span className="wt-hint">Fills open blocks from your weekly targets — never touches what you placed by hand.</span>
        </div>
        <WeekStrip viewStart={weekStart} onNavigate={setWeekStart}/>
        <div className="days">
          {weekDates.map(d => (
            <DayRow key={isoDate(d)} date={d} isToday={isoDate(d) === today}
              onDrop={handleDrop} onRemove={removeTaskFromBlock}/>
          ))}
        </div>
      </main>
      <RightRail onBacklogDrop={handleBacklogDrop}/>
    </div>
  );
}

// ── Day row (Mon, Tue, …) ────────────────────────────────────
function DayRow({ date, isToday, onDrop, onRemove }) {
  const { state } = useStore();
  const wk = weekdayKey(date);
  const slots = state.schedule[wk] || [];

  if (slots.length === 0) {
    return (
      <div className="day rest">
        <div className="day-head">
          <div className="day-name"><div className="dn">{wk}</div><div className="dd">{fmtDayShort(date)}</div></div>
          <div className="rest-meta">
            <span className="pill">rest</span>
            <span>no blocks scheduled</span>
          </div>
        </div>
      </div>
    );
  }

  const dateISO = isoDate(date);
  const dayUsed = slots.reduce((s,sl) => s + blockUsedMins(state, blockKeyOf(dateISO, sl.id)), 0);
  const dayTotal = slots.reduce((s,sl) => s + sl.mins, 0);
  const free = dayTotal - dayUsed;

  return (
    <div className="day">
      <div className="day-head">
        <div className={"day-name"+(isToday?' today':'')}>
          <div className="dn">{wk}</div><div className="dd">{fmtDayShort(date)}</div>
        </div>
        <div className="day-meta">
          <span className="day-mins"><b>{dayUsed}</b><span className="total">/{dayTotal}m</span></span>
          <span className="chip-tot">{slots.length} {slots.length===1?'block':'blocks'}</span>
          {free > 0 && <span className="chip-tot chip-free">{free}m free</span>}
        </div>
      </div>
      <div className={"blocks" + (slots.length === 1 ? ' single' : '')}>
        {slots.map(slot => (
          <BlockCell key={slot.id} dateISO={dateISO} slot={slot}
            onDrop={onDrop} onRemove={onRemove}/>
        ))}
      </div>
    </div>
  );
}

// ── Block cell ───────────────────────────────────────────────
function BlockCell({ dateISO, slot, onDrop, onRemove }) {
  const { state, set } = useStore();
  const [composerOpen, setComposerOpen] = React.useState(false);
  // Track whether a drag is currently hovering over this block.
  // We use a counter (not a boolean) so that entering/leaving child
  // elements doesn't flicker the highlight off unexpectedly.
  const [dropOver, setDropOver] = React.useState(false);
  const dragCounter = React.useRef(0);
  const blockKey = blockKeyOf(dateISO, slot.id);
  const tasks = tasksInBlock(state, blockKey);
  const review = state.reviews[blockKey];
  const used = blockUsedMins(state, blockKey);
  const over = used > slot.mins;
  const free = slot.mins - used;

  const onDragEnter = (e) => {
    e.preventDefault();
    dragCounter.current += 1;
    if (dragCounter.current === 1) setDropOver(true);
  };
  const onDragLeave = (e) => {
    dragCounter.current -= 1;
    if (dragCounter.current === 0) setDropOver(false);
  };
  const onDragOver = (e) => {
    e.preventDefault();
    // Match dropEffect to what the source declared via effectAllowed so
    // that Firefox (and strict browsers) don't silently cancel the drop.
    const d = getDrag();
    e.dataTransfer.dropEffect = (d && d.source === 'subj-card') ? 'copy' : 'move';
  };
  const onDropFn = (e) => {
    e.preventDefault();
    dragCounter.current = 0;
    setDropOver(false);
    const d = getDrag();
    if (d) onDrop(d, blockKey);
    clearDrag();
  };

  const removeReview = () => {
    set(s => {
      const next = { ...s.reviews };
      delete next[blockKey];
      return { ...s, reviews: next };
    });
  };

  return (
    <div className={"block" + (dropOver ? ' drop-target' : '')}
      onDragEnter={onDragEnter} onDragLeave={onDragLeave}
      onDragOver={onDragOver} onDrop={onDropFn}>
      <div className="block-head">
        <span className="lbl">{slot.label}</span>
        <span className="tm">{fmtTimeRangeShort(slot)}</span>
        <span className={"cap"+(over?' over':'')}>{used}/{slot.mins}m</span>
      </div>
      <div className="tasks">
        {tasks.map(t => (
          <TaskRow key={t.id} task={t} sourceBlockKey={blockKey}
            onRemove={() => onRemove(t.id)}/>
        ))}
        {review && (
          <div className="review" title="Review slot">
            <span className="glyph">↻</span>
            <span className="label">Review · {review.mins}m</span>
            <span className="from">{review.from ? `"${review.from}"` : 'open loops'}</span>
            <button className="change" onClick={removeReview} title="Remove review">remove</button>
          </div>
        )}
        {composerOpen ? (
          <InlineComposer blockKey={blockKey} slot={slot} free={free}
            onClose={() => setComposerOpen(false)}/>
        ) : tasks.length === 0 ? (
          <button className="drop" onClick={() => setComposerOpen(true)}>+ Add task ({free}m free)</button>
        ) : free > 0 ? (
          <button className="drop" onClick={() => setComposerOpen(true)}>+ {free}m free</button>
        ) : null}
      </div>
    </div>
  );
}

// ── Inline composer (click empty block to spawn) ────────────
function InlineComposer({ blockKey, slot, free, onClose }) {
  const { state, set } = useStore();
  const [q, setQ] = React.useState('');
  const [sel, setSel] = React.useState(0);
  const inputRef = React.useRef(null);
  React.useEffect(() => { inputRef.current?.focus(); }, []);

  const suggestions = React.useMemo(() => {
    const Q = q.trim().toLowerCase();
    const out = [];
    // Recurring (group: subject behind first, then activities, then on-track subjects)
    const wkStart = mondayOf(dateFromISO(parseBlockKey(blockKey).date));
    state.recurring.forEach(r => {
      const done = recurringDoneThisWeek(state, wkStart, r.id);
      const behind = r.target - done;
      if (!Q || r.label.toLowerCase().includes(Q) || r.subject.toLowerCase().includes(Q)) {
        out.push({ type:'recurring', rec:r, behind, done });
      }
    });
    out.sort((a, b) => {
      // behind first
      const aB = (a.behind > 0 && a.rec.group === 'subject') ? 1 : 0;
      const bB = (b.behind > 0 && b.rec.group === 'subject') ? 1 : 0;
      if (aB !== bB) return bB - aB;
      // then activities
      if (a.rec.group !== b.rec.group) return a.rec.group === 'activity' ? -1 : 1;
      return 0;
    });
    // Backlog tasks
    backlogTasks(state).forEach(t => {
      if (!Q || t.label.toLowerCase().includes(Q) || t.subject.toLowerCase().includes(Q)) {
        out.push({ type:'task', task:t });
      }
    });
    // create new
    if (Q.length > 0) out.push({ type:'create', label: q.trim() });
    return out;
  }, [q, state, blockKey]);

  const safeSel = Math.min(sel, Math.max(0, suggestions.length - 1));
  const current = suggestions[safeSel];

  const choose = (it) => {
    if (!it) return;
    if (it.type === 'recurring') {
      const r = it.rec;
      const id = 't-' + Date.now() + '-' + Math.random().toString(36).slice(2,7);
      set(s => ({ ...s, tasks: [...s.tasks, {
        id, label:r.label, subject:r.subject, mins:r.mins, recurringId:r.id, blockKey,
      }]}));
    } else if (it.type === 'task') {
      set(s => ({ ...s, tasks: s.tasks.map(t => t.id === it.task.id ? { ...t, blockKey } : t) }));
    } else if (it.type === 'create') {
      // open the full Add-task modal for fine control
      onClose();
      window.dispatchEvent(new CustomEvent('open-add-task', { detail:{ label: q.trim(), blockKey } }));
      return;
    }
    onClose();
  };

  const onKey = (e) => {
    if (e.key === 'Escape') { onClose(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(suggestions.length-1, s+1)); }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); setSel(s => Math.max(0, s-1)); }
    else if (e.key === 'Enter')     { e.preventDefault(); choose(current); }
  };

  return (
    <div className="inline-add">
      <input ref={inputRef} type="text" value={q} placeholder="Add a task… or type to search"
        onChange={e => { setQ(e.target.value); setSel(0); }} onKeyDown={onKey}
        onBlur={() => setTimeout(onClose, 100)}/>
      {suggestions.length > 0 && (
        <div className="inline-add-suggest">
          {suggestions.map((it, i) => {
            if (it.type === 'recurring') {
              const c = subjectColor(it.rec.subject);
              return (
                <div key={'r'+it.rec.id} className={"sgg-item"+(i===safeSel?' sel':'')}
                  onMouseDown={(e) => { e.preventDefault(); choose(it); }}
                  onMouseEnter={() => setSel(i)}>
                  <span className="bar3" style={{ background:c }}/>
                  <span className="name">{it.rec.label}</span>
                  {it.behind > 0 && it.rec.group === 'subject'
                    ? <span className="tag behind">{it.behind} behind</span>
                    : it.rec.group === 'activity'
                      ? <span className="tag">{it.done}/{it.rec.target} this wk</span>
                      : <span className="tag">on track</span>}
                  <span className="meta">{it.rec.mins}m</span>
                </div>
              );
            }
            if (it.type === 'task') {
              return (
                <div key={'t'+it.task.id} className={"sgg-item"+(i===safeSel?' sel':'')}
                  onMouseDown={(e) => { e.preventDefault(); choose(it); }}
                  onMouseEnter={() => setSel(i)}>
                  <span className="bar3" style={{ background:subjectColor(it.task.subject) }}/>
                  <span className="name">{it.task.label}</span>
                  <span className="tag">backlog</span>
                  <span className="meta">{it.task.mins}m</span>
                </div>
              );
            }
            return (
              <div key={'c'+i} className={"sgg-item"+(i===safeSel?' sel':'')}
                onMouseDown={(e) => { e.preventDefault(); choose(it); }}
                onMouseEnter={() => setSel(i)}>
                <span className="bar3" style={{ background:'var(--subtle)' }}/>
                <span className="name" style={{ color:'var(--muted)' }}>+ Create "{it.label}" as new task</span>
                <span className="kbd">↵</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Sidebar — Recurring (Subjects + Activities + Suggestions)
// ─────────────────────────────────────────────────────────────
function Sidebar({ weekStartDate, weekStartISO }) {
  const { state, set } = useStore();
  const [subjectsOpen, setSubjectsOpen] = React.useState(false);
  const [activitiesOpen, setActivitiesOpen] = React.useState(true);

  const subjects = state.recurring.filter(r => r.group === 'subject');
  const activities = state.recurring.filter(r => r.group === 'activity');

  const doneTotal = subjects.reduce((sum,r) => sum + recurringDoneThisWeek(state, weekStartDate, r.id), 0);
  const targetTotal = subjects.reduce((sum,r) => sum + r.target, 0);
  const behindCount = subjects.filter(r => recurringDoneThisWeek(state, weekStartDate, r.id) < r.target).length;

  return (
    <aside className="sidebar">
      <div className="h-row">
        <span className="h-label">Recurring</span>
        <button className="add" onClick={() => window.location.hash = 'manage'} title="Manage recurring">+</button>
      </div>

      {/* Subjects group */}
      <div className="group">
        <button className={"group-head"+(subjectsOpen?' open':'')} onClick={() => setSubjectsOpen(v => !v)}>
          <span className="chev">▶</span>
          <span className="name">Subjects</span>
          <span className="count">{doneTotal} / {targetTotal}</span>
        </button>
        {!subjectsOpen && (
          <div style={{ padding:'2px 12px 12px', display:'flex', alignItems:'center', gap:12 }}>
            <Ring done={doneTotal} target={targetTotal}/>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:12.5, color:'var(--ink-2)' }}>{doneTotal} of {targetTotal} done</div>
              {behindCount > 0 && (
                <div style={{ fontSize:12, color:'var(--ink-2)', marginTop:2, opacity:0.85,
                  display:'flex', alignItems:'center', gap:5 }}>
                  <span style={{ width:5, height:5, borderRadius:'50%', background:'var(--warn)' }}/>
                  {behindCount} behind
                </div>
              )}
            </div>
          </div>
        )}
        {subjectsOpen && (
          <div className="subj-cards">
            {subjects.map(r => {
              const done = recurringDoneThisWeek(state, weekStartDate, r.id);
              const isDone = done >= r.target;
              const c = subjectColor(r.subject);
              return (
                <div key={r.id} className={"subj-card"+(isDone?' done':'')}
                  draggable={!isDone}
                  onDragStart={(e) => {
                    if (isDone) { e.preventDefault(); return; }
                    setDrag({ task: { label:r.label, subject:r.subject, mins:r.mins, recurringId:r.id }, source: 'subj-card' });
                    e.dataTransfer.effectAllowed = 'copy';
                    e.dataTransfer.setData('text/plain', r.id);
                    e.currentTarget.classList.add('dragging');
                  }}
                  onDragEnd={(e) => { e.currentTarget.classList.remove('dragging'); clearDrag(); }}
                  title={isDone ? `${r.label} — done this week` : `Drag ${r.label} onto a block`}>
                  <div className="bar3" style={{ background:c }}/>
                  <div className="l">
                    <div className="name">{r.label}</div>
                    <div className="meta">{r.mins}m · <DotsProgress done={done} target={r.target} color={c}/></div>
                  </div>
                  {isDone ? <span className="check">✓</span> : <span className="grip">⋮⋮</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Activities group */}
      <div className="group">
        <button className={"group-head"+(activitiesOpen?' open':'')} onClick={() => setActivitiesOpen(v => !v)}>
          <span className="chev">▶</span>
          <span className="name">Activities</span>
          <span className="count">{activities.length}</span>
        </button>
        {activitiesOpen && (
          <div className="subj-cards">
            {activities.map(r => {
              const done = recurringDoneThisWeek(state, weekStartDate, r.id);
              const c = subjectColor(r.subject);
              return (
                <div key={r.id} className="subj-card"
                  draggable
                  onDragStart={(e) => {
                    setDrag({ task: { label:r.label, subject:r.subject, mins:r.mins, recurringId:r.id }, source: 'subj-card' });
                    e.dataTransfer.effectAllowed = 'copy';
                    e.dataTransfer.setData('text/plain', r.id);
                    e.currentTarget.classList.add('dragging');
                  }}
                  onDragEnd={(e) => { e.currentTarget.classList.remove('dragging'); clearDrag(); }}>
                  <div className="bar3" style={{ background:c }}/>
                  <div className="l">
                    <div className="name">{r.label}</div>
                    <div className="meta">{r.mins}m · {r.target}×/wk · <DotsProgress done={done} target={r.target} color={c}/></div>
                  </div>
                  <span className="grip">⋮⋮</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}

// Ring summary used in collapsed Subjects header
function Ring({ done, target, size=44 }) {
  const r = (size/2) - 5;
  const C = 2 * Math.PI * r;
  const pct = target > 0 ? Math.min(1, done/target) : 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#2C3849" strokeWidth="4"/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--accent)" strokeWidth="4"
        strokeDasharray={`${C*pct} ${C}`} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`}/>
      <text x={size/2} y={size/2+3.5} textAnchor="middle" fontFamily="JetBrains Mono" fontSize="9.5" fill="#B8BFCC">
        {done}/{target}
      </text>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// Right rail — one-off tasks (backlog)
// ─────────────────────────────────────────────────────────────
function RightRail({ onBacklogDrop }) {
  const { state, set } = useStore();
  const [over, setOver] = React.useState(false);
  const backlog = backlogTasks(state);

  const onDragOver = (e) => { e.preventDefault(); setOver(true); };
  const onDragLeave = () => setOver(false);
  const onDrop = (e) => {
    e.preventDefault(); setOver(false);
    const d = getDrag();
    if (d) onBacklogDrop(d);
    clearDrag();
  };
  const removeTask = (id) => set(s => ({ ...s, tasks: s.tasks.filter(t => t.id !== id) }));

  return (
    <aside className="right-rail" onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
      style={over ? { background:'rgba(129,140,248,0.04)' } : null}>
      <div className="h-row">
        <span className="h-label">One-off tasks</span>
        <button className="add" onClick={() => window.dispatchEvent(new CustomEvent('open-add-task'))}>+</button>
      </div>

      {backlog.length === 0 ? (
        <div className="empty" style={{ padding:'24px 8px' }}>
          <div className="glyph">∅</div>
          <h3>Backlog clear</h3>
          <p>Add one with <span className="kbd">+</span> or press <span className="kbd">Ctrl</span><span className="kbd">K</span>.</p>
        </div>
      ) : backlog.map(t => (
        <div key={t.id} className="oneoff" draggable
          onDragStart={(e) => {
            setDrag({ task:t, source:'backlog' });
            e.dataTransfer.effectAllowed = 'move';
            e.currentTarget.classList.add('dragging');
          }}
          onDragEnd={(e) => { e.currentTarget.classList.remove('dragging'); clearDrag(); }}>
          <div className="bar3" style={{ background:subjectColor(t.subject) }}/>
          <div className="l">
            <div className="name">{t.label}</div>
            <div className="meta">{t.mins}m{t.due ? <span className="due-soon"> · due {fmtDayShort(new Date(t.due+'T00:00:00'))}</span> : ' · no due date'}</div>
          </div>
          <button className="x" onClick={() => removeTask(t.id)}>✕</button>
        </div>
      ))}
    </aside>
  );
}

// ─────────────────────────────────────────────────────────────
// WeekStrip — last / this / next week summary cards
// ─────────────────────────────────────────────────────────────
function WeekStrip({ viewStart, onNavigate }) {
  const { state } = useStore();
  const today = new Date();
  const todayStr = isoDate(today);
  const thisWeek = mondayOf(today);

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const fmtRange = (ws) => {
    const end = addDays(ws, 6);
    const sm = MONTHS[ws.getMonth()], em = MONTHS[end.getMonth()];
    return sm === em
      ? `${sm} ${ws.getDate()} – ${end.getDate()}`
      : `${sm} ${ws.getDate()} – ${em} ${end.getDate()}`;
  };

  const getStats = (ws) => {
    const wsISO = isoDate(ws);
    const weISO = isoDate(addDays(ws, 7));
    let avail = 0, sched = 0, tasks = 0;
    weekDays(ws).forEach(d => {
      const dISO = isoDate(d);
      (state.schedule[weekdayKey(d)] || []).forEach(sl => {
        avail += sl.mins;
        const bk = blockKeyOf(dISO, sl.id);
        state.tasks.filter(t => t.blockKey === bk).forEach(t => {
          sched += t.mins || 0;
          tasks++;
        });
      });
    });
    const logged = (state.log || []).filter(e => e.date >= wsISO && e.date < weISO).length;
    return { avail, sched, tasks, logged };
  };

  const viewISO = isoDate(viewStart);
  const daysLeft = weekDays(thisWeek).filter(d => isoDate(d) >= todayStr).length;

  const cards = [
    { ws: addDays(thisWeek, -7), rel: 'past' },
    { ws: thisWeek,              rel: 'current' },
    { ws: addDays(thisWeek, 7),  rel: 'future' },
  ];

  return (
    <div className="week-strip">
      {cards.map(({ ws, rel }) => {
        const wsISO = isoDate(ws);
        const isActive = viewISO === wsISO;
        const isPast = rel === 'past';
        const isLive = rel === 'current';
        const isFuture = rel === 'future';
        const { avail, sched, tasks } = getStats(ws);
        const availHrs = Math.round(avail / 60 * 10) / 10;
        const schedHrs = Math.round(sched / 60 * 10) / 10;

        return (
          <div key={wsISO}
            className={"week-card" + (isActive ? ' active' : '') + (isLive ? ' live' : '') + (isPast ? ' past' : '')}
            onClick={() => onNavigate(ws)}>

            <div className="wc-top">
              <span className="wc-tag">
                {isPast && 'LAST WEEK'}
                {isLive && 'THIS WEEK · LIVE'}
                {isFuture && 'NEXT WEEK'}
              </span>
              {isLive  && <span className="wc-badge">this week</span>}
              {isPast  && <span className="wc-arrow">← past</span>}
              {isFuture && <span className="wc-arrow">→ next</span>}
            </div>

            <div className="wc-range">{fmtRange(ws)}</div>

            <div className="wc-stats">
              {isPast   && `${schedHrs} / ${availHrs} hrs · ${tasks} tasks done`}
              {isLive   && `${schedHrs} / ${availHrs} hrs scheduled · ${daysLeft} days left`}
              {isFuture && `${schedHrs} / ${availHrs} hrs · blocks ready · ${tasks} tasks`}
            </div>

            <div className="wc-voice">
              {isPast   && 'read-only · log is still editable'}
              {isLive   && 'where you spend most of your time'}
              {isFuture && 'drop tasks in early to spread the load'}
            </div>
          </div>
        );
      })}
    </div>
  );
}

Object.assign(window, { WeekView });
