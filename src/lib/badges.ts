import type { BadgeState, FocusSession } from '../types';
import {
  aggregateByDay,
  completedDaySet,
  computeStreak,
  dayKeyOf,
  isCompleted,
} from './stats';

export interface BadgeDef {
  id: string;
  name: string;
  /** 徽章方章上的字/数字（复古工作坊风格） */
  glyph: string;
  condition: string;
  /** 解锁瞬间的彩蛋文案 */
  tease?: string;
}

/** v1 共 10 枚 */
export const BADGES: BadgeDef[] = [
  { id: 'tomato-1', name: '第一个番茄', glyph: '1', condition: '完成首个番茄' },
  { id: 'tomato-25', name: '小试身手', glyph: '25', condition: '累计 25 个番茄' },
  { id: 'tomato-100', name: '百番斩', glyph: '100', condition: '累计 100 个番茄' },
  { id: 'tomato-500', name: '五百罗汉', glyph: '500', condition: '累计 500 个番茄' },
  { id: 'hours-100', name: '百小时俱乐部', glyph: '时', condition: '累计满 6000 分钟' },
  { id: 'streak-3', name: '三日不断', glyph: '3', condition: '连击 3 天' },
  { id: 'streak-7', name: '一周不断', glyph: '7', condition: '连击 7 天' },
  { id: 'streak-30', name: '月度铁人', glyph: '30', condition: '连击 30 天' },
  { id: 'day-8', name: '全情投入日', glyph: '8', condition: '单日完成 8 个番茄' },
  {
    id: 'owl',
    name: '夜猫子',
    glyph: '夜',
    condition: '在 0:00–5:00 完成过番茄',
    tease: '凌晨的番茄最红，但明天别赖床。',
  },
];

export interface BadgeUnlock {
  id: string;
  unlockedAt: number;
}

/**
 * 纯函数：根据全部记录与已解锁状态，算出新解锁的徽章。每次入账后跑一遍。
 * 连击类看历史最佳（断签后补发也不亏）；番茄数类只认"完成"（放弃入账不算）；
 * 百小时按累计入账分钟（含放弃满 5 分钟的）。
 */
export function evaluateBadges(
  sessions: FocusSession[],
  unlocked: BadgeState,
  now: number = Date.now(),
): BadgeUnlock[] {
  const completed = sessions.filter(isCompleted);
  const totalTomatoes = completed.length;
  const totalMinutes = sessions.reduce((sum, s) => sum + s.minutes, 0);
  const { best } = computeStreak(completedDaySet(sessions), dayKeyOf(now));

  let maxDayTomatoes = 0;
  for (const stat of aggregateByDay(sessions).values()) {
    if (stat.tomatoes > maxDayTomatoes) maxDayTomatoes = stat.tomatoes;
  }

  const owl = completed.some((s) => new Date(s.endedAt).getHours() < 5);

  const hit: Record<string, boolean> = {
    'tomato-1': totalTomatoes >= 1,
    'tomato-25': totalTomatoes >= 25,
    'tomato-100': totalTomatoes >= 100,
    'tomato-500': totalTomatoes >= 500,
    'hours-100': totalMinutes >= 6000,
    'streak-3': best >= 3,
    'streak-7': best >= 7,
    'streak-30': best >= 30,
    'day-8': maxDayTomatoes >= 8,
    owl,
  };

  const fresh: BadgeUnlock[] = [];
  for (const def of BADGES) {
    if (hit[def.id] && !(def.id in unlocked)) {
      fresh.push({ id: def.id, unlockedAt: now });
    }
  }
  return fresh;
}
