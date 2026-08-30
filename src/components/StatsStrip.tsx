import { useMemo } from 'react';
import type { FocusSession } from '../types';
import {
  completedDaySet,
  computeStreak,
  dayKeyOf,
  formatMinutes,
  statsOfDay,
  statsOfWeek,
  totalStats,
} from '../lib/stats';

/** 今日（分钟/番茄数）、本周（周一始）、连击、累计 */
export default function StatsStrip({ sessions }: { sessions: FocusSession[] }) {
  const data = useMemo(() => {
    const now = Date.now();
    return {
      today: statsOfDay(sessions, now),
      week: statsOfWeek(sessions, now),
      total: totalStats(sessions),
      streak: computeStreak(completedDaySet(sessions), dayKeyOf(now)),
    };
  }, [sessions]);

  const streakSub = data.streak.doneToday
    ? `最佳 ${data.streak.best} 天`
    : data.streak.current > 0
      ? `今日还有机会 · 最佳 ${data.streak.best} 天`
      : '今天开个头？';

  const cards = [
    { label: '今日', main: formatMinutes(data.today.minutes), sub: `${data.today.tomatoes} 个番茄` },
    { label: '本周', main: formatMinutes(data.week.minutes), sub: `${data.week.tomatoes} 个番茄` },
    { label: '连击', main: `${data.streak.current} 天`, sub: streakSub },
    {
      label: '累计',
      main: formatMinutes(data.total.minutes),
      sub: `${data.total.tomatoes} 个番茄 · ${data.total.days} 天`,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((c) => (
        <div
          key={c.label}
          className="border-2 border-ink bg-paper px-4 py-3 shadow-[3px_3px_0_rgba(43,43,38,0.25)]"
        >
          <p className="text-[10px] tracking-[0.4em] text-ink/50">{c.label}</p>
          <p className="mt-1 text-xl font-bold tabular-nums">{c.main}</p>
          <p className="mt-0.5 text-xs text-ink/55">{c.sub}</p>
        </div>
      ))}
    </div>
  );
}
