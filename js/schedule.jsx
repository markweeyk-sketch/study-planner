// ─────────────────────────────────────────────────────────────
// schedule.jsx — Study block editor (vertical calendar, drag UI)
// ─────────────────────────────────────────────────────────────

const S_H0  = 5;   // 5 am  (first visible hour)
const S_H1  = 23;  // 11 pm (last  visible hour)
const S_PHR = 64;  // px per hour
const S_TOT = S_H1 - S_H0;

const SCHEDULE_PRESETS = [
  { id:'school-day',     label:'School day',     color:'#818CF8',
    blocks:[{label:'Morning',start:'05:15',end:'06:45'},{label:'Afternoon',start:'16:30',end:'17:30'}] },
  { id:'public-holiday', label:'Public holiday', color:'#F97316',
    blocks:[{label:'Morning',start:'07:00',end:'12:00'},{label:'Holiday hours',start:'14:00',end:'18:00'}] },
  { id:'half-day',       label:'Half day',       color:'#60A5FA',
    blocks:[{label:'Morning',start:'07:00',end:'12:30'}] },
  { id:'exam-leave',     label:'Exam leave',     color:'#F472B6', blocks:[] },
  { id:'rest-day',       label:'Rest day',       color:'#94A3B8', blocks:[] },
];

const S_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function sH(s)   { const [h,m]=s.split(':').map(Number); return h+(m||0)/60; }
function sT(h)   { const hh=Math.floor(h),mm=Math.round((h-hh)*60); return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`; }
function sSnap(h){ return Math.round(h*4)/4; }
function sMins(s,e){ return Math.round((sH(e)-sH(s))*60); }
function sLbl(h) {
  if (h===12) return '12pm'; if (h===0||h===24) return '12am';
  return h<12 ? `${h}am` : `${h-12}pm`;
}

// ─── Main view ───────────────────────────────────────────────
function ScheduleView() {
  const { state, set } = useStore();
  const [dropdown, setDropdown] = React.useState(null); // {day, date, x, y}

  // Use current week dates as column headers
  const weekStart_ = mondayOf(new Date());
  const weekDates_ = weekDays(weekStart_);

  const updateBlock = (day, id, patch) => {
    set(s => ({
      ...s,
      schedule: {
        ...s.schedule,
        [day]: (s.schedule[day]||[]).map(b => {
          if (b.id !== id) return b;
          const n = { ...b, ...patch };
          n.mins = sMins(n.start, n.end);
          return n;
        }),
      },
    }));
  };

  const deleteBlock = (day, id) => {
    set(s => ({
      ...s,
      schedule: { ...s.schedule, [day]: (s.schedule[day]||[]).filter(b=>b.id!==id) },
      tasks: s.tasks.map(t => t.blockKey&&t.blockKey.endsWith('/'+id)?{...t,blockKey:null}:t),
      reviews: Object.fromEntries(Object.entries(s.reviews).filter(([k])=>!k.endsWith('/'+id))),
    }));
    toast('Block deleted');
  };

  const addBlock = (day, block) => {
    const id = day.toLowerCase()+'-'+Date.now().toString(36).slice(-4);
    set(s => ({
      ...s,
      schedule: { ...s.schedule, [day]: [...(s.schedule[day]||[]), {...block, id, mins:sMins(block.start,block.end)}] },
    }));
  };

  const applyPreset = (day, presetId, scope, date) => {
    const p = SCHEDULE_PRESETS.find(x=>x.id===presetId);
    if (!p) return;
    const newBlocks = p.blocks.map((b,i) => ({
      ...b,
      id: day.toLowerCase()+'-'+Date.now().toString(36).slice(-4)+i,
      mins: sMins(b.start, b.end),
    }));
    set(s => {
      const old = s.schedule[day]||[];
      const oldIds = new Set(old.map(b=>b.id));
      return {
        ...s,
        schedule: { ...s.schedule, [day]: newBlocks },
        tasks: s.tasks.map(t => {
          if (!t.blockKey) return t;
          const sid = t.blockKey.split('/')[1];
          return oldIds.has(sid) ? {...t,blockKey:null} : t;
        }),
        reviews: Object.fromEntries(Object.entries(s.reviews).filter(([k])=>{
          const sid=k.split('/')[1]; return !oldIds.has(sid);
        })),
      };
    });
    const label = scope==='this' && date
      ? `${day} ${S_MONTHS[date.getMonth()]} ${date.getDate()}`
      : `every ${day}`;
    toast(`Applied ${p.label} to ${label}`);
    setDropdown(null);
  };

  return (
    <div className="sched-view">
      {/* ── Top header ── */}
      <div className="sched-header">
        <div style={{display:'flex',alignItems:'baseline',gap:12,marginBottom:4}}>
          <h1 style={{fontSize:22,fontWeight:600,margin:0}}>Schedule</h1>
          <span className="voice" style={{fontSize:20}}>drag like a calendar</span>
        </div>
        <p className="sched-desc">
          Blocks resize by dragging their edges, whole days take a one-click preset
          (school day, public holiday, exam leave…), and short blocks no longer have their time hanging off the edge.
        </p>
        <div className="sched-presets-bar">
          <span className="h-label" style={{fontSize:'9px',whiteSpace:'nowrap',paddingRight:4}}>DAY PRESETS</span>
          {SCHEDULE_PRESETS.map(p => (
            <div key={p.id} className="sched-preset-chip"
              draggable
              onDragStart={e=>{ e.dataTransfer.setData('text/plain',p.id); e.dataTransfer.effectAllowed='copy'; }}>
              <span className="sched-preset-dot" style={{background:p.color}}/>
              {p.label}
            </div>
          ))}
          <button className="sched-preset-chip ghost">+ New preset / Manage…</button>
        </div>
      </div>

      {/* ── Calendar (header row + scrollable body) ── */}
      <div className="sched-cal">
        {/* Non-scrolling day header row */}
        <div className="sched-cal-headers">
          <div className="sched-gutter"/>
          {weekDates_.map(d => {
            const wk = weekdayKey(d);
            const dayMins = (state.schedule[wk]||[]).reduce((s,b)=>s+b.mins,0);
            return (
              <div key={wk} className="sched-day-head">
                <span className="sdh-name">{wk}</span>
                <span className="sdh-date">{S_MONTHS[d.getMonth()]} {d.getDate()}</span>
                {dayMins > 0 && <span className="sdh-total">{dayMins}m</span>}
                <button className="sdh-add" title={`Preset / add block for ${wk}`}
                  onClick={e=>{
                    const r=e.currentTarget.getBoundingClientRect();
                    setDropdown(v=>(v&&v.day===wk)?null:{day:wk,date:d,x:r.left,y:r.bottom+4});
                  }}>+</button>
              </div>
            );
          })}
        </div>

        {/* Scrollable body: time gutter + 7 day columns */}
        <div className="sched-cal-body">
          <div className="sched-gutter" style={{position:'relative',flexShrink:0}}>
            {Array.from({length:S_TOT+1}).map((_,i)=>(
              <div key={i} className="sched-hr-label" style={{top:i*S_PHR}}>
                {sLbl(S_H0+i)}
              </div>
            ))}
          </div>
          {weekDates_.map(d=>{
            const wk=weekdayKey(d);
            return (
              <SchedDayCol key={wk} day={wk} blocks={state.schedule[wk]||[]}
                onUpdate={updateBlock} onDelete={deleteBlock} onAdd={addBlock}
                onPresetDrop={pid=>applyPreset(wk,pid,'every',d)}/>
            );
          })}
        </div>
      </div>

      {/* ── Hint bar ── */}
      <div className="sched-hints">
        <span>drag block body to move</span>
        <span>·</span>
        <span>drag edge to resize</span>
        <span>·</span>
        <span>snaps to 15 min</span>
        <span>·</span>
        <span>double-click empty space to add a block</span>
      </div>

      {/* ── Preset dropdown (fixed-positioned) ── */}
      {dropdown && (
        <SchedPresetDropdown
          day={dropdown.day} date={dropdown.date}
          position={{x:dropdown.x,y:dropdown.y}}
          onApply={applyPreset}
          onClose={()=>setDropdown(null)}/>
      )}
    </div>
  );
}

// ─── Day column ──────────────────────────────────────────────
function SchedDayCol({ day, blocks, onUpdate, onDelete, onAdd, onPresetDrop }) {
  const [dropOver, setDropOver] = React.useState(false);
  const bodyRef = React.useRef(null);

  const handleDblClick = e => {
    if (e.target.closest('.sched-block')) return;
    const rect = bodyRef.current.getBoundingClientRect();
    const h = sSnap(S_H0 + (e.clientY - rect.top) / S_PHR);
    const start = sT(Math.max(S_H0, Math.min(S_H1-1, h)));
    const end   = sT(Math.min(S_H1, sH(start)+1));
    onAdd(day, {label:'Study', start, end});
  };

  return (
    <div className={"sched-day-col"+(dropOver?' drop-over':'')}
      ref={bodyRef}
      style={{height: S_TOT*S_PHR}}
      onDoubleClick={handleDblClick}
      onDragOver={e=>{e.preventDefault();setDropOver(true);}}
      onDragLeave={()=>setDropOver(false)}
      onDrop={e=>{
        e.preventDefault(); setDropOver(false);
        const pid=e.dataTransfer.getData('text/plain');
        if(pid) onPresetDrop(pid);
      }}>
      {/* Hour and half-hour grid lines */}
      {Array.from({length:S_TOT}).map((_,i)=>(
        <React.Fragment key={i}>
          <div className="sched-hr-line"      style={{top:i*S_PHR}}/>
          <div className="sched-hr-line half" style={{top:i*S_PHR+S_PHR/2}}/>
        </React.Fragment>
      ))}
      {blocks.map(b=>(
        <SchedBlock key={b.id} block={b} day={day}
          onUpdate={onUpdate} onDelete={onDelete}/>
      ))}
    </div>
  );
}

// ─── Block (drag-move + drag-resize) ────────────────────────
function SchedBlock({ block, day, onUpdate, onDelete }) {
  const [live, setLive]       = React.useState(null);
  const liveRef               = React.useRef(null);
  const [dragging, setDragging] = React.useState(false);
  const [bubble, setBubble]   = React.useState(null); // time shown during resize

  const b = live || block;
  const bS = sH(b.start), bE = sH(b.end);
  const top    = (bS - S_H0) * S_PHR;
  const height = (bE - bS) * S_PHR;
  const isShort = height < 36;
  const dur = Math.round((bE - bS) * 60);

  const startDrag = React.useCallback((e, type) => {
    e.preventDefault(); e.stopPropagation();
    const y0 = e.clientY;
    const s0 = sH(block.start), e0 = sH(block.end);
    setDragging(true);

    const onMove = ev => {
      const dh = (ev.clientY - y0) / S_PHR;
      let ns = s0, ne = e0;
      if (type === 'move') {
        const d = e0 - s0;
        ns = sSnap(Math.max(S_H0, Math.min(S_H1-d, s0+dh)));
        ne = ns + d;
      } else if (type === 'top') {
        ns = sSnap(Math.max(S_H0, Math.min(e0-0.25, s0+dh)));
        setBubble(sT(ns));
      } else {
        ne = sSnap(Math.max(s0+0.25, Math.min(S_H1, e0+dh)));
        setBubble(sT(ne));
      }
      const nb = {...block, start:sT(ns), end:sT(ne), mins:Math.round((ne-ns)*60)};
      liveRef.current = nb;
      setLive(nb);
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      setDragging(false); setBubble(null);
      if (liveRef.current) {
        onUpdate(day, block.id, {start:liveRef.current.start, end:liveRef.current.end, mins:liveRef.current.mins});
        liveRef.current = null; setLive(null);
      }
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [block, day, onUpdate]);

  return (
    <div className={"sched-block"+(dragging?' dragging':'')}
      style={{top, height, position:'absolute', left:4, right:4}}>
      {/* Resize handles */}
      <div className="sched-bh top"    onMouseDown={e=>startDrag(e,'top')}/>
      <div className="sched-bh bottom" onMouseDown={e=>startDrag(e,'bottom')}/>

      {/* Body — drag to move */}
      <div className="sched-block-body" onMouseDown={e=>startDrag(e,'move')}>
        {!isShort && (
          <>
            <div className="sched-block-label">{b.label}</div>
            <div className="sched-block-time">{b.start}–{b.end}</div>
          </>
        )}
      </div>

      {/* Delete */}
      <button className="sched-block-del" onClick={()=>onDelete(day,block.id)}>×</button>

      {/* Short-block chip — appears beside the block when too small for inner text */}
      {isShort && <div className="sched-block-chip">{b.start}–{b.end} · {dur}m</div>}

      {/* Time bubble during resize */}
      {bubble && <div className="sched-block-bubble">{bubble}</div>}
    </div>
  );
}

// ─── Preset dropdown ─────────────────────────────────────────
function SchedPresetDropdown({ day, date, position, onApply, onClose }) {
  const ref = React.useRef(null);
  const [sel, setSel] = React.useState(null);

  React.useEffect(() => {
    const fn = e => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    // Delay so the click that opened the dropdown doesn't immediately close it
    const tid = setTimeout(() => window.addEventListener('mousedown', fn), 0);
    return () => { clearTimeout(tid); window.removeEventListener('mousedown', fn); };
  }, []);

  const dateLabel = date ? `${day} (${S_MONTHS[date.getMonth()]} ${date.getDate()})` : day;
  const x = Math.min(position.x, window.innerWidth  - 272);
  const y = Math.min(position.y, window.innerHeight - 330);

  return (
    <div ref={ref} className="sched-preset-dd" style={{position:'fixed',left:x,top:y,zIndex:50}}>
      <div className="spd-head">APPLY PRESET · {day.toUpperCase()}</div>

      {SCHEDULE_PRESETS.map(p => {
        const hint = p.blocks.length === 0
          ? (p.id==='exam-leave' ? 'full day' : 'none')
          : p.blocks.map(b=>sMins(b.start,b.end)+'m').join('+');
        return (
          <div key={p.id} className={"spd-item"+(sel===p.id?' sel':'')}
            onMouseDown={e=>{e.preventDefault(); setSel(p.id);}}>
            <span className="sched-preset-dot" style={{background:p.color}}/>
            <span style={{flex:1}}>{p.label}</span>
            <span className="spd-hint">{hint}</span>
          </div>
        );
      })}

      <div className="spd-footer">
        <div className="spd-scope">
          <button className="spd-btn" disabled={!sel}
            onClick={()=>sel&&onApply(day,sel,'this',date)}>
            This {dateLabel}
          </button>
          <button className="spd-btn primary" disabled={!sel}
            onClick={()=>sel&&onApply(day,sel,'every',date)}>
            Every {day}
          </button>
        </div>
        <button className="spd-save-btn" disabled>+ Save current blocks as preset…</button>
      </div>
    </div>
  );
}

Object.assign(window, { ScheduleView });
