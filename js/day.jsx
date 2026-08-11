// ─────────────────────────────────────────────────────────────
// day.jsx — focused single-day view
// ─────────────────────────────────────────────────────────────

function DayView() {
  const { state, set } = useStore();
  const [date, setDate] = React.useState(() => new Date());
  const dateISO = isoDate(date);
  const wk = weekdayKey(date);
  const slots = state.schedule[wk] || [];

  // Recurring instances have no home in the backlog — delete them outright
  // on remove instead of orphaning them there (matches the Week view).
  const removeTask = (id) => set(s => {
    const t = s.tasks.find(x => x.id === id);
    if (t && t.recurringId) return { ...s, tasks: s.tasks.filter(x => x.id !== id) };
    return { ...s, tasks: s.tasks.map(x => x.id === id ? { ...x, blockKey: null } : x) };
  });

  const handleDrop = (dragPayload, targetBlockKey) => {
    if (!dragPayload) return;
    const { task, source } = dragPayload;
    const { date } = parseBlockKey(targetBlockKey);
    if (source === 'recurring' || source === 'subj-card') {
      const conflict = activityConflict(state, task.recurringId, date, null);
      if (conflict) { toast(conflict, { kind:'warn' }); return; }
      const id = 't-' + Date.now() + '-' + Math.random().toString(36).slice(2,7);
      set(s => ({ ...s, tasks: [...s.tasks, {
        id, label:task.label, subject:task.subject, mins:task.mins,
        recurringId:task.recurringId, blockKey:targetBlockKey,
      }]}));
      return;
    }
    const conflict = activityConflict(state, task.recurringId, date, task.id);
    if (conflict) { toast(conflict, { kind:'warn' }); return; }
    set(s => ({ ...s, tasks: s.tasks.map(t => t.id === task.id ? { ...t, blockKey:targetBlockKey } : t) }));
  };

  // Today's stats
  const used = slots.reduce((s, sl) => s + blockUsedMins(state, blockKeyOf(dateISO, sl.id)), 0);
  const total = slots.reduce((s, sl) => s + sl.mins, 0);

  return (
    <div className="main no-right">
      <Sidebar weekStartDate={mondayOf(date)} weekStartISO={isoDate(mondayOf(date))}/>
      <main className="content">
        <div className="content-head">
          <div>
            <h1>{wk} · {fmtDayShort(date)}</h1>
            <div className="sub">
              {slots.length === 0
                ? 'rest day · no blocks'
                : <>{used} of {total} minutes scheduled · {total - used}m free</>}
            </div>
          </div>
          <div className="week-nav">
            <button onClick={() => setDate(addDays(date, -1))} title="Previous day">◀</button>
            <button className={dateISO === isoDate(new Date()) ? 'today' : ''}
              onClick={() => setDate(new Date())}>Today</button>
            <button onClick={() => setDate(addDays(date, 1))} title="Next day">▶</button>
          </div>
        </div>

        {slots.length === 0 ? (
          <div className="empty">
            <div className="glyph">☾</div>
            <h3>Rest day</h3>
            <p>No study blocks. Use <a onClick={()=>window.location.hash='schedule'} style={{color:'var(--ink-2)',cursor:'pointer'}}>Schedule</a> to change.</p>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:14, maxWidth:720 }}>
            {slots.map(slot => (
              <DayBlock key={slot.id} dateISO={dateISO} slot={slot}
                onDrop={handleDrop} onRemove={removeTask}/>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function DayBlock({ dateISO, slot, onDrop, onRemove }) {
  const { state, set } = useStore();
  const [composerOpen, setComposerOpen] = React.useState(false);
  const blockKey = blockKeyOf(dateISO, slot.id);
  const tasks = tasksInBlock(state, blockKey);
  const review = state.reviews[blockKey];
  const used = blockUsedMins(state, blockKey);
  const over = used > slot.mins;
  const free = slot.mins - used;

  const onDragOver = (e) => {
    e.preventDefault();
    // Match dropEffect to what the source declared (subject/activity cards
    // drag with effectAllowed='copy'); a mismatch makes the browser reject
    // the drop, which is why activities couldn't be dragged in before.
    const d = getDrag();
    e.dataTransfer.dropEffect = (d && d.source === 'subj-card') ? 'copy' : 'move';
  };
  const onDropFn = (e) => {
    e.preventDefault();
    const d = getDrag();
    if (d) onDrop(d, blockKey);
    clearDrag();
  };

  const removeReview = () => {
    set(s => { const next = {...s.reviews}; delete next[blockKey]; return { ...s, reviews:next }; });
  };

  return (
    <div className="day" style={{ borderColor:'var(--border-2)' }} onDragOver={onDragOver} onDrop={onDropFn}>
      <div className="day-head" style={{ padding:'12px 16px' }}>
        <div className="day-name" style={{ width:'auto' }}>
          <div className="dn" style={{ fontSize:16 }}>{slot.label}</div>
          <div className="dd">{fmtTimeRange(slot)}</div>
        </div>
        <div className="day-meta">
          <span className="day-mins"><b>{used}</b><span className="total">/{slot.mins}m</span></span>
          {free > 0 ? <span className="chip-tot chip-free">{free}m free</span> : over ? <span className="chip-tot" style={{ color:'var(--warn)', borderColor:'var(--warn)' }}>+{used-slot.mins}m over</span> : null}
        </div>
      </div>
      <div style={{ padding:'12px 16px', display:'flex', flexDirection:'column', gap:6 }}>
        {tasks.map(t => (
          <TaskRow key={t.id} task={t} sourceBlockKey={blockKey}
            onRemove={() => onRemove(t.id)}
            onAddSession={() => addSessionFor(state, set, t)}/>
        ))}
        {review && (
          <div className="review">
            <span className="glyph">↻</span>
            <span className="label">Review · {review.mins}m</span>
            <span className="from">{review.from ? `"${review.from}"` : 'open loops'}</span>
            <button className="change" onClick={removeReview}>remove</button>
          </div>
        )}
        {composerOpen ? (
          <InlineComposer blockKey={blockKey} slot={slot} free={free}
            onClose={() => setComposerOpen(false)}/>
        ) : (
          <button className="drop" onClick={() => setComposerOpen(true)}>
            {tasks.length === 0 ? `+ Add task (${free}m free)` : free > 0 ? `+ ${free}m free` : '+ Add task'}
          </button>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { DayView });
