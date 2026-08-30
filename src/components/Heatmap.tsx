import { useEffect, useMemo, useRef, useState } from 'react';
import type { FocusEvent as ReactFocusEvent, MouseEvent as ReactMouseEvent } from 'react';
import type { FocusSession } from '../types';
import {
  aggregateByDay,
  buildYearGrid,
  dayKeyOf,
  formatMinutes,
  levelOf,
  monthLabelsOfWeeks,
} from '../lib/stats';
import HeatmapTooltip, { formatDayTooltip } from './HeatmapTooltip';

/** 复古绿五档，由浅到深 */
const HEAT_COLORS = ['#E4DCC8', '#C8D5B0', '#93B48B', '#5C8A64', '#3F5C4E'];
const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

interface HoverState {
  key: string;
  x: number;
  y: number;
  below: boolean;
}

interface Props {
  sessions: FocusSession[];
  year: number;
  onYearChange: (year: number) => void;
}

/** 年度热力图：53×7、周一开头、五档复古绿、今天描红边、当前周高亮 */
export default function Heatmap({ sessions, year, onYearChange }: Props) {
  const byDay = useMemo(() => aggregateByDay(sessions), [sessions]);
  const grid = useMemo(() => buildYearGrid(year), [year]);
  const monthLabels = useMemo(() => monthLabelsOfWeeks(grid, year), [grid, year]);
  const [hover, setHover] = useState<HoverState | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const yearTotals = useMemo(() => {
    let minutes = 0;
    let tomatoes = 0;
    const prefix = `${year}-`;
    for (const s of sessions) {
      if (dayKeyOf(s.endedAt).startsWith(prefix)) {
        minutes += s.minutes;
        if (!s.abandoned) tomatoes += 1;
      }
    }
    return { minutes, tomatoes };
  }, [sessions, year]);

  // 可切换年份 = 有数据的年份 ∪ 当前年
  const years = useMemo(() => {
    const set = new Set<number>([new Date().getFullYear()]);
    for (const s of sessions) set.add(new Date(s.endedAt).getFullYear());
    return [...set].sort((a, b) => a - b);
  }, [sessions]);
  const minYear = years[0] ?? year;
  const maxYear = years[years.length - 1] ?? year;

  // 打开/换年时滚到最右（最近的日子；移动端横向滚动）
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [year]);

  const todayKey = dayKeyOf(Date.now());

  const showTooltip = (
    key: string,
    e: ReactMouseEvent<HTMLElement> | ReactFocusEvent<HTMLElement>,
  ) => {
    const content = contentRef.current;
    const scroller = scrollRef.current;
    if (!content || !scroller) return;
    const cr = content.getBoundingClientRect();
    const r = e.currentTarget.getBoundingClientRect();
    const rawX = r.left - cr.left + r.width / 2;
    const leftBound = scroller.scrollLeft + 80;
    const rightBound = scroller.scrollLeft + scroller.clientWidth - 80;
    const x = Math.min(Math.max(rawX, leftBound), Math.max(leftBound, rightBound));
    const y = r.top - cr.top;
    setHover({ key, x, y, below: y < 48 });
  };

  const isCurrentWeek = (col: { key: string }[]) => col.some((c) => c.key === todayKey);

  const navBtn =
    'flex size-6 items-center justify-center border border-ink/50 text-sm leading-none text-ink/70 transition-colors hover:border-ink hover:text-ink disabled:cursor-not-allowed disabled:opacity-30';

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-xs tracking-widest text-ink/55">
          {year} · 合计 {formatMinutes(yearTotals.minutes)} · {yearTotals.tomatoes} 个番茄
        </p>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-[10px] text-ink/50">
            <span>少</span>
            {HEAT_COLORS.map((c) => (
              <span
                key={c}
                className="size-2.5 rounded-[2px] border border-ink/15"
                style={{ backgroundColor: c }}
              />
            ))}
            <span>多</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              className={navBtn}
              disabled={year <= minYear}
              onClick={() => onYearChange(year - 1)}
              aria-label="上一年"
            >
              ‹
            </button>
            <span className="min-w-[4ch] text-center text-sm font-bold tabular-nums">{year}</span>
            <button
              type="button"
              className={navBtn}
              disabled={year >= maxYear}
              onClick={() => onYearChange(year + 1)}
              aria-label="下一年"
            >
              ›
            </button>
          </div>
        </div>
      </div>

      <div ref={scrollRef} className="overflow-x-auto pb-1">
        <div ref={contentRef} className="relative flex min-w-max gap-2">
          {/* 左侧星期标签（周一开始） */}
          <div className="flex flex-col gap-[3px] pt-5" aria-hidden>
            {WEEKDAY_LABELS.map((w) => (
              <span key={w} className="flex h-3 items-center text-[9px] leading-none text-ink/45">
                {w}
              </span>
            ))}
          </div>
          <div>
            {/* 顶部月份标签 */}
            <div className="mb-1 flex h-4 gap-[3px]" aria-hidden>
              {monthLabels.map((m, i) => (
                <span key={i} className="w-3 text-center text-[10px] leading-4 text-ink/55">
                  {m !== null ? `${m}月` : ''}
                </span>
              ))}
            </div>
            <div className="flex gap-[3px]">
              {grid.map((col, ci) => (
                <div
                  key={ci}
                  className={`flex flex-col gap-[3px] rounded-[3px] ${
                    isCurrentWeek(col) ? 'outline outline-1 -outline-offset-1 outline-brick/60' : ''
                  }`}
                >
                  {col.map((cell) => {
                    if (!cell.inYear) return <span key={cell.key} className="size-3" />;
                    const stat = byDay.get(cell.key);
                    const isToday = cell.key === todayKey;
                    return (
                      <button
                        key={cell.key}
                        type="button"
                        className={`size-3 rounded-[2px] ${
                          isToday ? 'ring-1 ring-brick ring-offset-1 ring-offset-paper' : ''
                        }`}
                        style={{ backgroundColor: HEAT_COLORS[levelOf(stat?.minutes ?? 0)] }}
                        aria-label={formatDayTooltip(cell.key, stat)}
                        onMouseEnter={(e) => showTooltip(cell.key, e)}
                        onFocus={(e) => showTooltip(cell.key, e)}
                        onMouseLeave={() => setHover(null)}
                        onBlur={() => setHover(null)}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          {hover && (
            <HeatmapTooltip
              text={formatDayTooltip(hover.key, byDay.get(hover.key))}
              x={hover.x}
              y={hover.y}
              below={hover.below}
            />
          )}
        </div>
      </div>
    </div>
  );
}
