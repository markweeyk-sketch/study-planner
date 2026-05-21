// ─────────────────────────────────────────────────────────────
// components.jsx — shared UI primitives + global context + drag state
// ─────────────────────────────────────────────────────────────

const StoreCtx = React.createContext(null);

function useStore() {
  return React.useContext(StoreCtx);
}

// Drag state lives in window so it survives React re-renders
window.__drag = null; // { task, source: 'block:KEY' | 'backlog' | 'recurring:ID' | 'subj-card:RECID' }

function setDrag(payload) { window.__drag = payload; }
function getDrag() { return window.__drag; }
function clearDrag() { window.__drag = null; }

// ─────────────────────────────────────────────────────────────
// Toast (light notification — used for "task added", "saved", etc.)
// ─────────────────────────────────────────────────────────────
let __toastId = 0;
const __toastListeners = new Set();
function toast(msg, opts = {}) {
  const id = ++__toastId;
  const item = { id, msg, kind: opts.kind || 'info', ttl: opts.ttl || 2200 };
  __toastListeners.forEach(fn => fn({ type:'add', item }));
  setTimeout(() => __toastListeners.forEach(fn => fn({ type:'remove', id })), item.ttl);
}
function Toaster() {
  const [items, setItems] = React.useState([]);
  React.useEffect(() => {
    const fn = (ev) => {
      if (ev.type === 'add') setItems(i => [...i, ev.item]);
      else setItems(i => i.filter(x => x.id !== ev.id));
    };
    __toastListeners.add(fn);
    return () => __toastListeners.delete(fn);
  }, []);
  return (
    <div style={{
      position:'fixed', bottom:24, right:24, zIndex:200,
      display:'flex', flexDirection:'column', gap:8, pointerEvents:'none',
    }}>
      {items.map(t => (
        <div key={t.id} style={{
          background:'var(--card)', border:'1px solid var(--border-2)',
          borderRadius:8, padding:'9px 14px',
          color: t.kind === 'warn' ? 'var(--warn)' : 'var(--ink-2)',
          fontSize:13, boxShadow:'0 6px 16px rgba(0,0,0,0.4)',
          fontFamily: t.kind === 'voice' ? '"Caveat", cursive' : 'inherit',
          fontSize: t.kind === 'voice' ? 17 : 13,
        }}>
          {t.msg}
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SubjectDot, DotsProgress, TaskRow
// ─────────────────────────────────────────────────────────────
function SubjectDot({ subject, size=8 }) {
  return <span className="dot swatch" style={{
    display:'inline-block', width:size, height:size, borderRadius:'50%',
    background: subjectColor(subject),
    border:'1px solid var(--border-3)',
  }}/>;
}

function DotsProgress({ done, target, color }) {
  return (
    <span className="dots" style={ color ? { color } : null }>
      {Array.from({length:target}).map((_,i) => (
        <i key={i} className={i<done?'f':''}/>
      ))}
    </span>
  );
}

// Task row inside a block — draggable
function TaskRow({ task, sourceBlockKey, onRemove }) {
  const onDragStart = (e) => {
    setDrag({ task, source: 'block:' + sourceBlockKey });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', task.id);
    e.currentTarget.classList.add('dragging');
  };
  const onDragEnd = (e) => {
    e.currentTarget.classList.remove('dragging');
    clearDrag();
  };
  return (
    <div className="task" draggable onDragStart={onDragStart} onDragEnd={onDragEnd} title={task.label}>
      <span className="bar3" style={{ background: subjectColor(task.subject) }}/>
      <span className="name">{task.label}</span>
      <span className="mins">{task.mins}m</span>
      {task.source === 'teams' && <span className="src teams">Teams</span>}
      {task.source === 'gcal' && <span className="src gcal">GCal</span>}
      <button className="x" onClick={onRemove} title="Remove from block">✕</button>
    </div>
  );
}

// Drop zone (e.g. empty block tail) — accepts drag
function DropZone({ blockKey, label, onDrop }) {
  const [over, setOver] = React.useState(false);
  const onDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOver(true); };
  const onDragLeave = () => setOver(false);
  const onDropFn = (e) => {
    e.preventDefault();
    setOver(false);
    const d = getDrag();
    if (d) onDrop(d, blockKey);
    clearDrag();
  };
  return (
    <button className={"drop"+(over?' over':'')}
      onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDropFn}>
      {label || 'drop a task here · or click to add'}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// useHash — tiny hash router
// ─────────────────────────────────────────────────────────────
function useHash() {
  const [hash, setHash] = React.useState(window.location.hash.slice(1) || 'week');
  React.useEffect(() => {
    const fn = () => setHash(window.location.hash.slice(1) || 'week');
    window.addEventListener('hashchange', fn);
    return () => window.removeEventListener('hashchange', fn);
  }, []);
  const nav = (h) => { window.location.hash = h; };
  return [hash, nav];
}

// ─────────────────────────────────────────────────────────────
// Time helpers — "05:15" → "5:15 AM" or 24h
// ─────────────────────────────────────────────────────────────
function parseTime(s) {
  const [h, m] = s.split(':').map(Number);
  return h*60 + (m||0);
}
function fmtTime12(s) {
  const [h, m] = s.split(':').map(Number);
  const am = h < 12;
  const hh = h === 0 ? 12 : (h > 12 ? h - 12 : h);
  return `${hh}:${String(m).padStart(2,'0')} ${am?'am':'pm'}`;
}
function fmtTimeRange(slot) {
  const a = fmtTime12(slot.start), b = fmtTime12(slot.end);
  // drop matching am/pm: "5:15–6:45 am" instead of "5:15 am – 6:45 am"
  const aMer = a.slice(-2), bMer = b.slice(-2);
  if (aMer === bMer) return `${a.slice(0,-3)}–${b.slice(0,-3)}${bMer === 'am' ? '' : ' pm'}`;
  return `${a}–${b}`;
}
function fmtTimeRangeShort(slot) {
  // "5:15–6:45" — no meridiem (used inside block where time is small)
  return `${slot.start.replace(/^0/, '')}–${slot.end.replace(/^0/, '')}`;
}

Object.assign(window, {
  StoreCtx, useStore, setDrag, getDrag, clearDrag,
  toast, Toaster,
  SubjectDot, DotsProgress, TaskRow, DropZone,
  useHash, parseTime, fmtTime12, fmtTimeRange, fmtTimeRangeShort,
});
