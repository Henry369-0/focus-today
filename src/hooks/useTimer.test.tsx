import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../lib/sessions';
import type { Settings } from '../types';
import { useTimer, type TimerApi } from './useTimer';

const { notify } = vi.hoisted(() => ({ notify: vi.fn(() => 'off') }));
vi.mock('./useNotify', () => ({ useNotify: () => notify }));
vi.mock('../lib/sound', () => ({ ensureAudio: vi.fn() }));

let renderer: ReactTestRenderer | undefined;
let testDocument: EventTarget & { hidden: boolean; title: string };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-13T08:00:00Z'));
  testDocument = Object.assign(new EventTarget(), { hidden: false, title: '' });
  vi.stubGlobal('document', testDocument);
  vi.stubGlobal('window', { setInterval, clearInterval });
  vi.stubGlobal('navigator', {});
  notify.mockClear();
});

afterEach(() => {
  act(() => renderer?.unmount());
  renderer = undefined;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function mountTimer(overrides: Partial<Settings> = {}) {
  let timer!: TimerApi;
  const onFocusComplete = vi.fn();
  const onBreakComplete = vi.fn();
  const settings = { ...DEFAULT_SETTINGS, focusMin: 1, breakMin: 1, ...overrides };

  function Harness() {
    timer = useTimer(settings, { onFocusComplete, onBreakComplete });
    return null;
  }

  act(() => { renderer = create(<Harness />); });
  return { get timer() { return timer; }, onFocusComplete, onBreakComplete };
}

function advance(ms: number) {
  act(() => { vi.advanceTimersByTime(ms); });
}

describe('useTimer stage transitions', () => {
  it('counts down an automatically started short break', () => {
    const run = mountTimer();
    act(() => run.timer.start());
    advance(60_000);

    expect(run.timer.state.phase).toBe('breaking');
    expect(run.timer.state.kind).toBe('short');
    expect(run.onFocusComplete).toHaveBeenCalledTimes(1);
    advance(1_000);
    expect(run.timer.remaining).toBe(59_000);
  });

  it('finishes the automatic break and returns to a ready focus timer', () => {
    const run = mountTimer();
    act(() => run.timer.start());
    advance(60_000);
    advance(60_000);

    expect(run.timer.state.phase).toBe('idle');
    expect(run.timer.state.kind).toBe('focus');
    expect(run.onFocusComplete).toHaveBeenCalledTimes(1);
    expect(run.onBreakComplete).toHaveBeenCalledExactlyOnceWith('short');
  });

  it('starts and completes the next focus after an automatic break', () => {
    const run = mountTimer({ autoStartFocus: true });
    act(() => run.timer.start('写周报'));
    advance(60_000);
    advance(60_000);

    expect(run.timer.state.phase).toBe('focusing');
    advance(1_000);
    expect(run.timer.remaining).toBe(59_000);
    advance(59_000);
    expect(run.onFocusComplete).toHaveBeenCalledTimes(2);
    expect(run.onFocusComplete.mock.calls[1][0].task).toBe('写周报');
  });

  it('counts down a focus started by skipping a break', () => {
    const run = mountTimer({ autoStartFocus: true });
    act(() => run.timer.start());
    advance(60_000);
    act(() => run.timer.skipBreak());
    advance(1_000);

    expect(run.timer.state.phase).toBe('focusing');
    expect(run.timer.remaining).toBe(59_000);
    advance(59_000);
    expect(run.onFocusComplete).toHaveBeenCalledTimes(2);
    expect(run.onBreakComplete).not.toHaveBeenCalled();
  });

  it('freezes a paused focus and resumes from its remaining time', () => {
    const run = mountTimer();
    act(() => run.timer.start());
    advance(20_000);
    act(() => run.timer.pause());
    advance(600_000);

    expect(run.timer.remaining).toBe(40_000);
    expect(run.onFocusComplete).not.toHaveBeenCalled();
    act(() => run.timer.resume());
    advance(39_500);
    expect(run.timer.remaining).toBe(500);
    advance(500);
    expect(run.onFocusComplete).toHaveBeenCalledTimes(1);
    expect(run.onFocusComplete.mock.calls[0][0].minutes).toBe(1);
  });

  it('credits an overdue focus only once when visibility and interval ticks coincide', () => {
    const run = mountTimer();
    act(() => run.timer.start());
    const deadline = run.timer.state.endsAt!;
    vi.setSystemTime(deadline + 10_000);
    act(() => {
      testDocument.dispatchEvent(new Event('visibilitychange'));
      testDocument.dispatchEvent(new Event('visibilitychange'));
    });
    advance(500);

    expect(run.onFocusComplete).toHaveBeenCalledTimes(1);
    expect(run.onFocusComplete.mock.calls[0][0].endedAt).toBe(deadline);
    expect(run.timer.state.phase).toBe('breaking');
    expect(run.timer.remaining).toBe(59_500);
  });
});
