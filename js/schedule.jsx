// ─────────────────────────────────────────────────────────────
// schedule.jsx — Define study blocks per weekday
// ─────────────────────────────────────────────────────────────

const HOURS_START = 5;   // 5am
const HOURS_END = 25;    // up to 1am next day (renders as ~midnight band)
const HOUR_SPAN = HOURS_END - HOURS_START; // 20

function timeToHour(s) {
  const [h,m] = s.split(':').map(Number);
  return h + (m||0)/60;
}
function hourToTime(h) {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
}
function minsBetween(start, end) {
  return Math.round((timeToHour(end) - timeToHour(start)) * 60);
}

function ScheduleView() {
  const { state, set } = useStore();
  const [selected, setSelected] = React.useState(null); // { day, id }
  const [creating, setCreating] = React.useState(null); // { day }

  const updateBlock = (day, blockId, patch) => {
    set(s => ({
      ...s,
      schedule: {
        ...s.schedule,
        [day]: s.schedule[day].map(b => {
          if (b.id !== blockId) return b;
          const next = { ...b, ...patch };
          next.mins = minsBetween(next.start, next.end);
          return next;
        }),
      },
    }));
  };
  const deleteBlock = (day, blockId) => {
    if (!window.confirm('Delete this block? Tasks already in it will move back to the backlog.')) return;
    const keys = [];
    const dates = []; // any date with this weekday — need to clear blockKeys matching
    set(s => {
      // remove any tasks/reviews scheduled into any instance of this block
      const blockKeyTail = '/' + blockId;
      return {
        ...s,
        schedule: { ...s.schedule, [day]: s.schedule[day].filter(b => b.id !== blockId) },
        tasks: s.tasks.map(t => t.blockKey && t.blockKey.endsWith(blockKeyTail) ? { ...t, blockKey:null } : t),
        reviews: Object.fromEntries(Object.entries(s.reviews).filter(([k]) => !k.endsWith(blockKeyTail))),
      };
    });
    setSelected(null);
    toast('Block deleted');
  };
  const addBlock = (day, block) => {
    const id = day.toLowerCase() + '-' + Date.now().toString(36).slice(-4);
    set(s => ({
      ...s,
      schedule: { ...s.schedule, [day]: [...s.schedule[day], { ...block, id, mins: minsBetween(block.start, block.end) }] },
    }));
    setCreating(null);
    setSelected({ day, id });
  };
  const markRest = (day) => {
    if (!window.confirm(`Make ${day} a rest day? All blocks (and any tasks in them) will be cleared.`)) return;
    set(s => {
      const blockIds = (s.schedule[day]||[]).map(b => b.id);
      const isCleared = (key) => blockIds.some(id => key.endsWith('/' + id));
      return {
        ...s,
        schedule: { ...s.schedule, [day]: [] },
        tasks: s.tasks.map(t => t.blockKey && isCleared(t.blockKey) ? { ...t, blockKey:null } : t),
        reviews: Object.fromEntries(Object.entries(s.reviews).filter(([k]) => !isCleared(k))),
      };
    });
    setSelected(null);
    toast(`${day} is now a rest day`);
  };

  const totalMins = WEEKDAY_KEYS.reduce((s, k) => s + (state.schedule[k]||[]).reduce((a,b)=>a+b.mins,0), 0);

  const selectedBlock = selected
    ? (state.schedule[selected.day] || []).find(b => b.id === selected.id)
    : null;

  return (
    <div className="content" style={{ padding:'24px 32px 80px', maxWidth:1280, margin:'0 auto' }}>
      <div style={{ display:'flex', alignItems:'baseline', gap:14, marginBottom:6, flexWrap:'wrap' }}>
        <h1 style={{ fontSize:22, fontWeight:600, margin:0 }}>Schedule</h1>
        <span className="voice" style={{ fontSize:20, lineHeight:1 }}>your study skeleton</span>
      </div>
      <p style={{ fontSize:13, color:'var(--muted)', margin:'0 0 24px', maxWidth:640, lineHeight:1.5 }}>
        Study blocks are the slots in your week where studying actually happens.
        Define them once; the planner fills them with tasks. Changes apply from this week forward.
      </p>

      <section className="section">
        <div className="section-head">
          <h2>Weekly blocks</h2>
          <span className="voice" style={{ fontSize:16 }}>click a block to edit · click an empty lane to add</span>
          <span className="desc">{Math.round(totalMins/60*10)/10} hrs / week across {WEEKDAY_KEYS.filter(k => (state.schedule[k]||[]).length).length} days</span>
        </div>

        <div className="timeline">
          <div></div>
          <div className="tl-hours">
            {Array.from({length:HOUR_SPAN}).map((_,i) => {
              const h = HOURS_START + i;
              const label = h % 2 === 0
                ? (h === 12 ? '12pm' : h < 12 ? `${h}am` : h === 24 ? '12am' : `${h-12}pm`)
                : '';
              return <span key={i}>{label}</span>;
            })}
          </div>

          {WEEKDAY_KEYS.map(day => {
            const slots = state.schedule[day] || [];
            const total = slots.reduce((s,b)=>s+b.mins,0);
            return (
              <React.Fragment key={day}>
                <div className={"tl-day"+(slots.length===0?' rest':'')}>
                  <div className="dn">{day}</div>
                  <div className="meta">{slots.length === 0 ? '— rest —' : `${total}m · ${slots.length} block${slots.length>1?'s':''}`}</div>
                  {slots.length === 0
                    ? <button className="btn sm ghost" style={{ marginTop:4 }} onClick={() => setCreating({ day })}>+ Add block</button>
                    : <button className="btn sm ghost" style={{ marginTop:4 }} onClick={() => markRest(day)}>Make rest</button>
                  }
                </div>
                <div className={"tl-lane"+(slots.length===0?' rest':'')}
                  onClick={(e) => {
                    if (e.target.closest('.tl-block')) return;
                    // Compute approx start time from click X
                    const rect = e.currentTarget.getBoundingClientRect();
                    const pct = (e.clientX - rect.left) / rect.width;
                    const h = HOURS_START + Math.round(pct * HOUR_SPAN * 4) / 4; // snap to 15m
                    const start = hourToTime(Math.max(HOURS_START, Math.min(HOURS_END - 1, h)));
                    const end = hourToTime(Math.max(HOURS_START + 0.5, Math.min(HOURS_END, h + 1)));
                    setCreating({ day, presetStart: start, presetEnd: end });
                  }}>
                  {slots.map(b => {
                    const left = ((timeToHour(b.start) - HOURS_START) / HOUR_SPAN) * 100;
                    const width = ((timeToHour(b.end) - timeToHour(b.start)) / HOUR_SPAN) * 100;
                    const isSel = selected && selected.day === day && selected.id === b.id;
                    return (
                      <div key={b.id} className={"tl-block"+(isSel?' selected':'')}
                        style={{ left:left+'%', width:width+'%' }}
                        onClick={(e) => { e.stopPropagation(); setSelected({ day, id:b.id }); }}>
                        <div className="lbl">{b.label}</div>
                        <div className="tm">{b.start}–{b.end}</div>
                      </div>
                    );
                  })}
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </section>

      {selectedBlock && (
        <section className="section">
          <div className="section-head">
            <h2>Edit block · {selected.day} · {selectedBlock.label}</h2>
            <span className="voice" style={{ fontSize:16 }}>the one you clicked</span>
          </div>
          <BlockForm key={selected.day+':'+selected.id}
            initial={selectedBlock}
            day={selected.day}
            onChange={(patch) => updateBlock(selected.day, selected.id, patch)}
            onDelete={() => deleteBlock(selected.day, selected.id)}
            onClose={() => setSelected(null)}/>
        </section>
      )}

      {creating && (
        <section className="section">
          <div className="section-head">
            <h2>New block · {creating.day}</h2>
            <span className="voice" style={{ fontSize:16 }}>set a time and label</span>
          </div>
          <BlockForm
            initial={{ label:'Morning', start: creating.presetStart || '07:00', end: creating.presetEnd || '08:00' }}
            day={creating.day}
            isNew
            onSave={(b) => addBlock(creating.day, b)}
            onClose={() => setCreating(null)}/>
        </section>
      )}

      <section className="section">
        <div className="section-head">
          <h2>How weeks work</h2>
          <span className="voice" style={{ fontSize:16 }}>when does the page refresh?</span>
        </div>
        <p style={{ fontSize:13, color:'var(--ink-2)', lineHeight:1.6, margin:'0 0 6px' }}>
          The current week is always live. The view rolls automatically every Monday at 00:00 — when the app is open across midnight, it just rolls. No refresh needed.
        </p>
        <p style={{ fontSize:13, color:'var(--ink-2)', lineHeight:1.6, margin:'0 0 6px' }}>
          Past weeks become read-only but the log stays editable. Next week is always one click ahead — drop tasks in early to spread the load.
        </p>
      </section>
    </div>
  );
}

function BlockForm({ initial, day, isNew, onChange, onSave, onDelete, onClose }) {
  const [b, setB] = React.useState(initial);
  const mins = minsBetween(b.start, b.end);

  // Live update if editing (not creating)
  React.useEffect(() => {
    if (!isNew && onChange) {
      const t = setTimeout(() => onChange(b), 100);
      return () => clearTimeout(t);
    }
  }, [b.label, b.start, b.end]);

  const valid = b.label.trim() && timeToHour(b.end) > timeToHour(b.start);

  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:14 }}>
      <div className="field">
        <div className="field-label">Label</div>
        <input className="input" value={b.label} onChange={e => setB({...b, label:e.target.value})}/>
      </div>
      <div className="field">
        <div className="field-label">Time</div>
        <div className="time-row">
          <input className="input" type="time" value={b.start} onChange={e => setB({...b, start:e.target.value})}/>
          <span className="sep">→</span>
          <input className="input" type="time" value={b.end} onChange={e => setB({...b, end:e.target.value})}/>
        </div>
        <div style={{ fontSize:11, color:'var(--muted)', marginTop:4, fontFamily:'JetBrains Mono, monospace' }}>
          duration · {Math.floor(mins/60)}h {mins%60}m ({mins} min)
        </div>
      </div>
      <div style={{ alignSelf:'end', display:'flex', gap:8, justifyContent:'flex-end' }}>
        {isNew ? (
          <>
            <button className="btn ghost" onClick={onClose}>Cancel</button>
            <button className="btn primary" disabled={!valid} onClick={() => onSave({ label: b.label.trim(), start: b.start, end: b.end })}>Add block</button>
          </>
        ) : (
          <>
            <button className="btn warn-ghost" onClick={onDelete}>Delete</button>
            <button className="btn ghost" onClick={onClose}>Close</button>
          </>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { ScheduleView });
