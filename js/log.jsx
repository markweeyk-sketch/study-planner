// ─────────────────────────────────────────────────────────────
// log.jsx — Study log + Struggle Index, drives review slots
// ─────────────────────────────────────────────────────────────

function LogView() {
  const { state, set } = useStore();
  const [filter, setFilter] = React.useState('all'); // all | struggles | bySubject
  const [adding, setAdding] = React.useState(false);

  const entries = React.useMemo(() => {
    const sorted = [...state.log].sort((a, b) => b.date.localeCompare(a.date));
    if (filter === 'struggles') return sorted.filter(isStruggleEntry);
    return sorted;
  }, [state.log, filter]);

  const struggles = state.log.filter(isStruggleEntry)
    .sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="main">
      <aside className="sidebar">
        <div className="h-row"><span className="h-label">Struggle Index</span></div>
        <div style={{ fontSize:12, color:'var(--muted)', padding:'0 4px 8px' }}>
          Open loops — drop one into a block to schedule a review.
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          {struggles.length === 0 && <div className="empty" style={{ padding:'20px 8px' }}><p>No struggles logged</p></div>}
          {struggles.slice(0, 8).map(s => (
            <StruggleCard key={s.id} entry={s}/>
          ))}
        </div>
      </aside>

      <main className="content">
        <div className="content-head">
          <div>
            <h1>Study log</h1>
            <div className="sub">End-of-block notes. What you covered, what tripped you up.</div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <div className="seg">
              <button className={filter==='all' ? 'active' : ''} onClick={() => setFilter('all')}>All</button>
              <button className={filter==='struggles' ? 'active' : ''} onClick={() => setFilter('struggles')}>Struggles only</button>
            </div>
            <button className="btn primary" onClick={() => setAdding(true)}>+ New entry</button>
          </div>
        </div>

        {adding && <LogEntryForm onSave={(e) => { set(s => ({...s, log:[...s.log, e]})); setAdding(false); toast('Logged'); }} onCancel={() => setAdding(false)}/>}

        {entries.length === 0 && !adding && (
          <div className="empty">
            <div className="glyph">✎</div>
            <h3>No entries yet</h3>
            <p>Log what you covered after each study block. Future-you will thank you.</p>
            <button className="btn primary" onClick={() => setAdding(true)} style={{ marginTop:8 }}>+ Add your first entry</button>
          </div>
        )}

        {entries.map(e => <LogEntry key={e.id} entry={e}
          onDelete={() => set(s => ({...s, log: s.log.filter(x => x.id !== e.id)}))}/>)}
      </main>

      <aside className="right-rail">
        <div className="h-row"><span className="h-label">By subject</span></div>
        <BySubjectMini/>
      </aside>
    </div>
  );
}

function LogEntry({ entry, onDelete }) {
  const c = subjectColor(entry.subject);
  return (
    <div className="log-entry">
      <div className="head">
        <span className="bar3" style={{ background:c }}/>
        <span className="subj">{entry.subject}</span>
        <span className="when">{entry.date}{entry.block ? ` · ${entry.block}` : ''}</span>
      </div>
      {entry.topic && <div className="topic">{entry.topic}</div>}
      {entry.struggle && <div className="struggle"><span>{entry.struggle}</span></div>}
      <div className="actions">
        {entry.mins ? <span className="log-chip mono">{entry.mins}m</span> : null}
        {entry.struggleRating ? <span className="log-chip mono">difficulty {entry.struggleRating}/5</span> : null}
        {entry.source === 'timer' ? <span className="log-chip mono">timed</span> : null}
        <span style={{ flex: 1 }}/>
        <button className="btn sm warn-ghost" onClick={onDelete}>Delete</button>
      </div>
    </div>
  );
}

function LogEntryForm({ onSave, onCancel }) {
  const [date, setDate] = React.useState(todayISO());
  const [subject, setSubject] = React.useState('Maths');
  const [topic, setTopic] = React.useState('');
  const [struggle, setStruggle] = React.useState('');
  const [block, setBlock] = React.useState('');
  const valid = topic.trim().length > 0 || struggle.trim().length > 0;

  return (
    <div className="log-entry" style={{ borderColor:'var(--accent)' }}>
      <div style={{ display:'grid', gridTemplateColumns:'auto 1fr auto', gap:10, marginBottom:10 }}>
        <input className="input" type="date" value={date} onChange={e=>setDate(e.target.value)} style={{ width:140 }}/>
        <select className="input" value={subject} onChange={e=>setSubject(e.target.value)}>
          {SUBJECTS_LIST.filter(s => s.key !== 'Custom').map(s => <option key={s.key}>{s.key}</option>)}
        </select>
        <input className="input" placeholder="Block (optional)" value={block} onChange={e=>setBlock(e.target.value)} style={{ width:160 }}/>
      </div>
      <div className="field">
        <div className="field-label">Covered</div>
        <input className="input" placeholder="What did you study?" value={topic} onChange={e=>setTopic(e.target.value)}/>
      </div>
      <div className="field">
        <div className="field-label">Struggled with <span style={{ color:'var(--subtle)', fontWeight:400, textTransform:'none' }}>(optional — surfaces in review slots)</span></div>
        <input className="input" placeholder="e.g. chain rule on composite trig" value={struggle} onChange={e=>setStruggle(e.target.value)}/>
      </div>
      <div style={{ display:'flex', gap:8, marginTop:6 }}>
        <button className="btn ghost" onClick={onCancel}>Cancel</button>
        <span style={{ flex:1 }}/>
        <button className="btn primary" disabled={!valid}
          onClick={() => onSave({
            id: 'log-' + Date.now(),
            date, subject, block: block.trim(), topic: topic.trim(), struggle: struggle.trim() || null,
          })}>Save entry</button>
      </div>
    </div>
  );
}

function StruggleCard({ entry }) {
  const { state, set } = useStore();
  const c = subjectColor(entry.subject);
  const note = entry.struggle || entry.topic || (entry.struggleRating ? `difficulty ${entry.struggleRating}/5` : '');

  const onDragStart = (e) => {
    setDrag({
      task: { label: `Review: ${entry.subject}`, subject: entry.subject, mins: 15, from: note, logId: entry.id },
      source: 'struggle',
    });
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/plain', entry.id);
  };

  const scheduleReview = () => {
    // find the next block with free time (15m+), starting today
    const today = new Date();
    for (let offset = 0; offset < 14; offset++) {
      const d = addDays(today, offset);
      const slots = state.schedule[weekdayKey(d)] || [];
      for (const slot of slots) {
        const bk = blockKeyOf(isoDate(d), slot.id);
        if (state.reviews[bk]) continue; // already has a review
        const used = blockUsedMins(state, bk);
        const free = slot.mins - used;
        if (free >= 15) {
          set(s => ({
            ...s,
            reviews: { ...s.reviews, [bk]: { logId: entry.id, mins: 15, from: note } },
          }));
          toast(`Review scheduled · ${weekdayKey(d)} ${slot.label}`, { kind:'voice' });
          return;
        }
      }
    }
    toast('No free slot in the next 2 weeks', { kind:'warn' });
  };

  return (
    <div className="manage-row" style={{ padding:'8px 10px' }} draggable onDragStart={onDragStart}>
      <div className="bar3" style={{ background:c }}/>
      <div className="l">
        <div className="name" style={{ fontSize:12.5 }}>{entry.subject}</div>
        <div className="meta" style={{ fontSize:10.5 }}>{entry.struggle}</div>
      </div>
      <button className="btn sm" onClick={scheduleReview} title="Schedule a 15m review">↻</button>
    </div>
  );
}

function BySubjectMini() {
  const { state } = useStore();
  const bySubj = {};
  state.log.forEach(e => { (bySubj[e.subject] ||= []).push(e); });
  const subjects = Object.keys(bySubj).sort((a,b) => bySubj[b].length - bySubj[a].length);
  if (subjects.length === 0) {
    return <div style={{ fontSize:12, color:'var(--muted)', padding:'4px 4px' }}>No entries yet.</div>;
  }
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
      {subjects.map(s => {
        const entries = bySubj[s];
        const struggles = entries.filter(isStruggleEntry).length;
        return (
          <div key={s} className="manage-row" style={{ padding:'6px 10px' }}>
            <div className="bar3" style={{ background: subjectColor(s) }}/>
            <div className="l">
              <div className="name" style={{ fontSize:12.5 }}>{s}</div>
              <div className="meta" style={{ fontSize:10.5 }}>{entries.length} entries · {struggles} struggles</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

Object.assign(window, { LogView });
