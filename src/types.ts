/** 一条专注记录 */
export interface FocusSession {
  id: string;
  startedAt: number; // epoch ms
  /** 归属哪一天以 endedAt 的本地日期为准 */
  endedAt: number; // epoch ms
  /** 实际入账分钟（提前放弃则小于设定值） */
  minutes: number;
  task?: string;
  /** 满 5 分钟提前放弃的入账记录：分钟照记，但不算"完成番茄" */
  abandoned?: boolean;
}

export interface Settings {
  focusMin: number; // 默认 25
  breakMin: number; // 默认 5
  longBreakMin: number; // 默认 15
  longBreakEvery: number; // 默认 4（每 4 个番茄一次长休）
  autoStartBreak: boolean; // 默认 true
  autoStartFocus: boolean; // 默认 false
  soundOn: boolean; // 默认 true
  notifOn: boolean; // 默认 false（需用户授权）
}

/** idle：待开始（kind 指向下一个阶段）；focusing；breaking（短休/长休） */
export type Phase = 'idle' | 'focusing' | 'breaking';
export type SessionKind = 'focus' | 'short' | 'long';

/** 徽章解锁状态：badgeId → 解锁时间（epoch ms） */
export interface BadgeState {
  [badgeId: string]: number;
}
