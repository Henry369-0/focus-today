import type { TimerApi } from '../hooks/useTimer';
import { formatMMSS } from '../lib/clock';
import TaskTag from './TaskTag';

const BTN_PRIMARY =
  'border-2 border-ink px-7 py-2.5 text-sm font-bold tracking-[0.3em] shadow-[3px_3px_0_#2B2B26] transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0_#2B2B26] disabled:cursor-not-allowed disabled:opacity-60';
const BTN_GHOST =
  'border-2 border-ink/40 px-5 py-2.5 text-sm tracking-[0.3em] text-ink/60 transition-colors hover:border-ink hover:text-ink';

const RING_R = 110;
const RING_C = 2 * Math.PI * RING_R;

interface Props {
  timer: TimerApi;
  task: string;
  onTaskChange: (v: string) => void;
  tags: string[];
}

/** 专注台：圆环倒计时 + 控制 + 会话圆点。专注砖红、休息墨绿。 */
export default function TimerCard({ timer, task, onTaskChange, tags }: Props) {
  const { state, remaining, progress } = timer;
  const idle = state.phase === 'idle';
  const paused = state.phase === 'focusing' && state.remainingMs !== null;
  const accent = state.phase === 'breaking' ? '#3F5C4E' : '#B5482A';
  const dots = state.settings.longBreakEvery;
  // 长休进行中恰好满一轮 → 圆点全亮；长休结束后取模归零
  const filled =
    state.phase === 'breaking' && state.kind === 'long' ? dots : state.pomodorosInRow % dots;
  const statusText = idle
    ? `就绪 · ${state.kind === 'focus' ? '专注' : state.kind === 'long' ? '长休' : '短休'}`
    : paused
      ? '已暂停'
      : state.phase === 'focusing'
        ? '专注中'
        : state.kind === 'long'
          ? '长休中'
          : '短休中';

  const handleAbandon = () => {
    if (window.confirm('确定放弃这个番茄？不满 5 分钟不入账，满 5 分钟按实际专注分钟入账。')) {
      timer.abandon();
    }
  };

  return (
    <div className="border-2 border-ink bg-paper p-1.5 shadow-[6px_6px_0_rgba(43,43,38,0.3)]">
      <div className="border border-ink/20 px-4 py-8 sm:px-10">
        <TaskTag value={task} onChange={onTaskChange} tags={tags} disabled={!idle} />

        <div className="relative mx-auto mt-7 w-[264px] max-w-full">
          <svg
            viewBox="0 0 260 260"
            className="block w-full"
            role="img"
            aria-label={`${statusText} ${formatMMSS(remaining)}`}
          >
            <circle
              cx="130"
              cy="130"
              r={RING_R}
              fill="none"
              stroke="#2B2B26"
              strokeOpacity="0.12"
              strokeWidth="10"
            />
            {progress > 0 && (
              <circle
                cx="130"
                cy="130"
                r={RING_R}
                fill="none"
                stroke={accent}
                strokeWidth="10"
                strokeDasharray={RING_C}
                strokeDashoffset={RING_C * (1 - progress)}
                transform="rotate(-90 130 130)"
                style={{ transition: 'stroke-dashoffset 0.6s linear' }}
              />
            )}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-[11px] tracking-[0.4em] text-ink/50">{statusText}</span>
            <span
              className={`mt-1 text-[56px] font-black leading-none tabular-nums ${
                idle ? 'text-ink/30' : state.phase === 'focusing' ? 'text-brick' : 'text-pine'
              }`}
            >
              {formatMMSS(remaining)}
            </span>
            {state.task && (
              <span className="mt-2 max-w-[170px] truncate text-xs tracking-widest text-ink/55">
                {state.task}
              </span>
            )}
          </div>
        </div>

        {/* 会话圆点：本轮番茄进度（每 longBreakEvery 个一次长休） */}
        <div
          className="mt-6 flex items-center justify-center gap-2"
          aria-label={`本轮番茄进度 ${filled}/${dots}`}
        >
          {Array.from({ length: dots }, (_, i) => (
            <span
              key={i}
              className={`size-2.5 rounded-full border border-ink/50 ${i < filled ? 'bg-brick' : ''}`}
            />
          ))}
          <span className="ml-2 text-[10px] tracking-[0.3em] text-ink/45">
            {filled}/{dots}
          </span>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {idle && (
            <button
              type="button"
              onClick={() => timer.start(task)}
              className={`${BTN_PRIMARY} ${state.kind === 'focus' ? 'bg-brick text-paper' : 'bg-pine text-paper'}`}
            >
              {state.kind === 'focus' ? '开始专注' : state.kind === 'long' ? '开始长休' : '开始短休'}
            </button>
          )}
          {state.phase === 'focusing' && !paused && (
            <button type="button" onClick={timer.pause} className={`${BTN_PRIMARY} bg-paper`}>
              暂停
            </button>
          )}
          {state.phase === 'focusing' && paused && (
            <button type="button" onClick={timer.resume} className={`${BTN_PRIMARY} bg-brick text-paper`}>
              继续
            </button>
          )}
          {state.phase === 'focusing' && (
            <button type="button" onClick={handleAbandon} className={BTN_GHOST}>
              放弃
            </button>
          )}
          {state.phase === 'breaking' && (
            <button type="button" onClick={timer.skipBreak} className={`${BTN_PRIMARY} bg-paper`}>
              跳过休息
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
