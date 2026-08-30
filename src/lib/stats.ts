import type { FocusSession } from '../types';

/* ---------------- 日期工具（一律本地时间；日期键为 YYYY-MM-DD） ---------------- */

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** epoch ms → 本地日期键（归桶一律用它） */
export function dayKeyOf(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** 日期键 → UTC 锚点毫秒：对键做纯日历运算，规避夏令时 */
function keyToUtcMs(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** 相差天数：b - a */
export function dayDiff(a: string, b: string): number {
  return Math.round((keyToUtcMs(b) - keyToUtcMs(a)) / 86_400_000);
}

/** 日期键平移 n 天 */
export function shiftDayKey(key: string, days: number): string {
  const d = new Date(keyToUtcMs(key) + days * 86_400_000);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** 该时刻所在自然周的周一（本地时区零点） */
export function mondayOf(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)).getTime();
}

/* ---------------- 按日聚合 ---------------- */

export interface DayStat {
  /** 入账分钟（含满 5 分钟放弃的） */
  minutes: number;
  /** 完成番茄数（放弃入账的不计） */
  tomatoes: number;
  /** 标签 → 当日累计分钟 */
  taskMinutes: Record<string, number>;
}

export function isCompleted(s: FocusSession): boolean {
  return !s.abandoned;
}

/** 按 endedAt 的本地日期归桶（跨午夜完成的番茄记入完成那天） */
export function aggregateByDay(sessions: FocusSession[]): Map<string, DayStat> {
  const map = new Map<string, DayStat>();
  for (const s of sessions) {
    const key = dayKeyOf(s.endedAt);
    const stat = map.get(key) ?? { minutes: 0, tomatoes: 0, taskMinutes: {} };
    stat.minutes += s.minutes;
    if (isCompleted(s)) stat.tomatoes += 1;
    const task = s.task?.trim() || '专注';
    stat.taskMinutes[task] = (stat.taskMinutes[task] ?? 0) + s.minutes;
    map.set(key, stat);
  }
  return map;
}

/** 主要任务：当日累计时长最长的标签（并列取字典序最小，保证稳定） */
export function mainTaskOf(stat: DayStat): string | null {
  let best: string | null = null;
  let bestMinutes = -1;
  for (const [task, minutes] of Object.entries(stat.taskMinutes).sort()) {
    if (minutes > bestMinutes) {
      best = task;
      bestMinutes = minutes;
    }
  }
  return best;
}

/* ---------------- 热力图 ---------------- */

export type HeatLevel = 0 | 1 | 2 | 3 | 4;

/** 色阶五档：0 空 / 1–29 / 30–59 / 60–119 / ≥120 分钟 */
export function levelOf(minutes: number): HeatLevel {
  if (minutes <= 0) return 0;
  if (minutes < 30) return 1;
  if (minutes < 60) return 2;
  if (minutes < 120) return 3;
  return 4;
}

export interface YearCell {
  key: string;
  /** 是否落在目标年内（补齐首尾所在周的格子标记为 false） */
  inYear: boolean;
}

/** 某年的热力图网格：周一开头、整周成列，首尾补齐所在周 */
export function buildYearGrid(year: number): YearCell[][] {
  const jan1Key = dayKeyOf(new Date(year, 0, 1).getTime());
  const dec31Key = dayKeyOf(new Date(year, 11, 31).getTime());
  const startKey = dayKeyOf(mondayOf(new Date(year, 0, 1).getTime()));
  const endKey = shiftDayKey(dayKeyOf(mondayOf(new Date(year, 11, 31).getTime())), 6);
  const colCount = Math.floor(dayDiff(startKey, endKey) / 7) + 1;
  const weeks: YearCell[][] = [];
  for (let w = 0; w < colCount; w++) {
    const col: YearCell[] = [];
    for (let r = 0; r < 7; r++) {
      const key = shiftDayKey(startKey, w * 7 + r);
      col.push({ key, inYear: key >= jan1Key && key <= dec31Key });
    }
    weeks.push(col);
  }
  return weeks;
}

/** 每列的月份标签（1–12 或 null）：该列周一的月份与上一列不同时标注 */
export function monthLabelsOfWeeks(weeks: YearCell[][], year: number): (number | null)[] {
  return weeks.map((col, i) => {
    const key = col[0].key;
    if (i === 0) {
      return Number(key.slice(0, 4)) === year ? Number(key.slice(5, 7)) : null;
    }
    const month = Number(key.slice(5, 7));
    return month !== Number(weeks[i - 1][0].key.slice(5, 7)) ? month : null;
  });
}

/* ---------------- 统计卡 ---------------- */

export interface SimpleStat {
  minutes: number;
  tomatoes: number;
}

function statsInRange(sessions: FocusSession[], from: number, to: number): SimpleStat {
  let minutes = 0;
  let tomatoes = 0;
  for (const s of sessions) {
    if (s.endedAt >= from && s.endedAt < to) {
      minutes += s.minutes;
      if (isCompleted(s)) tomatoes += 1;
    }
  }
  return { minutes, tomatoes };
}

/** 某时刻所在本地日（0 点起算）的统计 */
export function statsOfDay(sessions: FocusSession[], ms: number): SimpleStat {
  const d = new Date(ms);
  const from = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const to = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
  return statsInRange(sessions, from, to);
}

/** 某时刻所在自然周（周一起）的统计 */
export function statsOfWeek(sessions: FocusSession[], ms: number): SimpleStat {
  const from = mondayOf(ms);
  const monday = new Date(from);
  const to = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 7).getTime();
  return statsInRange(sessions, from, to);
}

export interface TotalStat extends SimpleStat {
  /** 有记录的天数 */
  days: number;
}

export function totalStats(sessions: FocusSession[]): TotalStat {
  const days = new Set<string>();
  let minutes = 0;
  let tomatoes = 0;
  for (const s of sessions) {
    days.add(dayKeyOf(s.endedAt));
    minutes += s.minutes;
    if (isCompleted(s)) tomatoes += 1;
  }
  return { minutes, tomatoes, days: days.size };
}

/* ---------------- 连击 ---------------- */

export interface StreakInfo {
  /** 当前连击：今天还没记则从昨天回溯（"今日还有机会"） */
  current: number;
  /** 历史最佳 */
  best: number;
  doneToday: boolean;
}

/** doneDays：每天 ≥1 个完成番茄的日期键集合 */
export function computeStreak(doneDays: Set<string>, todayKey: string): StreakInfo {
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const key of [...doneDays].sort()) {
    run = prev !== null && dayDiff(prev, key) === 1 ? run + 1 : 1;
    if (run > best) best = run;
    prev = key;
  }
  const doneToday = doneDays.has(todayKey);
  let cursor = doneToday ? todayKey : shiftDayKey(todayKey, -1);
  let current = 0;
  while (doneDays.has(cursor)) {
    current += 1;
    cursor = shiftDayKey(cursor, -1);
  }
  return { current, best: Math.max(best, current), doneToday };
}

/** 连击用的"完成日"集合：放弃入账不算完成 */
export function completedDaySet(sessions: FocusSession[]): Set<string> {
  const set = new Set<string>();
  for (const s of sessions) {
    if (isCompleted(s)) set.add(dayKeyOf(s.endedAt));
  }
  return set;
}

/* ---------------- 展示格式 ---------------- */

/** 分钟 → 中文时长：<60 显示 N 分钟，其余 H 小时[ M 分] */
export function formatMinutes(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} 分钟`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest > 0 ? `${h} 时 ${rest} 分` : `${h} 小时`;
}
