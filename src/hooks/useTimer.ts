import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { SessionKind, Settings } from '../types';
import { abandonCreditMinutes, formatMMSS, isDue } from '../lib/clock';
import { ensureAudio } from '../lib/sound';
import { useNotify } from './useNotify';

export const BASE_TITLE = '番茄年报 · focus.today';

/** 一次专注入账（到点完成，或满 5 分钟的放弃） */
export interface FocusRecord {
  startedAt: number;
  /** 到点完成 = 计划到点时刻（睡过头也按原时刻归档）；放弃 = 实际放弃时刻 */
  endedAt: number;
  minutes: number;
  task?: string;
  abandoned: boolean;
}

export interface TimerCallbacks {
  onFocusComplete: (record: FocusRecord) => void;
  onBreakComplete: (kind: SessionKind) => void;
}

type Phase = 'idle' | 'focusing' | 'breaking';

interface TimerState {
  phase: Phase;
  /** 运行中的阶段；idle 时表示下一个要开始的是什么 */
  kind: SessionKind;
  /** 运行中（未暂停）的计划到点时刻；暂停/idle 为 null */
  endsAt: number | null;
  /** 暂停时冻结的剩余毫秒 */
  remainingMs: number | null;
  /** 本轮计划时长（进度环基准；设置改动不影响进行中的一轮） */
  durationMs: number;
  startedAt: number | null;
  task?: string;
  pomodorosInRow: number;
  settings: Settings;
}

type Action =
  | { type: 'start'; now: number; task?: string }
  | { type: 'pause'; now: number }
  | { type: 'resume'; now: number }
  | { type: 'due'; now: number }
  | { type: 'abandon'; now: number }
  | { type: 'skip'; now: number }
  | { type: 'settings'; settings: Settings };

function plannedMs(kind: SessionKind, s: Settings): number {
  if (kind === 'focus') return s.focusMin * 60_000;
  return (kind === 'long' ? s.longBreakMin : s.breakMin) * 60_000;
}

/** 状态机：idle ⇄ focusing ⇄ breaking（规则见开发文档 §5） */
function reducer(state: TimerState, action: Action): TimerState {
  switch (action.type) {
    case 'start': {
      if (state.phase !== 'idle') return state;
      const task =
        action.task !== undefined ? action.task.trim() || undefined : state.task;
      const durationMs = plannedMs(state.kind, state.settings);
      return {
        ...state,
        phase: state.kind === 'focus' ? 'focusing' : 'breaking',
        endsAt: action.now + durationMs,
        remainingMs: null,
        durationMs,
        startedAt: state.kind === 'focus' ? action.now : null,
        task,
      };
    }
    case 'pause':
      if (state.phase !== 'focusing' || state.endsAt === null) return state;
      return { ...state, endsAt: null, remainingMs: Math.max(0, state.endsAt - action.now) };
    case 'resume':
      if (state.phase !== 'focusing' || state.remainingMs === null) return state;
      return { ...state, endsAt: action.now + state.remainingMs, remainingMs: null };
    case 'due': {
      if (state.endsAt === null) return state;
      if (state.kind === 'focus') {
        // 专注到点：入账（endedAt 用计划到点时刻，由回调捕获），接短休/长休
        const tomatoes = state.pomodorosInRow + 1;
        const nextKind: SessionKind =
          tomatoes % state.settings.longBreakEvery === 0 ? 'long' : 'short';
        if (state.settings.autoStartBreak) {
          const durationMs = plannedMs(nextKind, state.settings);
          return {
            ...state,
            phase: 'breaking',
            kind: nextKind,
            endsAt: action.now + durationMs,
            remainingMs: null,
            durationMs,
            startedAt: null,
            pomodorosInRow: tomatoes,
          };
        }
        return {
          ...state,
          phase: 'idle',
          kind: nextKind,
          endsAt: null,
          remainingMs: null,
          startedAt: null,
          pomodorosInRow: tomatoes,
        };
      }
      // 休息到点：回到专注（自动或手动）
      if (state.settings.autoStartFocus) {
        const durationMs = plannedMs('focus', state.settings);
        return {
          ...state,
          phase: 'focusing',
          kind: 'focus',
          endsAt: action.now + durationMs,
          remainingMs: null,
          durationMs,
          startedAt: action.now,
        };
      }
      return { ...state, phase: 'idle', kind: 'focus', endsAt: null, remainingMs: null };
    }
    case 'abandon':
      // 入账判定在 hook 里做（<5 分钟丢弃），这里只回到待专注
      if (state.phase !== 'focusing') return state;
      return {
        ...state,
        phase: 'idle',
        kind: 'focus',
        endsAt: null,
        remainingMs: null,
        startedAt: null,
      };
    case 'skip': {
      if (state.phase !== 'breaking') return state;
      if (state.settings.autoStartFocus) {
        const durationMs = plannedMs('focus', state.settings);
        return {
          ...state,
          phase: 'focusing',
          kind: 'focus',
          endsAt: action.now + durationMs,
          remainingMs: null,
          durationMs,
          startedAt: action.now,
        };
      }
      return { ...state, phase: 'idle', kind: 'focus', endsAt: null, remainingMs: null };
    }
    case 'settings':
      return {
        ...state,
        settings: action.settings,
        durationMs:
          state.phase === 'idle' ? plannedMs(state.kind, action.settings) : state.durationMs,
      };
  }
}

/**
 * 计时核心：时间戳基准。
 * 界面秒数永远由 endsAt - Date.now() 推算，setInterval 只负责"每 0.5s 重画"，
 * 到点判定只认 Date.now() >= endsAt —— 锁屏/合盖睡过头后醒来第一帧即正确入账。
 */
export function useTimer(initialSettings: Settings, callbacks: TimerCallbacks) {
  const [state, dispatch] = useReducer(reducer, initialSettings, (s) => ({
    phase: 'idle' as Phase,
    kind: 'focus' as SessionKind,
    endsAt: null,
    remainingMs: null,
    durationMs: plannedMs('focus', s),
    startedAt: null,
    task: undefined,
    pomodorosInRow: 0,
    settings: s,
  }));
  const [nowMs, setNowMs] = useState(() => Date.now());
  const stateRef = useRef(state);
  stateRef.current = state;
  const cbRef = useRef(callbacks);
  cbRef.current = callbacks;
  /** 已处理过到点的 endsAt，防止 interval 与 visibilitychange 双触发重复入账 */
  const handledEndRef = useRef<number | null>(null);
  /** 通知发不出去时的标题闪烁截止时刻 */
  const flashUntilRef = useRef(0);
  const notify = useNotify();

  const running = state.phase !== 'idle' && state.endsAt !== null;

  // 自动切换专注/休息时 running 始终为 true，必须按新截止时间重建 tick。
  useEffect(() => {
    if (!running) {
      document.title = BASE_TITLE;
      return;
    }
    const endsAt = state.endsAt as number;
    const tick = () => {
      const now = Date.now();
      if (isDue(endsAt, now)) {
        if (handledEndRef.current !== endsAt) {
          handledEndRef.current = endsAt;
          const s = stateRef.current;
          dispatch({ type: 'due', now });
          if (s.kind === 'focus') {
            const status = notify('focus', s.settings, s.task);
            if (status === 'fallback') flashUntilRef.current = now + 5000;
            cbRef.current.onFocusComplete({
              startedAt: s.startedAt as number,
              endedAt: endsAt,
              minutes: Math.round(s.durationMs / 60_000),
              task: s.task,
              abandoned: false,
            });
          } else {
            const status = notify(s.kind, s.settings, s.task);
            if (status === 'fallback') flashUntilRef.current = now + 5000;
            cbRef.current.onBreakComplete(s.kind);
          }
        }
        return;
      }
      setNowMs(now);
      // 标签页标题同步：MM:SS · 专注中，切走也能瞄到
      const label =
        stateRef.current.phase === 'focusing'
          ? '专注中'
          : stateRef.current.kind === 'long'
            ? '长休中'
            : '休息中';
      const base = `${formatMMSS(endsAt - now)} · ${label}`;
      document.title =
        now < flashUntilRef.current && Math.floor(now / 500) % 2 === 0 ? `🔔 ${base}` : base;
    };
    tick();
    const interval = window.setInterval(tick, 500);
    const onVisible = () => {
      if (!document.hidden) tick(); // 解锁/切回第一帧即完成判定
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [running, state.endsAt, notify]);

  // 屏幕常亮：仅专注阶段请求 Wake Lock（feature-detect，不支持/被拒则静默）
  const paused = state.endsAt === null;
  useEffect(() => {
    if (state.phase !== 'focusing' || paused) return;
    const nav = navigator as Navigator & {
      wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void> }> };
    };
    let sentinel: { release(): Promise<void> } | null = null;
    const acquire = async () => {
      try {
        const next = (await nav.wakeLock?.request('screen')) ?? null;
        void sentinel?.release().catch(() => {});
        sentinel = next;
      } catch {
        // 拒绝/不支持：忽略
      }
    };
    // 切回可见时 wake lock 已被系统自动释放，重新请求
    const onVisible = () => {
      if (document.hidden) return;
      void sentinel?.release().catch(() => {});
      sentinel = null;
      void acquire();
    };
    document.addEventListener('visibilitychange', onVisible);
    void acquire();
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel?.release().catch(() => {});
      sentinel = null;
    };
  }, [state.phase, paused]);

  const start = useCallback(
    (task?: string) => {
      ensureAudio();
      dispatch({ type: 'start', now: Date.now(), task });
    },
    [],
  );
  const pause = useCallback(() => dispatch({ type: 'pause', now: Date.now() }), []);
  const resume = useCallback(() => {
    ensureAudio();
    dispatch({ type: 'resume', now: Date.now() });
  }, []);
  const skipBreak = useCallback(() => dispatch({ type: 'skip', now: Date.now() }), []);
  const setSettings = useCallback((settings: Settings) => dispatch({ type: 'settings', settings }), []);

  const abandon = useCallback(() => {
    const s = stateRef.current;
    const now = Date.now();
    dispatch({ type: 'abandon', now });
    if (s.phase === 'focusing' && s.startedAt !== null) {
      // 按实际专注时长（扣除暂停）结算
      const remainingNow =
        s.endsAt !== null ? Math.max(0, s.endsAt - now) : (s.remainingMs ?? 0);
      const minutes = abandonCreditMinutes(s.durationMs - remainingNow);
      if (minutes !== null) {
        cbRef.current.onFocusComplete({
          startedAt: s.startedAt,
          endedAt: now,
          minutes,
          task: s.task,
          abandoned: true,
        });
      }
    }
  }, []);

  const remaining =
    state.endsAt !== null
      ? Math.max(0, state.endsAt - nowMs)
      : (state.remainingMs ?? plannedMs(state.kind, state.settings));
  const progress =
    state.phase === 'idle'
      ? 0
      : Math.min(1, Math.max(0, 1 - remaining / state.durationMs));

  return { state, remaining, progress, start, pause, resume, abandon, skipBreak, setSettings };
}

export type TimerApi = ReturnType<typeof useTimer>;
