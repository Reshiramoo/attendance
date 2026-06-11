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

const formatHours = (hours: number) => {
  if (hours >= 1) return `${hours.toFixed(2)}h`;
  if (hours >= 1 / 60) return `${Math.round(hours * 60)}m`;
  if (hours > 0) return `${Math.round(hours * 3600)}s`;
  return '0h';
};

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

const hoursBetween = (start: Date, end: Date) => Math.max(0, (end.getTime() - start.getTime()) / 1000 / 60 / 60);

const splitIntervalByDay = (interval: { start: Date; end: Date; hours: number }) => {
  const segments: { date: Date; end: Date; hours: number }[] = [];
  let currentStart = new Date(interval.start);

  while (currentStart < interval.end) {
    const nextBoundary = new Date(currentStart);
    nextBoundary.setHours(24, 0, 0, 0);
    const segmentEnd = interval.end < nextBoundary ? interval.end : nextBoundary;

    segments.push({
      date: new Date(currentStart),
      end: segmentEnd,
      hours: hoursBetween(currentStart, segmentEnd),
    });

    currentStart = segmentEnd;
  }

  return segments;
};

const sumHoursByKey = (
  intervals: { start: Date; end: Date; hours: number }[],
  keyFn: (date: Date) => string,
) => {
  const map = new Map<string, number>();
  intervals.forEach((interval) => {
    splitIntervalByDay(interval).forEach((segment) => {
      const key = keyFn(segment.date);
      map.set(key, (map.get(key) ?? 0) + segment.hours);
    });
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

const toMinutesSinceMidnight = (date: Date) => date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
const timeOfDayPercent = (date: Date) => ((date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60) / 1440) * 100;

const formatTimeOfDay = (minutes: number) => {
  const totalSeconds = Math.round(minutes * 60);
  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
};

const averageTimeOfDay = (values: number[]) => {
  if (values.length === 0) return null;
  const sum = values.reduce((acc, value) => acc + value, 0);
  return sum / values.length;
};

type FilterOption = 'all' | 'week' | 'month';
type PanelOption = 'summary' | 'graphs' | 'advanced';

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
  const [activePanel, setActivePanel] = useState<PanelOption>('summary');

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setEntries(parsed.map((entry) => ({
            id: entry.id ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`,
            type: entry.type,
            timestamp: entry.timestamp,
          })));
          return;
        }
      } catch {
        // fall through
      }
    }
    setEntries([]);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }, [entries]);

  const lastEntry = entries[entries.length - 1];
  const nextAction = lastEntry?.type === 'in' ? 'out' : 'in';
  const isWorking = lastEntry?.type === 'in';
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

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

  const intervals = useMemo(() => {
    const result = calculateIntervals(entries);
    if (lastEntry?.type === 'in') {
      const activeStart = new Date(lastEntry.timestamp);
      const activeEnd = currentTime;
      if (activeEnd > activeStart) {
        result.push({
          start: activeStart,
          end: activeEnd,
          hours: hoursBetween(activeStart, activeEnd),
        });
      }
    }
    return result;
  }, [entries, lastEntry, currentTime]);
  const totalHours = useMemo(() => intervals
    .reduce((sum, interval) => sum + interval.hours, 0), [intervals]);
  const filteredEntries = useMemo(() => getFilteredEntries(entries, viewFilter), [entries, viewFilter]);
  const uniqueFilteredEntryDays = useMemo(
    () => new Set(filteredEntries.map((entry) => getDayKey(new Date(entry.timestamp)))).size,
    [filteredEntries],
  );
  const avgEntriesPerDay = uniqueFilteredEntryDays ? filteredEntries.length / uniqueFilteredEntryDays : 0;
  const avgInTimeMinutes = useMemo(() => {
    const inMinutes = filteredEntries
      .filter((entry) => entry.type === 'in')
      .map((entry) => toMinutesSinceMidnight(new Date(entry.timestamp)));
    return averageTimeOfDay(inMinutes);
  }, [filteredEntries]);
  const avgOutTimeMinutes = useMemo(() => {
    const outMinutes = filteredEntries
      .filter((entry) => entry.type === 'out')
      .map((entry) => toMinutesSinceMidnight(new Date(entry.timestamp)));
    return averageTimeOfDay(outMinutes);
  }, [filteredEntries]);

  const getRangeForFilter = (filter: FilterOption) => {
    const now = new Date();
    if (filter === 'week') {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() - 6);
      return { start, end: now };
    }
    if (filter === 'month') {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      start.setDate(1);
      return { start, end: now };
    }
    return { start: new Date(0), end: now };
  };

  const getHoursWithinRange = (
    intervalsToSum: { start: Date; end: Date; hours: number }[],
    rangeStart: Date,
    rangeEnd: Date,
  ) => intervalsToSum.reduce((sum, interval) => {
    const start = interval.start > rangeStart ? interval.start : rangeStart;
    const end = interval.end < rangeEnd ? interval.end : rangeEnd;
    return sum + hoursBetween(start, end);
  }, 0);

  const intersectInterval = (
    interval: { start: Date; end: Date; hours: number },
    rangeStart: Date,
    rangeEnd: Date,
  ) => {
    const start = interval.start > rangeStart ? interval.start : rangeStart;
    const end = interval.end < rangeEnd ? interval.end : rangeEnd;
    if (end <= start) return null;
    return { start, end, hours: hoursBetween(start, end) };
  };

  const filteredIntervals = useMemo(() => {
    const range = getRangeForFilter(viewFilter);
    return intervals
      .map((interval) => intersectInterval(interval, range.start, range.end))
      .filter((interval): interval is { start: Date; end: Date; hours: number } => interval !== null);
  }, [intervals, viewFilter]);

  const avgShiftDuration = filteredIntervals.length
    ? filteredIntervals.reduce((sum, interval) => sum + interval.hours, 0) / filteredIntervals.length
    : 0;
  const filteredDailyHoursMap = useMemo(() => sumHoursByKey(filteredIntervals, getDayKey), [filteredIntervals]);
  const avgDailyHours = filteredDailyHoursMap.size
    ? filteredIntervals.reduce((sum, interval) => sum + interval.hours, 0) / filteredDailyHoursMap.size
    : 0;
  const shiftCount = filteredIntervals.length;
  const avgInTime = avgInTimeMinutes !== null ? formatTimeOfDay(avgInTimeMinutes) : '-';
  const avgOutTime = avgOutTimeMinutes !== null ? formatTimeOfDay(avgOutTimeMinutes) : '-';

  const todayHours = useMemo(
    () => getHoursWithinRange(intervals, startOfDay(new Date()), new Date()),
    [intervals],
  );
  const weekHours = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - 6);
    return getHoursWithinRange(intervals, start, new Date());
  }, [intervals]);
  const monthHours = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(1);
    return getHoursWithinRange(intervals, start, new Date());
  }, [intervals]);
  const filteredHours = useMemo(() => {
    const range = getRangeForFilter(viewFilter);
    return getHoursWithinRange(intervals, range.start, range.end);
  }, [intervals, viewFilter]);
  const dailyHoursMap = useMemo(() => sumHoursByKey(intervals, getDayKey), [intervals]);
  const weeklyHoursMap = useMemo(() => sumHoursByKey(intervals, getWeekKey), [intervals]);
  const todayKey = getDayKey(new Date());
  const daySeries = useMemo(() => {
    const today = new Date();
    return Array.from({ length: 7 }, (_, idx) => {
      const date = new Date(today);
      date.setDate(today.getDate() - 6 + idx);
      return {
        key: getDayKey(date),
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

  const dayTimelineSeries = useMemo(() => {
    const today = new Date();
    return Array.from({ length: 7 }, (_, idx) => {
      const date = new Date(today);
      date.setDate(today.getDate() - 6 + idx);
      const dayKey = getDayKey(date);
      const segments = intervals
        .flatMap(splitIntervalByDay)
        .filter((segment) => getDayKey(segment.date) === dayKey)
        .map((segment) => ({
          startPercent: timeOfDayPercent(segment.date),
          endPercent: timeOfDayPercent(segment.end),
          label: `${formatTime(segment.date.toISOString())} – ${formatTime(segment.end.toISOString())}`,
        }));
      return {
        key: dayKey,
        label: formatDayLabel(date),
        segments,
      };
    });
  }, [intervals]);
  const trackedWeeks = weeklyHoursMap.size;
  const avgWeeklyHours = trackedWeeks
    ? Array.from(weeklyHoursMap.values()).reduce((sum, hours) => sum + hours, 0) / trackedWeeks
    : 0;
  const graphDailyMax = Math.max(...daySeries.map((point) => point.hours), 1);
  const graphWeeklyMax = Math.max(...weekSeries.map((point) => point.hours), 1);
  const activeShiftDuration = useMemo(() => {
    if (lastEntry?.type !== 'in') return '';
    const elapsed = Math.max(0, currentTime.getTime() - new Date(lastEntry.timestamp).getTime());
    const totalSeconds = Math.floor(elapsed / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours}h ${minutes}m ${seconds}s`;
  }, [currentTime, lastEntry]);

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
          <div className="shift-timer">
            {activeShiftDuration ? `Current shift: ${activeShiftDuration}` : 'Not working now'}
          </div>
          <button className="primary-btn" onClick={() => addEntry(nextAction)}>
            {nextAction === 'in' ? 'Clock In' : 'Clock Out'}
          </button>
          <div className={`status-pill ${isWorking ? 'active' : ''}`}>
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

        <div className="main-content">
        <section className="panel-tabs card">
          <button
            className={`tab-btn ${activePanel === 'summary' ? 'active' : ''}`}
            onClick={() => setActivePanel('summary')}
          >
            Summary
          </button>
          <button
            className={`tab-btn ${activePanel === 'graphs' ? 'active' : ''}`}
            onClick={() => setActivePanel('graphs')}
          >
            Graphs
          </button>
          <button
            className={`tab-btn ${activePanel === 'advanced' ? 'active' : ''}`}
            onClick={() => setActivePanel('advanced')}
          >
            Advanced
          </button>
        </section>

        {activePanel === 'summary' && (
          <section className="stats-grid card">
            <div>
              <h2>Total hours</h2>
              <p>{formatHours(totalHours)}</p>
            </div>
            <div>
              <h2>Avg hours / week</h2>
              <p>{formatHours(avgWeeklyHours)}</p>
            </div>
            <div>
              <h2>This month</h2>
              <p>{formatHours(monthHours)}</p>
            </div>
            <div>
              <h2>Today</h2>
              <p>{formatHours(todayHours)}</p>
            </div>
            <div>
              <h2>Visible hours</h2>
              <p>{formatHours(filteredHours)}</p>
            </div>
            <div>
              <h2>Tracked weeks</h2>
              <p>{trackedWeeks}</p>
            </div>
          </section>
        )}

        {activePanel === 'graphs' && (
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
                {daySeries.map((point) => {
                  const isActiveDay = isWorking && point.key === todayKey;
                  return (
                    <div
                      className={`bar-item${isActiveDay ? ' active-day' : ''}`}
                      key={point.label}
                      data-tooltip={`${point.label}: ${formatHours(point.hours)}`}
                    >
                      <div
                        className="bar"
                        style={{
                          height: point.hours > 0
                            ? `max(8px, ${(point.hours / graphDailyMax) * 100}%)`
                            : '4px',
                        }}
                      />
                      <span className="bar-label">{point.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="graph-card">
              <div className="graph-card-header">
                <div>
                  <h3>Shift timeline</h3>
                  <p>Actual clock in/out times for the last 7 days</p>
                </div>
                <div>{dayTimelineSeries.reduce((sum, day) => sum + day.segments.length, 0)} segments</div>
              </div>
              <div className="timeline-chart">
                {dayTimelineSeries.map((day) => (
                  <div className="timeline-row" key={day.key}>
                    <span className="timeline-label">{day.label}</span>
                    <div className="timeline-track">
                      {day.segments.length > 0 ? day.segments.map((segment, index) => (
                        <div
                          key={`${day.key}-${index}`}
                          className="timeline-segment"
                          style={{
                            left: `${segment.startPercent}%`,
                            width: `${Math.max(segment.endPercent - segment.startPercent, 1)}%`,
                          }}
                          data-tooltip={segment.label}
                          title={segment.label}
                        />
                      )) : (
                        <span className="timeline-empty">No shift</span>
                      )}
                    </div>
                  </div>
                ))}
                <div className="timeline-axis">
                  {['00:00', '06:00', '12:00', '18:00', '24:00'].map((label) => (
                    <span key={label} className="timeline-axis-label">{label}</span>
                  ))}
                </div>
                <div className="timeline-legend">
                  <span className="timeline-legend-mark" />
                  <span>Shift segments show active clock-in/out periods.</span>
                </div>
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
                  <div className="bar-item" key={point.label} data-tooltip={`${point.label}: ${formatHours(point.hours)}`}>
                    <div
                      className="bar"
                      style={{
                        height: point.hours > 0
                          ? `max(8px, ${(point.hours / graphWeeklyMax) * 100}%)`
                          : '4px',
                      }}
                    />
                    <span className="bar-label">{point.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {activePanel === 'advanced' && (
          <section className="advanced-card card">
            <div className="advanced-header">
              <div>
                <h2>Advanced statistics</h2>
                <p>Deeper insights for the selected range.</p>
              </div>
            </div>
            <div className="advanced-grid">
              <div className="advanced-stat">
                <h3>Avg entries / day</h3>
                <p>{avgEntriesPerDay.toFixed(2)}</p>
              </div>
              <div className="advanced-stat">
                <h3>Avg clock-in time</h3>
                <p>{avgInTime}</p>
              </div>
              <div className="advanced-stat">
                <h3>Avg clock-out time</h3>
                <p>{avgOutTime}</p>
              </div>
              <div className="advanced-stat">
                <h3>Avg shift duration</h3>
                <p>{formatHours(avgShiftDuration)}</p>
              </div>
              <div className="advanced-stat">
                <h3>Avg daily hours</h3>
                <p>{formatHours(avgDailyHours)}</p>
              </div>
              <div className="advanced-stat">
                <h3>Tracked shifts</h3>
                <p>{shiftCount}</p>
              </div>
            </div>
          </section>
        )}
        </div>

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
            <div className="entry-list-wrapper">
              <div className="entry-list">
                {filteredEntries.slice().reverse().map((entry) => (
                  <div key={entry.id} className={`entry-row ${entry.type}`}>
                    <div>
                      <strong className="type-pill">{entry.type === 'in' ? 'In' : 'Out'}</strong>
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
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
