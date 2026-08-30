import { describe, expect, it } from 'vitest';
import type { FocusSession } from '../types';
import { abandonCreditMinutes } from './clock';
import {
  aggregateByDay,
  buildYearGrid,
  completedDaySet,
  computeStreak,
  dayDiff,
  levelOf,
  mainTaskOf,
  mondayOf,
  monthLabelsOfWeeks,
  shiftDayKey,
  statsOfDay,
  statsOfWeek,
  totalStats,
} from './stats';

/** 本地时区构造时间戳，测试在任何时区下都成立 */
const ms = (key: string, hour = 10, minute = 0): number => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, hour, minute).getTime();
};

const mk = (endedKey: string, minutes = 25, extra: Partial<FocusSession> = {}): FocusSession => ({
  id: extra.id ?? Math.random().toString(36).slice(2),
  startedAt: extra.startedAt ?? ms(endedKey, 9),
  endedAt: extra.endedAt ?? ms(endedKey, 9, Math.min(minutes, 50)),
  minutes,
  task: extra.task,
  abandoned: extra.abandoned,
});

describe('clock · 放弃规则', () => {
  it('不满 5 分钟不入账，满 5 分钟按整分钟入账（扣除暂停的实际专注时长）', () => {
    expect(abandonCreditMinutes(3 * 60_000)).toBeNull();
    expect(abandonCreditMinutes(5 * 60_000)).toBe(5);
    expect(abandonCreditMinutes(27 * 60_000 + 30_000)).toBe(27);
    expect(abandonCreditMinutes(0)).toBeNull();
  });
});

describe('stats · 按日归桶', () => {
  it('跨午夜：23:50 开始、00:10 完成 → 记入完成那天', () => {
    const s: FocusSession = {
      id: 'x',
      startedAt: ms('2026-08-23', 23, 50),
      endedAt: ms('2026-08-24', 0, 10),
      minutes: 20,
    };
    const byDay = aggregateByDay([s]);
    expect(byDay.has('2026-08-23')).toBe(false);
    expect(byDay.get('2026-08-24')?.minutes).toBe(20);
    expect(byDay.get('2026-08-24')?.tomatoes).toBe(1);
  });

  it('跨年：12/31 深夜开始、1/1 凌晨完成 → 记入新的一年', () => {
    const s: FocusSession = {
      id: 'y',
      startedAt: ms('2025-12-31', 23, 30),
      endedAt: ms('2026-01-01', 0, 15),
      minutes: 45,
    };
    const byDay = aggregateByDay([s]);
    expect(byDay.get('2026-01-01')?.minutes).toBe(45);
    expect(byDay.get('2025-12-31')).toBeUndefined();
  });

  it('主要任务 = 当日累计时长最长的标签；并列取字典序最小', () => {
    const byDay = aggregateByDay([
      mk('2026-08-24', 25, { task: '写周报' }),
      mk('2026-08-24', 25, { task: '读论文' }),
      mk('2026-08-24', 25, { task: '写周报' }),
    ]);
    expect(mainTaskOf(byDay.get('2026-08-24')!)).toBe('写周报');

    const tie = aggregateByDay([
      mk('2026-08-25', 25, { task: '读论文' }),
      mk('2026-08-25', 25, { task: '写周报' }),
    ]);
    expect(mainTaskOf(tie.get('2026-08-25')!)).toBe('写周报');
  });

  it('放弃的记录只计入分钟，不算完成番茄', () => {
    const sessions = [mk('2026-08-28', 25), mk('2026-08-28', 12, { abandoned: true })];
    const total = totalStats(sessions);
    expect(total.minutes).toBe(37);
    expect(total.tomatoes).toBe(1);
    expect(total.days).toBe(1);
    const day = aggregateByDay(sessions).get('2026-08-28')!;
    expect(day.minutes).toBe(37);
    expect(day.tomatoes).toBe(1);
  });
});

describe('stats · 热力图色阶与网格', () => {
  it('五档色阶阈值：0 / 1–29 / 30–59 / 60–119 / ≥120', () => {
    expect(levelOf(0)).toBe(0);
    expect(levelOf(1)).toBe(1);
    expect(levelOf(29)).toBe(1);
    expect(levelOf(30)).toBe(2);
    expect(levelOf(59)).toBe(2);
    expect(levelOf(60)).toBe(3);
    expect(levelOf(119)).toBe(3);
    expect(levelOf(120)).toBe(4);
    expect(levelOf(300)).toBe(4);
  });

  it('2026 年网格：第一格是 2025-12-29（周一），共 53 列，首尾补齐周标记 inYear=false', () => {
    const grid = buildYearGrid(2026);
    expect(grid[0][0].key).toBe('2025-12-29');
    expect(grid[0][0].inYear).toBe(false);
    expect(grid[0][3].key).toBe('2026-01-01');
    expect(grid[0][3].inYear).toBe(true);
    expect(grid.length).toBe(53);
    expect(grid[52][6].key).toBe('2027-01-03');
    expect(grid[52][6].inYear).toBe(false);
  });

  it('2024 年网格：1 月 1 日恰为周一，53 列', () => {
    const grid = buildYearGrid(2024);
    expect(grid[0][0].key).toBe('2024-01-01');
    expect(grid.length).toBe(53);
  });

  it('月份标签：月份切换的那一列标注（首列在补齐周内则不标）', () => {
    const grid = buildYearGrid(2026);
    const labels = monthLabelsOfWeeks(grid, 2026);
    expect(labels[0]).toBeNull(); // 首列周一是 2025-12-29，属于补齐周
    expect(labels[1]).toBe(1); // 2026-01-05 那列 → 1月
    const decCol = grid.findIndex((col) => col[0].key === '2026-12-07');
    expect(labels[decCol]).toBe(12);
    expect(labels.filter((m) => m !== null)).toHaveLength(12);
  });

  it('日期键运算跨年、跨闰年正确', () => {
    expect(dayDiff('2025-12-31', '2026-01-01')).toBe(1);
    expect(shiftDayKey('2024-02-28', 1)).toBe('2024-02-29');
    expect(shiftDayKey('2024-02-29', 1)).toBe('2024-03-01');
    expect(shiftDayKey('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('stats · 统计卡与连击', () => {
  it('自然周以周一开始：2026-08-30 是周日，本周为 8/24–8/30', () => {
    const now = ms('2026-08-30', 12);
    expect(mondayOf(now)).toBe(ms('2026-08-24', 0));
    const sessions = [
      mk('2026-08-23', 25), // 上周日 → 不算
      mk('2026-08-24', 25), // 本周一 → 算
      mk('2026-08-27', 50),
      mk('2026-08-30', 25), // 今天 → 算
      mk('2026-08-31', 25), // 下周一 → 不算
    ];
    const week = statsOfWeek(sessions, now);
    expect(week.tomatoes).toBe(3);
    expect(week.minutes).toBe(100);
    expect(statsOfDay(sessions, now)).toEqual({ minutes: 25, tomatoes: 1 });
  });

  it('连击：连续段计数与历史最佳', () => {
    const days = new Set(['2026-08-24', '2026-08-26', '2026-08-27', '2026-08-28']);
    const s = computeStreak(days, '2026-08-28');
    expect(s.current).toBe(3);
    expect(s.doneToday).toBe(true);
    expect(s.best).toBe(3);
  });

  it('连击：今天还没记 → 从昨天回溯，今日还有机会', () => {
    const s = computeStreak(new Set(['2026-08-26', '2026-08-27']), '2026-08-28');
    expect(s.doneToday).toBe(false);
    expect(s.current).toBe(2);
    expect(s.best).toBe(2);
  });

  it('连击：断签后 current 归零，best 保留', () => {
    const s = computeStreak(new Set(['2026-08-20', '2026-08-21', '2026-08-22']), '2026-08-28');
    expect(s.current).toBe(0);
    expect(s.best).toBe(3);
  });

  it('连击只认完成的番茄：某天只有放弃记录 → 断签', () => {
    const sessions = [
      mk('2026-08-27', 25),
      mk('2026-08-28', 20, { abandoned: true }),
      mk('2026-08-29', 25),
    ];
    const s = computeStreak(completedDaySet(sessions), '2026-08-29');
    expect(s.current).toBe(1);
    expect(s.best).toBe(1);
  });
});
