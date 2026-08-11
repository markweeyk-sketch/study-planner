// ─────────────────────────────────────────────────────────────
// teams.jsx — import Microsoft Teams (EDU) assignments into the backlog.
// ─────────────────────────────────────────────────────────────
// Auth is MSAL.js (loaded from CDN in index.html); config + gating live in
// teams-config.js, mirroring the firebase-config.js pattern. Until a real
// Azure client ID is filled in, STUDY_TEAMS_ENABLED is false and the import
// modal shows setup instructions instead of trying to connect.

function teamsScopes() {
  return (window.STUDY_TEAMS_CONFIG && window.STUDY_TEAMS_CONFIG.scopes) ||
    ['EduAssignments.ReadBasic', 'EduRoster.ReadBasic', 'User.Read'];
}

let __msalApp = null, __msalInit = null;
async function getMsal() {
  if (!window.STUDY_TEAMS_ENABLED) throw new Error('Microsoft Teams is not configured (see teams-config.js)');
  if (!window.msal) throw new Error('Microsoft sign-in library failed to load');
  if (!__msalApp) {
    const cfg = window.STUDY_TEAMS_CONFIG;
    __msalApp = new window.msal.PublicClientApplication({
      auth: {
        clientId: cfg.clientId,
        authority: 'https://login.microsoftonline.com/' + (cfg.tenantId || 'organizations'),
        redirectUri: window.location.origin + window.location.pathname,
      },
      cache: { cacheLocation: 'localStorage' },
    });
    // MSAL v3 requires initialize(); v2 doesn't have it — guard for both.
    __msalInit = __msalApp.initialize ? __msalApp.initialize() : Promise.resolve();
  }
  await __msalInit;
  return __msalApp;
}

async function getGraphToken() {
  const app = await getMsal();
  const scopes = teamsScopes();
  let account = app.getActiveAccount() || app.getAllAccounts()[0];
  if (!account) {
    const res = await app.loginPopup({ scopes });
    account = res.account;
    app.setActiveAccount(account);
  }
  try {
    const res = await app.acquireTokenSilent({ scopes, account });
    return res.accessToken;
  } catch (e) {
    const res = await app.acquireTokenPopup({ scopes });
    return res.accessToken;
  }
}

async function graphGet(path, token) {
  const r = await fetch('https://graph.microsoft.com/v1.0' + path, {
    headers: { Authorization: 'Bearer ' + token },
  });
  if (!r.ok) {
    let detail = ''; try { detail = (await r.text()).slice(0, 300); } catch (e) {}
    throw new Error('Graph ' + r.status + ': ' + (detail || r.statusText));
  }
  return r.json();
}

// Pull the signed-in student's Teams (EDU) assignments across all classes.
async function fetchTeamsAssignments() {
  const token = await getGraphToken();
  const classes = (await graphGet('/education/me/classes', token)).value || [];
  const items = [];
  for (const c of classes) {
    let data;
    try { data = await graphGet('/education/classes/' + c.id + '/assignments', token); }
    catch (e) { continue; } // no assignment access to this class — skip it
    (data.value || []).forEach(a => {
      if (a.status === 'draft') return;
      items.push({
        teamsId: a.id,
        className: c.displayName || 'Class',
        title: a.displayName || 'Assignment',
        due: a.dueDateTime ? String(a.dueDateTime).slice(0, 10) : null,
      });
    });
  }
  return items;
}

// Best-effort subject match from the class/assignment name.
function guessSubject(text) {
  const t = (text || '').toLowerCase();
  for (const s of SUBJECTS_LIST) {
    if (s.key === 'Custom') continue;
    if (t.includes(s.key.toLowerCase())) return s.key;
  }
  if (/\b(math|calculus|algebra|trig|geometry)/.test(t)) return 'Maths';
  if (/\b(cs|program|comput|coding|software)/.test(t)) return 'Computer Science';
  if (/\bchem/.test(t)) return 'Chemistry';
  if (/\bphys/.test(t)) return 'Physics';
  if (/\bbio/.test(t)) return 'Biology';
  if (/\b(english|essay|lit)/.test(t)) return 'English';
  if (/\b(mandarin|chinese)/.test(t)) return 'Mandarin';
  if (/\b(business|econ)/.test(t)) return 'Business';
  if (/\bmusic/.test(t)) return 'Music';
  return 'Custom';
}

// Duration default: reuse the minutes you already set for that subject's
// recurring template; fall back to 60. Editable per row before importing.
function subjectDefaultMins(state, subject) {
  const r = (state.recurring || []).find(x => x.subject === subject);
  return (r && r.mins) || 60;
}

// ── Import modal ─────────────────────────────────────────────
function TeamsImportModal({ onClose }) {
  const { state, set } = useStore();
  const [phase, setPhase] = React.useState('idle'); // idle | loading | list | error
  const [error, setError] = React.useState('');
  const [rows, setRows] = React.useState([]);

  const existing = React.useMemo(
    () => new Set(state.tasks.filter(t => t.teamsId).map(t => t.teamsId)),
    [state.tasks]
  );

  const load = async () => {
    setPhase('loading'); setError('');
    try {
      const items = await fetchTeamsAssignments();
      setRows(items.map(it => {
        const subject = guessSubject(it.className + ' ' + it.title);
        return {
          item: it, subject, mins: subjectDefaultMins(state, subject),
          imported: existing.has(it.teamsId), sel: !existing.has(it.teamsId),
        };
      }));
      setPhase('list');
    } catch (e) {
      setError(e.message || String(e));
      setPhase('error');
    }
  };

  const upd = (i, patch) => setRows(rs => rs.map((r, j) => j === i ? { ...r, ...patch } : r));

  const doImport = () => {
    const picks = rows.filter(r => r.sel && !r.imported);
    if (picks.length) {
      const tasks = picks.map(r => ({
        id: 't-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
        label: r.item.title, subject: r.subject, mins: Number(r.mins) || 60,
        due: r.item.due || null, blockKey: null, source: 'teams', teamsId: r.item.teamsId,
      }));
      set(s => ({ ...s, tasks: [...s.tasks, ...tasks] }));
      toast('Imported ' + tasks.length + ' from Teams', { kind: 'voice' });
    }
    onClose();
  };

  const selCount = rows.filter(r => r.sel && !r.imported).length;

  return (
    <Modal onClose={onClose}>
      <div className="modal-head">
        <h3>Import from Microsoft Teams</h3>
        <button className="close" onClick={onClose}>✕</button>
      </div>
      <div className="modal-body">
        {!window.STUDY_TEAMS_ENABLED ? (
          <div className="teams-setup">
            <p>Teams import isn't set up on this build yet. To enable it:</p>
            <ol>
              <li>Azure Portal → <b>Microsoft Entra ID → App registrations</b> → register a <b>Single-page application</b>.</li>
              <li>Add the redirect URI <span className="mono">{window.location.origin + window.location.pathname}</span>.</li>
              <li>Grant delegated Graph permissions: <span className="mono">EduAssignments.ReadBasic</span>, <span className="mono">EduRoster.ReadBasic</span>, <span className="mono">User.Read</span>.</li>
              <li>Put the Application (client) ID into <span className="mono">teams-config.js</span>.</li>
            </ol>
          </div>
        ) : phase === 'idle' ? (
          <div className="teams-connect">
            <p>Pull your class assignments from Teams into the backlog. You'll sign in with your school Microsoft account.</p>
            <button className="btn primary" onClick={load}>Connect Microsoft Teams</button>
          </div>
        ) : phase === 'loading' ? (
          <div className="teams-connect"><p>Loading your assignments…</p></div>
        ) : phase === 'error' ? (
          <div className="teams-connect">
            <div className="teams-err">{error}</div>
            <button className="btn" style={{ marginTop: 10 }} onClick={load}>Try again</button>
          </div>
        ) : rows.length === 0 ? (
          <div className="teams-connect"><p>No assignments found in your Teams classes.</p></div>
        ) : (
          <div className="teams-list">
            {rows.map((r, i) => (
              <div key={r.item.teamsId} className={"teams-row" + (r.imported ? ' imported' : '')}>
                <input type="checkbox" checked={r.sel} disabled={r.imported}
                  onChange={e => upd(i, { sel: e.target.checked })}/>
                <div className="tr-main">
                  <div className="tr-title">{r.item.title}</div>
                  <div className="tr-sub">
                    {r.item.className}{r.item.due ? ' · due ' + r.item.due : ''}{r.imported ? ' · already imported' : ''}
                  </div>
                </div>
                <select className="input tr-subj" value={r.subject} disabled={r.imported}
                  onChange={e => upd(i, { subject: e.target.value, mins: subjectDefaultMins(state, e.target.value) })}>
                  {SUBJECTS_LIST.filter(s => s.key !== 'Custom').map(s => <option key={s.key} value={s.key}>{s.key}</option>)}
                  <option value="Custom">Custom</option>
                </select>
                <input type="number" min="5" step="5" className="input tr-mins" value={r.mins} disabled={r.imported}
                  onChange={e => upd(i, { mins: e.target.value })}/>
                <span className="tr-m">m</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="modal-foot">
        <div className="hint">imports as one-off backlog tasks</div>
        <button className="btn ghost" onClick={onClose}>Close</button>
        {window.STUDY_TEAMS_ENABLED && phase === 'list' &&
          <button className="btn primary" onClick={doImport} disabled={!selCount}>Import {selCount || ''}</button>}
      </div>
    </Modal>
  );
}

Object.assign(window, {
  getMsal, getGraphToken, fetchTeamsAssignments, guessSubject, subjectDefaultMins, TeamsImportModal,
});
