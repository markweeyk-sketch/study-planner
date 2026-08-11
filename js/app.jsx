// ─────────────────────────────────────────────────────────────
// app.jsx — top-level: auth gate, store provider, router, chrome
// ─────────────────────────────────────────────────────────────

function App() {
  const [authState, setAuthState] = React.useState({ status: 'loading', user: null });
  const [localFallback, setLocalFallback] = React.useState(false);
  const [installable, setInstallable] = React.useState(false);
  const [addTaskOpen, setAddTaskOpen] = React.useState(null);  // {label?, blockKey?} or null
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [teamsOpen, setTeamsOpen] = React.useState(false);

  // Auth
  React.useEffect(() => {
    const unsub = onAuthChanged((user) => {
      if (user) {
        setAuthState({ status: 'signed-in', user });
      } else {
        setAuthState({ status: 'signed-out', user: null });
      }
    });
    return () => unsub && unsub();
  }, []);

  // Install prompt
  React.useEffect(() => {
    const onInstall = () => setInstallable(true);
    window.addEventListener('installable', onInstall);
    return () => window.removeEventListener('installable', onInstall);
  }, []);

  const installApp = async () => {
    const p = window.__deferredInstallPrompt;
    if (!p) return;
    p.prompt();
    await p.userChoice;
    window.__deferredInstallPrompt = null;
    setInstallable(false);
  };

  // Open add-task modal from any event
  React.useEffect(() => {
    const fn = (ev) => setAddTaskOpen(ev.detail || {});
    window.addEventListener('open-add-task', fn);
    return () => window.removeEventListener('open-add-task', fn);
  }, []);

  // Open the Teams import modal from any event
  React.useEffect(() => {
    const fn = () => setTeamsOpen(true);
    window.addEventListener('open-teams-import', fn);
    return () => window.removeEventListener('open-teams-import', fn);
  }, []);

  // Global keyboard shortcuts (Ctrl+K, Ctrl+N)
  React.useEffect(() => {
    const fn = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        setAddTaskOpen({});
      }
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, []);

  if (authState.status === 'loading') {
    return (
      <div className="splash">
        <div className="splash-logo">S</div>
        <div className="splash-text">Loading…</div>
      </div>
    );
  }

  if (authState.status === 'signed-out' && !localFallback) {
    return <SignInScreen onLocalContinue={() => {
      setAuthState({ status:'signed-in', user: { uid: ANON_UID, displayName: 'You', local:true } });
      setLocalFallback(true);
    }}/>;
  }

  return (
    <StoreShell user={authState.user}>
      <Chrome
        user={authState.user}
        installable={installable}
        onInstall={installApp}
        onAdd={() => setAddTaskOpen({})}
        onPalette={() => setPaletteOpen(true)}
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
      />
      {addTaskOpen && <AddTaskModal
        defaultBlockKey={addTaskOpen.blockKey}
        defaultSubject={addTaskOpen.subject}
        onClose={() => setAddTaskOpen(null)}/>}
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)}/>}
      {teamsOpen && <TeamsImportModal onClose={() => setTeamsOpen(false)}/>}
      <SessionTimer/>
      <Reminders/>
      <Toaster/>
    </StoreShell>
  );
}

// ─── Store shell: load state per-user, persist on change ─────
// localStorage is always the instant local cache. Firestore (when this
// is a real signed-in account, not local-only) is the cross-device
// source of truth. The critical rule: never write to Firestore until
// the initial fetch for this uid has resolved. Without that guard, a
// brand-new device starts with an empty default state and — if it
// writes before it's actually seen what's already on the server — can
// push that emptiness up and clobber data a different device already
// synced. readyRef enforces the "load before write" ordering.
function StoreShell({ user, children }) {
  const isRemote = window.STUDY_FIREBASE_ENABLED && !user.local;
  const [state, setStateInternal] = React.useState(() => loadState(user.uid));
  const [ready, setReady] = React.useState(!isRemote);
  const readyRef = React.useRef(!isRemote);
  const saveTimer = React.useRef(null);

  React.useEffect(() => {
    let cancelled = false;
    clearTimeout(saveTimer.current);

    const cached = loadState(user.uid);
    setStateInternal(cached);
    saveState(user.uid, cached); // persist any timezone migration applied on load
    readyRef.current = !isRemote;
    setReady(!isRemote);

    if (isRemote) {
      loadRemoteState(user.uid).then(remote => {
        if (cancelled) return;
        if (remote) {
          // Remote already has data for this account — it wins. Refresh
          // the local cache to match so offline reloads stay consistent.
          const merged = migrateState(Object.assign(emptyState(), remote));
          setStateInternal(merged);
          saveState(user.uid, merged);
          // If the server copy predates the timezone fix, push the migrated
          // version up so every device converges on the corrected dates.
          if (!remote.tzMigrated) saveRemoteState(user.uid, merged);
        } else {
          // No remote document yet for this account. Seed it from
          // whatever's cached on this device (real data or a fresh
          // emptyState) — there's nothing on the server to clobber.
          saveRemoteState(user.uid, cached);
        }
        readyRef.current = true;
        setReady(true);
      });
    }

    return () => { cancelled = true; clearTimeout(saveTimer.current); };
  }, [user.uid, isRemote]);

  const setState = React.useCallback((updater) => {
    setStateInternal(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      saveState(user.uid, next); // local cache: always, instant
      if (isRemote && readyRef.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => saveRemoteState(user.uid, next), 700);
      }
      return next;
    });
  }, [user.uid, isRemote]);

  const ctx = React.useMemo(() => ({ state, set: setState, uid: user.uid }), [state, setState, user.uid]);

  if (!ready) {
    return (
      <div className="splash">
        <div className="splash-logo">S</div>
        <div className="splash-text">Syncing…</div>
      </div>
    );
  }

  return <StoreCtx.Provider value={ctx}>{children}</StoreCtx.Provider>;
}

// ─── Chrome: topbar + view router ────────────────────────────
function Chrome({ user, installable, onInstall, onAdd, onPalette, menuOpen, setMenuOpen }) {
  const [hash, nav] = useHash();
  const route = hash.split('?')[0] || 'today';

  // Layout mode: 'auto' resolves to stacked on portrait/narrow screens
  // (e.g. a 1080-wide vertical monitor) and panels on wide ones; the user
  // can pin either from the top-bar toggle.
  const NARROW = '(orientation: portrait), (max-width: 1100px)';
  const [layoutPref, setLayoutPrefState] = React.useState(() => loadLayoutPref());
  const [isNarrow, setIsNarrow] = React.useState(() => window.matchMedia(NARROW).matches);
  React.useEffect(() => {
    const mq = window.matchMedia(NARROW);
    const fn = () => setIsNarrow(mq.matches);
    mq.addEventListener ? mq.addEventListener('change', fn) : mq.addListener(fn);
    return () => { mq.removeEventListener ? mq.removeEventListener('change', fn) : mq.removeListener(fn); };
  }, []);
  const effectiveLayout = layoutPref === 'auto' ? (isNarrow ? 'stacked' : 'panels') : layoutPref;
  const setLayout = (v) => { setLayoutPrefState(v); saveLayoutPref(v); };

  const initial = (user.displayName || user.email || 'U').slice(0,1).toUpperCase();

  return (
    <div className="app" data-layout={effectiveLayout}>
      <header className="topbar">
        <div className="brand">
          <div className="logo">S</div>
          <span>Study Planner</span>
        </div>
        <nav className="topnav">
          {[
            ['today','Today'], ['week','Week'], ['day','Day'], ['manage','Manage'],
            ['log','Log'], ['schedule','Schedule'],
          ].map(([h, label]) => (
            <button key={h} className={route===h ? 'active' : ''} onClick={() => nav(h)}>
              {label}
            </button>
          ))}
        </nav>
        <div className="right">
          <div className="view-toggle" title="Layout: stacked for a vertical monitor, panels for a wide one">
            <button className={effectiveLayout==='panels' ? 'active' : ''}
              onClick={() => setLayout('panels')} title="Panels (side-by-side)">▤</button>
            <button className={effectiveLayout==='stacked' ? 'active' : ''}
              onClick={() => setLayout('stacked')} title="Stacked (single column)">≡</button>
          </div>
          {installable && (
            <button className="install-btn" onClick={onInstall} title="Install as app">
              ↓ Install
            </button>
          )}
          <button className="btn sm" onClick={onPalette} title="Command palette (Ctrl+K)">
            <span style={{ fontSize:13 }}>⌕</span>
            <span style={{ marginLeft:2 }} className="kbd">Ctrl K</span>
          </button>
          <button className="btn sm primary" onClick={onAdd} title="New task (Ctrl+N)">
            <span style={{ fontWeight:600 }}>+</span> Task
          </button>
          <UserMenu user={user} open={menuOpen} setOpen={setMenuOpen}/>
        </div>
      </header>

      {route === 'today'    && <TodayView/>}
      {route === 'week'     && <WeekView/>}
      {route === 'day'      && <DayView/>}
      {route === 'manage'   && <ManageView/>}
      {route === 'log'      && <LogView/>}
      {route === 'schedule' && <ScheduleView/>}
    </div>
  );
}

function UserMenu({ user, open, setOpen }) {
  const initial = (user.displayName || user.email || 'U').slice(0,1).toUpperCase();
  const ref = React.useRef(null);

  React.useEffect(() => {
    if (!open) return;
    const fn = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    window.addEventListener('mousedown', fn);
    return () => window.removeEventListener('mousedown', fn);
  }, [open, setOpen]);

  const out = async () => {
    if (window.STUDY_FIREBASE_ENABLED) await signOut();
    location.reload();
  };

  return (
    <div ref={ref} style={{ position:'relative' }}>
      <button className="avatar" onClick={() => setOpen(v => !v)} title={user.displayName || user.email || 'Account'}>
        {initial}
      </button>
      {open && (
        <div className="menu">
          <div style={{ padding:'8px 10px 10px', borderBottom:'1px solid var(--border)', marginBottom:6 }}>
            <div style={{ fontSize:13, fontWeight:500 }}>{user.displayName || 'You'}</div>
            <div style={{ fontSize:11.5, color:'var(--muted)', marginTop:2 }}>
              {user.email || (user.local ? 'local-only' : 'signed in')}
            </div>
          </div>
          <button className="item" onClick={() => { setOpen(false); window.location.hash = 'schedule'; }}>
            Edit study blocks
          </button>
          <button className="item" onClick={() => { setOpen(false); window.location.hash = 'manage'; }}>
            Manage recurring tasks
          </button>
          <button className="item" onClick={() => { setOpen(false); window.dispatchEvent(new CustomEvent('open-teams-import')); }}>
            Import from Teams
          </button>
          <div className="sep"/>
          <button className="item" onClick={() => {
            if (window.confirm('Reset all data? This wipes your schedule, tasks, and log on this device.')) {
              localStorage.removeItem(STORAGE_KEY_PREFIX + user.uid);
              location.reload();
            }
          }}>Reset data</button>
          <button className="item danger" onClick={out}>
            {user.local ? 'Switch account' : 'Sign out'}
          </button>
        </div>
      )}
    </div>
  );
}

// Mount
ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
