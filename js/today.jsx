// ─────────────────────────────────────────────────────────────
// today.jsx — the "now" home screen: what to do this moment, a
//   one-tap Start, and a weekly payoff summary. Default route.
// ─────────────────────────────────────────────────────────────

function TodayView() {
  const { state, set } = useStore();
  useSession(); // re-render when a session starts/ends so Start buttons update
  const now = new Date();
  const dISO = isoDate(now);
  const wk = weekdayKey(now);
  const slots = state.schedule[wk] || [];
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const weekStart = mondayOf(now);

  // Classify today's blocks relative to the clock.
  const blocks = slots.map(sl => {
    const bk = blockKeyOf(dISO, sl.id);
    const start = parseTime(sl.start), end = parseTime(sl.end);
    const phase = nowMin >= end ? 'past' : nowMin >= start ? 'now' : 'upcoming';
    return { sl, bk, start, end, phase };
  });
  const currentBlock = blocks.find(b => b.phase === 'now');
  const nextBlock = blocks.find(b => b.phase === 'upcoming');
  const focus = currentBlock || nextBlock;

  const streak = currentStreak(state);
  const recap = weeklyRecap(state, weekStart);
  const hr = now.getHours();
  const greeting = hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';

  const planWeek = () => {
    const adds = autoPlanWeek(state, weekStart);
    if (!adds.length) { toast("Week already planned — you're on track", { kind: 'voice' }); return; }
    set(s => ({ ...s, tasks: [...s.tasks, ...adds] }));
    toast(`Planned ${adds.length} session${adds.length > 1 ? 's' : ''} across your week`, { kind: 'voice' });
  };

  const renderTasks = (bk, slotLabel) => {
    const tasks = tasksInBlock(state, bk);
    if (!tasks.length) {
      return (
        <div className="today-empty-block">
          Nothing here yet — <a onClick={() => window.dispatchEvent(new CustomEvent('open-add-task', { detail: { blockKey: bk } }))}>add a task</a> or <a onClick={planWeek}>plan the week</a>.
        </div>
      );
    }
    return tasks.map(t => (
      <div key={t.id} className={"today-task" + (t.done ? ' done' : '')}>
        <span className="bar3" style={{ background: subjectColor(t.subject) }}/>
        <div className="tt-l">
          <div className="tt-name">{t.label}</div>
          <div className="tt-meta">{t.subject} · {t.mins}m</div>
        </div>
        <StartButton task={t} blockLabel={`${wk} · ${slotLabel}`}/>
      </div>
    ));
  };

  return (
    <div className="main no-right">
      <Sidebar weekStartDate={weekStart} weekStartISO={isoDate(weekStart)}/>
      <main className="content">
        <div className="content-head">
          <div>
            <h1>{greeting}</h1>
            <div className="sub">{wk} · {fmtDayShort(now)} · {slots.length ? `${slots.length} block${slots.length > 1 ? 's' : ''} today` : 'rest day'}</div>
          </div>
          <div className="today-streak" title="Consecutive days with a logged session">
            <div className="ts-num">{streak}</div>
            <div className="ts-lbl">day{streak === 1 ? '' : 's'}<br/>streak</div>
          </div>
        </div>

        {focus ? (
          <div className={"today-focus" + (currentBlock ? ' live' : '')}>
            <div className="tf-head">
              <span className="tf-tag">{currentBlock ? 'RIGHT NOW' : 'NEXT UP'}</span>
              <span className="tf-title">{focus.sl.label}</span>
              <span className="tf-time mono">{fmtTimeRange(focus.sl)}</span>
            </div>
            <div className="tf-tasks">{renderTasks(focus.bk, focus.sl.label)}</div>
          </div>
        ) : slots.length ? (
          <div className="today-focus done">
            <div className="tf-head"><span className="tf-tag">DONE FOR TODAY</span></div>
            <p className="tf-rest">Today's blocks are behind you.{recap.count ? ` ${recap.count} session${recap.count > 1 ? 's' : ''} logged this week.` : ''}</p>
          </div>
        ) : (
          <div className="today-focus rest">
            <div className="tf-head"><span className="tf-tag">REST DAY</span></div>
            <p className="tf-rest">No blocks scheduled today. Plan ahead or take the break.</p>
          </div>
        )}

        {focus && blocks.filter(b => b.bk !== focus.bk).length > 0 && (
          <div className="today-rest-blocks">
            <div className="h-label" style={{ margin: '18px 4px 8px' }}>Rest of today</div>
            {blocks.filter(b => b.bk !== focus.bk).map(b => (
              <div key={b.bk} className={"today-mini " + b.phase}>
                <span className="tm-time mono">{fmtTimeRangeShort(b.sl)}</span>
                <span className="tm-label">{b.sl.label}</span>
                <span className="tm-cap mono">{blockUsedMins(state, b.bk)}/{b.sl.mins}m</span>
              </div>
            ))}
          </div>
        )}

        <div className="today-week">
          <div className="tw-head">
            <span className="h-label">This week</span>
            <button className="btn sm primary" onClick={planWeek} title="Fill open blocks from your weekly targets">✦ Plan my week</button>
          </div>
          <div className="tw-stats">
            <div className="tw-stat"><div className="n">{recap.count}</div><div className="l">sessions</div></div>
            <div className="tw-stat"><div className="n">{Math.round(recap.mins / 60 * 10) / 10}</div><div className="l">hours</div></div>
            <div className="tw-stat"><div className="n">{recap.subjectsHit}/{recap.subjectsTotal}</div><div className="l">targets hit</div></div>
            <div className="tw-stat"><div className="n">{recap.struggles}</div><div className="l">to review</div></div>
          </div>
          {recap.subjectsTotal > 0 && recap.subjectsHit === recap.subjectsTotal && (
            <div className="tw-win voice">🎉 Every subject target hit this week — well done.</div>
          )}
        </div>

        <ReminderPrompt/>
      </main>
    </div>
  );
}

// Small opt-in nudge; hidden once granted or if the browser can't notify.
function ReminderPrompt() {
  const [perm, setPerm] = React.useState(reminderPermission());
  if (perm === 'granted' || perm === 'unsupported') return null;
  return (
    <div className="today-reminder">
      <span>🔔 Get a nudge 10 minutes before each block.</span>
      <button className="btn sm" disabled={perm === 'denied'}
        onClick={async () => {
          const p = await requestReminderPermission();
          setPerm(p);
          if (p === 'granted') toast('Reminders on', { kind: 'voice' });
        }}>
        {perm === 'denied' ? 'Blocked in browser settings' : 'Enable reminders'}
      </button>
    </div>
  );
}

Object.assign(window, { TodayView, ReminderPrompt });
