import { useEffect, useMemo, useState } from 'react';

type AttendanceEntry = {
  id: string;
  type: 'in' | 'out';
  timestamp: string;
};

const STORAGE_KEY = 'attendance-tracker-entries';

const formatTime = (iso: string) => new Intl.DateTimeFormat('default', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
}).format(new Date(iso));

const formatDate = (iso: string) => new Intl.DateTimeFormat('default', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
}).format(new Date(iso));

const calculateIntervals = (entries: AttendanceEntry[]) => {
  const intervals: { start: Date; end: Date; hours: number }[] = [];
  for (let i = 0; i < entries.length - 1; i += 2) {
    const current = entries[i];
    const next = entries[i + 1];
    if (current.type === 'in' && next.type === 'out') {
      const start = new Date(current.timestamp);
      const end = new Date(next.timestamp);
      if (end > start) {
        intervals.push({
          start,
          end,
          hours: (end.getTime() - start.getTime()) / 1000 / 60 / 60,
        });
      }
    }
  }
  return intervals;
};

const calculateHours = (entries: AttendanceEntry[]) => calculateIntervals(entries)
  .reduce((sum, interval) => sum + interval.hours, 0);

const startOfDay = (date: Date) => {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
};

const getWeekStart = (date: Date) => {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  const day = result.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  result.setDate(result.getDate() + diff);
  return result;
};

const getDayKey = (date: Date) => startOfDay(date).toISOString().slice(0, 10);
const getWeekKey = (date: Date) => getWeekStart(date).toISOString().slice(0, 10);

const sumHoursByKey = (
  intervals: { start: Date; end: Date; hours: number }[],
  keyFn: (date: Date) => string,
) => {
  const map = new Map<string, number>();
  intervals.forEach((interval) => {
    const key = keyFn(interval.start);
    map.set(key, (map.get(key) ?? 0) + interval.hours);
  });
  return map;
};

const formatDayLabel = (date: Date) => new Intl.DateTimeFormat('default', {
  weekday: 'short',
}).format(date);

const formatWeekLabel = (date: Date) => {
  const parts = new Intl.DateTimeFormat('default', {
    month: 'short',
    day: 'numeric',
  }).format(date);
  return `Week of ${parts}`;
};

type FilterOption = 'all' | 'week' | 'month';

const getTodayEntries = (entries: AttendanceEntry[]) => {
  const today = new Date();
  return entries.filter((entry) => {
    const d = new Date(entry.timestamp);
    return d.getFullYear() === today.getFullYear()
      && d.getMonth() === today.getMonth()
      && d.getDate() === today.getDate();
  });
};

const getWeekEntries = (entries: AttendanceEntry[]) => {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - 6);
  return entries.filter((entry) => {
    const d = new Date(entry.timestamp);
    return d >= start && d <= now;
  });
};

const getMonthEntries = (entries: AttendanceEntry[]) => {
  const today = new Date();
  return entries.filter((entry) => {
    const d = new Date(entry.timestamp);
    return d.getFullYear() === today.getFullYear()
      && d.getMonth() === today.getMonth();
  });
};

const getFilteredEntries = (entries: AttendanceEntry[], filter: FilterOption) => {
  if (filter === 'week') return getWeekEntries(entries);
  if (filter === 'month') return getMonthEntries(entries);
  return entries;
};

function App() {
  const [entries, setEntries] = useState<AttendanceEntry[]>([]);
  const [message, setMessage] = useState('');
  const [viewFilter, setViewFilter] = useState<FilterOption>('all');

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setEntries(JSON.parse(saved));
      } catch {
        setEntries([]);
      }
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }, [entries]);

  const lastEntry = entries[entries.length - 1];
  const nextAction = lastEntry?.type === 'in' ? 'out' : 'in';

  const addEntry = (type: 'in' | 'out') => {
    const now = new Date().toISOString();
    const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    setEntries((prev) => [...prev, { id, type, timestamp: now }]);
    setMessage(`Recorded ${type === 'in' ? 'clock in' : 'clock out'} at ${formatTime(now)}`);
  };

  const deleteEntry = (id: string) => {
    setEntries((prev) => prev.filter((entry) => entry.id !== id));
    setMessage('Entry removed.');
  };

  const intervals = useMemo(() => calculateIntervals(entries), [entries]);
  const totalHours = useMemo(() => intervals
    .reduce((sum, interval) => sum + interval.hours, 0), [intervals]);
  const todayEntries = useMemo(() => getTodayEntries(entries), [entries]);
  const weekEntries = useMemo(() => getWeekEntries(entries), [entries]);
  const monthEntries = useMemo(() => getMonthEntries(entries), [entries]);
  const filteredEntries = useMemo(() => getFilteredEntries(entries, viewFilter), [entries, viewFilter]);
  const todayHours = useMemo(() => calculateHours(todayEntries), [todayEntries]);
  const weekHours = useMemo(() => calculateHours(weekEntries), [weekEntries]);
  const monthHours = useMemo(() => calculateHours(monthEntries), [monthEntries]);
  const filteredHours = useMemo(() => calculateHours(filteredEntries), [filteredEntries]);
  const dailyHoursMap = useMemo(() => sumHoursByKey(intervals, getDayKey), [intervals]);
  const weeklyHoursMap = useMemo(() => sumHoursByKey(intervals, getWeekKey), [intervals]);
  const daySeries = useMemo(() => {
    const today = new Date();
    return Array.from({ length: 7 }, (_, idx) => {
      const date = new Date(today);
      date.setDate(today.getDate() - 6 + idx);
      return {
        label: formatDayLabel(date),
        hours: dailyHoursMap.get(getDayKey(date)) ?? 0,
      };
    });
  }, [dailyHoursMap]);
  const weekSeries = useMemo(() => Array.from(weeklyHoursMap.entries())
    .map(([key, hours]) => ({ key, start: new Date(key), hours }))
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .slice(-4)
    .map((item) => ({
      label: formatWeekLabel(item.start),
      hours: item.hours,
    })), [weeklyHoursMap]);
  const trackedWeeks = weeklyHoursMap.size;
  const avgWeeklyHours = trackedWeeks
    ? Array.from(weeklyHoursMap.values()).reduce((sum, hours) => sum + hours, 0) / trackedWeeks
    : 0;
  const graphDailyMax = Math.max(...daySeries.map((point) => point.hours), 1);
  const graphWeeklyMax = Math.max(...weekSeries.map((point) => point.hours), 1);

  return (
    <div className="page-shell">
      <header>
        <div>
          <p className="eyebrow">Attendance Tracker</p>
          <h1>Work hour logging</h1>
          <p>Track clock in/out times with daily and overall statistics.</p>
        </div>
      </header>

      <main>
        <section className="control-panel card">
          <button className="primary-btn" onClick={() => addEntry(nextAction)}>
            {nextAction === 'in' ? 'Clock In' : 'Clock Out'}
          </button>
          <div className="status-pill">
            {lastEntry ? `Last event: ${lastEntry.type.toUpperCase()} at ${formatTime(lastEntry.timestamp)}` : 'No entries yet'}
          </div>
          <div className="filter-group">
            <button
              className={`filter-btn ${viewFilter === 'all' ? 'active' : ''}`}
              onClick={() => setViewFilter('all')}
            >
              All
            </button>
            <button
              className={`filter-btn ${viewFilter === 'week' ? 'active' : ''}`}
              onClick={() => setViewFilter('week')}
            >
              Weekly
            </button>
            <button
              className={`filter-btn ${viewFilter === 'month' ? 'active' : ''}`}
              onClick={() => setViewFilter('month')}
            >
              Monthly
            </button>
          </div>
          {message && <div className="toast">{message}</div>}
        </section>

        <section className="stats-grid card">
          <div>
            <h2>Total hours</h2>
            <p>{totalHours.toFixed(2)}h</p>
          </div>
          <div>
            <h2>Avg hours / week</h2>
            <p>{avgWeeklyHours.toFixed(2)}h</p>
          </div>
          <div>
            <h2>This month</h2>
            <p>{monthHours.toFixed(2)}h</p>
          </div>
          <div>
            <h2>Today</h2>
            <p>{todayHours.toFixed(2)}h</p>
          </div>
          <div>
            <h2>Visible hours</h2>
            <p>{filteredHours.toFixed(2)}h</p>
          </div>
          <div>
            <h2>Tracked weeks</h2>
            <p>{trackedWeeks}</p>
          </div>
        </section>

        <section className="graphs card">
          <div className="graph-card">
            <div className="graph-card-header">
              <div>
                <h3>Daily hours</h3>
                <p>Last 7 days</p>
              </div>
              <div>{daySeries.reduce((sum, item) => sum + item.hours, 0).toFixed(2)}h total</div>
            </div>
            <div className="bar-chart">
              {daySeries.map((point) => (
                <div className="bar-item" key={point.label}>
                  <div
                    className="bar"
                    style={{ height: `${(point.hours / graphDailyMax) * 100}%` }}
                    title={`${point.hours.toFixed(2)}h`}
                  />
                  <span className="bar-label">{point.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="graph-card">
            <div className="graph-card-header">
              <div>
                <h3>Weekly hours</h3>
                <p>Last 4 weeks</p>
              </div>
              <div>{avgWeeklyHours.toFixed(2)}h avg</div>
            </div>
            <div className="bar-chart">
              {weekSeries.map((point) => (
                <div className="bar-item" key={point.label}>
                  <div
                    className="bar"
                    style={{ height: `${(point.hours / graphWeeklyMax) * 100}%` }}
                    title={`${point.hours.toFixed(2)}h`}
                  />
                  <span className="bar-label">{point.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="log card">
          <div className="log-header">
            <div>
              <h2>Attendance log</h2>
              <p className="log-subtitle">Showing {viewFilter === 'all' ? 'all entries' : viewFilter === 'week' ? 'last 7 days' : 'this month'}</p>
            </div>
            <span>{filteredEntries.length} records</span>
          </div>
          {entries.length === 0 ? (
            <p className="empty-state">No clock in/out events yet. Start by pressing the button above.</p>
          ) : filteredEntries.length === 0 ? (
            <p className="empty-state">No entries match this view. Try another filter or add more records.</p>
          ) : (
            <div className="entry-list">
              {filteredEntries.slice().reverse().map((entry) => (
                <div key={entry.id} className="entry-row">
                  <div>
                    <strong>{entry.type === 'in' ? 'In' : 'Out'}</strong>
                    <div>{formatTime(entry.timestamp)}</div>
                  </div>
                  <div className="entry-actions">
                    <div>{formatDate(entry.timestamp)}</div>
                    <button
                      className="delete-btn"
                      onClick={() => deleteEntry(entry.id)}
                      aria-label={`Delete ${entry.type} entry at ${formatTime(entry.timestamp)}`}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
