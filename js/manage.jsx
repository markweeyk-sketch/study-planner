// ─────────────────────────────────────────────────────────────
// manage.jsx — Manage recurring tasks + one-offs in their own page
// ─────────────────────────────────────────────────────────────

function ManageView() {
  const { state, set } = useStore();
  const [tab, setTab] = React.useState('recurring');

  return (
    <div className="main no-right">
      <aside className="sidebar">
        <div className="h-row"><span className="h-label">Manage</span></div>
        <div className="group">
          <button className={"group-head"+(tab==='recurring'?' open':'')} onClick={()=>setTab('recurring')}>
            <span className="name">Recurring tasks</span>
            <span className="count">{state.recurring.length}</span>
          </button>
        </div>
        <div className="group">
          <button className={"group-head"+(tab==='assessments'?' open':'')} onClick={()=>setTab('assessments')}>
            <span className="name">Assessments</span>
            <span className="count">{(state.assessments||[]).length}</span>
          </button>
        </div>
        <div className="group">
          <button className={"group-head"+(tab==='oneoff'?' open':'')} onClick={()=>setTab('oneoff')}>
            <span className="name">One-off tasks</span>
            <span className="count">{state.tasks.filter(t => !t.recurringId).length}</span>
          </button>
        </div>
        <div className="group">
          <button className={"group-head"+(tab==='subjects'?' open':'')} onClick={()=>setTab('subjects')}>
            <span className="name">Subject palette</span>
          </button>
        </div>
      </aside>
      <main className="content">
        {tab === 'recurring'   && <RecurringEditor/>}
        {tab === 'assessments' && <AssessmentsEditor/>}
        {tab === 'oneoff'      && <OneOffEditor/>}
        {tab === 'subjects'    && <SubjectPalette/>}
      </main>
    </div>
  );
}

// ── Recurring editor ─────────────────────────────────────────
function RecurringEditor() {
  const { state, set } = useStore();
  const [editingId, setEditingId] = React.useState(null);
  const [creating, setCreating] = React.useState(false);

  const subjects = state.recurring.filter(r => r.group === 'subject');
  const activities = state.recurring.filter(r => r.group === 'activity');

  const upsert = (rec) => {
    set(s => ({ ...s, recurring: s.recurring.map(r => r.id === rec.id ? rec : r) }));
    setEditingId(null);
    toast('Saved');
  };
  const create = (rec) => {
    const id = 'rec-' + Date.now();
    set(s => ({ ...s, recurring: [...s.recurring, { ...rec, id }] }));
    setCreating(false);
    toast('Added');
  };
  const del = (id) => {
    if (!window.confirm('Delete this recurring task?')) return;
    set(s => ({ ...s, recurring: s.recurring.filter(r => r.id !== id) }));
    toast('Deleted');
  };

  return (
    <>
      <div className="content-head">
        <div>
          <h1>Recurring tasks</h1>
          <div className="sub">Things you study or practice every week. Set how often and how long.</div>
        </div>
        <button className="btn primary" onClick={() => setCreating(true)}>+ New recurring</button>
      </div>

      {creating && (
        <RecurringForm initial={{ label:'', subject:'Maths', target:1, mins:60, group:'subject' }}
          onSave={create} onCancel={() => setCreating(false)}/>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:18 }}>
        <div>
          <h3 style={{ fontSize:12, fontWeight:600, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.06em', margin:'0 0 10px' }}>Subjects</h3>
          <div className="manage-list">
            {subjects.length === 0 && <div className="empty"><p>No subjects yet</p></div>}
            {subjects.map(r => editingId === r.id
              ? <RecurringForm key={r.id} initial={r} onSave={upsert} onCancel={() => setEditingId(null)}/>
              : <RecurringRow key={r.id} rec={r} onEdit={() => setEditingId(r.id)} onDelete={() => del(r.id)}/>
            )}
          </div>
        </div>
        <div>
          <h3 style={{ fontSize:12, fontWeight:600, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.06em', margin:'0 0 10px' }}>Activities</h3>
          <div className="manage-list">
            {activities.length === 0 && <div className="empty"><p>No activities yet</p></div>}
            {activities.map(r => editingId === r.id
              ? <RecurringForm key={r.id} initial={r} onSave={upsert} onCancel={() => setEditingId(null)}/>
              : <RecurringRow key={r.id} rec={r} onEdit={() => setEditingId(r.id)} onDelete={() => del(r.id)}/>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function RecurringRow({ rec, onEdit, onDelete }) {
  const c = subjectColor(rec.subject);
  return (
    <div className="manage-row">
      <div className="bar3" style={{ background:c }}/>
      <div className="l">
        <div className="name">{rec.label}</div>
        <div className="meta">{rec.subject} · {rec.target}× / week · {rec.mins} min</div>
      </div>
      <div className="actions">
        <button className="btn sm ghost" onClick={onEdit}>Edit</button>
        <button className="btn sm warn-ghost" onClick={onDelete}>Delete</button>
      </div>
    </div>
  );
}

function RecurringForm({ initial, onSave, onCancel }) {
  const [r, setR] = React.useState(initial);
  const valid = r.label.trim().length > 0 && r.target > 0 && r.mins > 0;
  return (
    <div className="manage-row" style={{ flexDirection:'column', alignItems:'stretch', padding:'14px 16px', borderColor:'var(--accent)' }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
        <div>
          <div className="field-label">Name</div>
          <input className="input" value={r.label} onChange={e => setR({...r, label:e.target.value})}/>
        </div>
        <div>
          <div className="field-label">Subject</div>
          <select className="input" value={r.subject} onChange={e => setR({...r, subject:e.target.value})}>
            {SUBJECTS_LIST.filter(s => s.key !== 'Custom').map(s => (
              <option key={s.key} value={s.key}>{s.key}</option>
            ))}
          </select>
        </div>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:10 }}>
        <div>
          <div className="field-label">Times / week</div>
          <input className="input" type="number" min="1" max="7" value={r.target}
            onChange={e => setR({...r, target:Number(e.target.value)||1})}/>
        </div>
        <div>
          <div className="field-label">Minutes / session</div>
          <input className="input" type="number" min="15" step="15" value={r.mins}
            onChange={e => setR({...r, mins:Number(e.target.value)||15})}/>
        </div>
        <div>
          <div className="field-label">Group</div>
          <div className="seg">
            <button className={r.group==='subject' ? 'active' : ''} onClick={() => setR({...r, group:'subject'})}>Subject</button>
            <button className={r.group==='activity' ? 'active' : ''} onClick={() => setR({...r, group:'activity'})}>Activity</button>
          </div>
        </div>
      </div>
      <div style={{ display:'flex', gap:8 }}>
        <button className="btn ghost" onClick={onCancel}>Cancel</button>
        <span style={{ flex:1 }}/>
        <button className="btn primary" onClick={() => onSave(r)} disabled={!valid}>Save</button>
      </div>
    </div>
  );
}

// ── Assessments editor ───────────────────────────────────────
function AssessmentsEditor() {
  const { state, set } = useStore();
  const [editingId, setEditingId] = React.useState(null);
  const [creating, setCreating] = React.useState(false);

  const list = [...(state.assessments || [])].sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  const upsert = (a) => {
    set(s => ({ ...s, assessments: (s.assessments || []).map(x => x.id === a.id ? a : x) }));
    setEditingId(null); toast('Saved');
  };
  const create = (a) => {
    const id = 'exam-' + Date.now();
    set(s => ({ ...s, assessments: [...(s.assessments || []), { ...a, id }] }));
    setCreating(false); toast('Assessment added');
  };
  const del = (id) => {
    if (!window.confirm('Delete this assessment?')) return;
    set(s => ({ ...s, assessments: (s.assessments || []).filter(x => x.id !== id) }));
    toast('Deleted');
  };

  const blank = { label:'', subject:'Maths', date: todayISO(), importance:2, minSessions:3, sessionMins:45 };

  return (
    <>
      <div className="content-head">
        <div>
          <h1>Assessments</h1>
          <div className="sub">Tests and exams with a date. The planner reserves revision before each one — more when you've been struggling or you mark it important.</div>
        </div>
        <button className="btn primary" onClick={() => setCreating(true)}>+ New assessment</button>
      </div>

      {creating && <AssessmentForm initial={blank} onSave={create} onCancel={() => setCreating(false)}/>}

      <div className="manage-list">
        {list.length === 0 && !creating && (
          <div className="empty"><div className="glyph">◎</div><h3>No assessments yet</h3><p>Add your exams and tests so revision gets planned around them.</p></div>
        )}
        {list.map(a => editingId === a.id
          ? <AssessmentForm key={a.id} initial={a} onSave={upsert} onCancel={() => setEditingId(null)}/>
          : <AssessmentRow key={a.id} a={a} onEdit={() => setEditingId(a.id)} onDelete={() => del(a.id)}/>
        )}
      </div>
    </>
  );
}

function AssessmentRow({ a, onEdit, onDelete }) {
  const { state } = useStore();
  const plan = revisionPlanFor(state, a);
  const d = daysUntil(a.date);
  const imp = a.importance || 2;
  return (
    <div className="manage-row">
      <div className="bar3" style={{ background: subjectColor(a.subject) }}/>
      <div className="l">
        <div className="name">{a.label || a.subject}{imp >= 3 && <span className="imp-tag">important</span>}</div>
        <div className="meta">
          {a.subject} · {fmtDayShort(dateFromISO(a.date))} · {d < 0 ? 'past' : d === 0 ? 'today' : `${d}d away`}
          {' · '}revision {plan.total} sessions{plan.struggleBonus ? ` (min ${plan.min} +${plan.struggleBonus} struggling)` : ` (min ${plan.min})`}
        </div>
      </div>
      <div className="actions">
        <button className="btn sm ghost" onClick={onEdit}>Edit</button>
        <button className="btn sm warn-ghost" onClick={onDelete}>Delete</button>
      </div>
    </div>
  );
}

function AssessmentForm({ initial, onSave, onCancel }) {
  const [a, setA] = React.useState(initial);
  const valid = (a.date || '').length === 10 && (a.minSessions || 0) >= 1;
  const IMP = [[1,'Low'],[2,'Normal'],[3,'High']];
  return (
    <div className="manage-row" style={{ flexDirection:'column', alignItems:'stretch', padding:'14px 16px', borderColor:'var(--accent)' }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
        <div>
          <div className="field-label">Name <span style={{textTransform:'none',color:'var(--subtle)',fontWeight:400}}>(optional)</span></div>
          <input className="input" placeholder="e.g. Term 1.1 Science" value={a.label} onChange={e => setA({...a, label:e.target.value})}/>
        </div>
        <div>
          <div className="field-label">Subject</div>
          <select className="input" value={a.subject} onChange={e => setA({...a, subject:e.target.value})}>
            {SUBJECTS_LIST.filter(s => s.key !== 'Custom').map(s => <option key={s.key} value={s.key}>{s.key}</option>)}
          </select>
        </div>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
        <div>
          <div className="field-label">Date</div>
          <input className="input" type="date" value={a.date} onChange={e => setA({...a, date:e.target.value})}/>
        </div>
        <div>
          <div className="field-label">Importance</div>
          <div className="seg">
            {IMP.map(([v,label]) => (
              <button key={v} className={a.importance===v ? 'active' : ''} onClick={() => setA({...a, importance:v})}>{label}</button>
            ))}
          </div>
        </div>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
        <div>
          <div className="field-label">Minimum revision sessions</div>
          <input className="input" type="number" min="1" max="20" value={a.minSessions}
            onChange={e => setA({...a, minSessions:Number(e.target.value)||1})}/>
        </div>
        <div>
          <div className="field-label">Minutes / revision session</div>
          <input className="input" type="number" min="15" step="15" value={a.sessionMins}
            onChange={e => setA({...a, sessionMins:Number(e.target.value)||45})}/>
        </div>
      </div>
      <div style={{ display:'flex', gap:8 }}>
        <button className="btn ghost" onClick={onCancel}>Cancel</button>
        <span style={{ flex:1 }}/>
        <button className="btn primary" onClick={() => onSave(a)} disabled={!valid}>Save</button>
      </div>
    </div>
  );
}

// ── One-off tasks editor ─────────────────────────────────────
function OneOffEditor() {
  const { state, set } = useStore();
  const oneoffs = state.tasks.filter(t => !t.recurringId);
  const del = (id) => set(s => ({ ...s, tasks: s.tasks.filter(t => t.id !== id) }));

  return (
    <>
      <div className="content-head">
        <div>
          <h1>One-off tasks</h1>
          <div className="sub">Individual assignments, past papers, exam-prep tasks. All your one-offs in one place.</div>
        </div>
        <button className="btn primary" onClick={() => window.dispatchEvent(new CustomEvent('open-add-task'))}>+ New task</button>
      </div>
      <div className="manage-list">
        {oneoffs.length === 0 && <div className="empty"><div className="glyph">∅</div><h3>No one-off tasks yet</h3><p>Add one to get going.</p></div>}
        {oneoffs.map(t => {
          const c = subjectColor(t.subject);
          return (
            <div key={t.id} className="manage-row">
              <div className="bar3" style={{ background:c }}/>
              <div className="l">
                <div className="name">{t.label}</div>
                <div className="meta">
                  {t.subject} · {t.mins}m
                  {t.due ? ` · due ${fmtDayShort(new Date(t.due+'T00:00:00'))}` : ' · no due date'}
                  {t.blockKey ? ` · scheduled` : ' · backlog'}
                </div>
              </div>
              <div className="actions">
                <button className="btn sm warn-ghost" onClick={() => del(t.id)}>Delete</button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ── Subject palette (read-only, just for reference) ──────────
function SubjectPalette() {
  return (
    <>
      <div className="content-head">
        <div>
          <h1>Subject palette</h1>
          <div className="sub">Every subject's accent colour. Used everywhere in the app.</div>
        </div>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:10 }}>
        {SUBJECTS_LIST.map(s => (
          <div key={s.key} className="manage-row">
            <div className="bar3" style={{ background: subjectColor(s.key) }}/>
            <div className="l">
              <div className="name">{s.key}</div>
              <div className="meta">{s.group}</div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

Object.assign(window, { ManageView });
