import { describe, expect, it } from 'vitest';
import type { FocusSession } from '../types';
import { evaluateBadges, BADGES } from './badges';
import { shiftDayKey } from './stats';

const ms = (key: string, hour = 10, minute = 0): number => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, hour, minute).getTime();
};

/** now 固定为 2026-08-30（周日）中午，测试与真实日期解耦 */
const NOW = ms('2026-08-30', 12);

/** 某天完成 count 个番茄（时间错开但都在同一天内） */
const completedOn = (key: string, count: number, minutes = 25): FocusSession[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `${key}-${i}`,
    startedAt: ms(key, 8),
    endedAt: ms(key, 8) + (i + 1) * 60_000,
    minutes,
  }));

describe('badges · 数量与时长', () => {
  it('完成首个番茄 → 只解锁第一枚', () => {
    const fresh = evaluateBadges(completedOn('2026-08-30', 1), {}, NOW);
    expect(fresh.map((f) => f.id)).toEqual(['tomato-1']);
  });

  it('25 / 100 逐级解锁，且已解锁不重复发放', () => {
    const s25 = completedOn('2026-08-30', 25);
    const fresh1 = evaluateBadges(s25, {}, NOW);
    expect(fresh1.map((f) => f.id)).toEqual(expect.arrayContaining(['tomato-1', 'tomato-25', 'day-8']));
    expect(fresh1.some((f) => f.id === 'tomato-100')).toBe(false);

    const unlocked = Object.fromEntries(fresh1.map((f) => [f.id, f.unlockedAt]));
    const s100 = [...s25, ...completedOn('2026-08-29', 75)];
    const fresh2 = evaluateBadges(s100, unlocked, NOW);
    expect(fresh2.map((f) => f.id)).toEqual(['tomato-100']);
  });

  it('百小时俱乐部：累计满 6000 分钟，含放弃入账的分钟', () => {
    const sessions = [
      ...completedOn('2026-08-30', 239), // 5975 分钟
      {
        id: 'ab',
        startedAt: ms('2026-08-30', 6),
        endedAt: ms('2026-08-30', 7),
        minutes: 25,
        abandoned: true,
      },
    ];
    const fresh = evaluateBadges(sessions, {}, NOW);
    expect(fresh.some((f) => f.id === 'hours-100')).toBe(true);
  });
});

describe('badges · 连击与单日', () => {
  it('连击徽章：30 天连击一次解锁 3/7/30 三枚', () => {
    const sessions = Array.from({ length: 30 }, (_, i) => {
      const key = shiftDayKey('2026-08-29', -i);
      return { id: `s-${i}`, startedAt: ms(key, 9), endedAt: ms(key, 9, 25), minutes: 25 };
    });
    const fresh = evaluateBadges(sessions, {}, NOW);
    expect(fresh.map((f) => f.id)).toEqual(
      expect.arrayContaining(['streak-3', 'streak-7', 'streak-30']),
    );
  });

  it('连击徽章看历史最佳：断签许久后仍会在下次入账时补发', () => {
    const sessions = ['2026-08-01', '2026-08-02', '2026-08-03'].map((key, i) => ({
      id: `d-${i}`,
      startedAt: ms(key, 9),
      endedAt: ms(key, 9, 25),
      minutes: 25,
    }));
    const fresh = evaluateBadges(sessions, {}, NOW);
    expect(fresh.some((f) => f.id === 'streak-3')).toBe(true);
  });

  it('全情投入日：单日满 8 个番茄才解锁', () => {
    expect(evaluateBadges(completedOn('2026-08-30', 8), {}, NOW).some((f) => f.id === 'day-8')).toBe(
      true,
    );
    expect(evaluateBadges(completedOn('2026-08-30', 7), {}, NOW).some((f) => f.id === 'day-8')).toBe(
      false,
    );
  });
});

describe('badges · 边界', () => {
  it('夜猫子：0:00–5:00 完成 → 解锁；5:00 起不算', () => {
    const owl: FocusSession = {
      id: 'owl',
      startedAt: ms('2026-08-30', 4, 30),
      endedAt: ms('2026-08-30', 4, 55),
      minutes: 25,
    };
    expect(evaluateBadges([owl], {}, NOW).some((f) => f.id === 'owl')).toBe(true);

    const early: FocusSession = {
      id: 'early',
      startedAt: ms('2026-08-30', 5, 0),
      endedAt: ms('2026-08-30', 5, 25),
      minutes: 25,
    };
    expect(evaluateBadges([early], {}, NOW).some((f) => f.id === 'owl')).toBe(false);
  });

  it('放弃的记录不算完成番茄：仅有放弃记录 → 一枚都不解锁', () => {
    const abandoned: FocusSession = {
      id: 'ab',
      startedAt: ms('2026-08-30', 9),
      endedAt: ms('2026-08-30', 9, 20),
      minutes: 20,
      abandoned: true,
    };
    expect(evaluateBadges([abandoned], {}, NOW)).toEqual([]);
  });

  it('空记录 → 无解锁；徽章清单 10 枚且 id 唯一', () => {
    expect(evaluateBadges([], {}, NOW)).toEqual([]);
    expect(BADGES.length).toBe(10);
    expect(new Set(BADGES.map((b) => b.id)).size).toBe(10);
  });
});
