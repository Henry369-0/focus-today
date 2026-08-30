import { mainTaskOf } from '../lib/stats';
import type { DayStat } from '../lib/stats';

/** 悬浮提示：10月24日 · 专注 75 分钟 · 3 个番茄 · 主要：写周报 */
export function formatDayTooltip(key: string, stat?: DayStat): string {
  const date = `${Number(key.slice(5, 7))}月${Number(key.slice(8, 10))}日`;
  if (!stat || stat.minutes <= 0) return `${date} · 无记录`;
  const main = mainTaskOf(stat);
  return `${date} · 专注 ${stat.minutes} 分钟 · ${stat.tomatoes} 个番茄${main ? ` · 主要：${main}` : ''}`;
}

interface Props {
  text: string;
  /** 格子中心（相对热力图内容容器） */
  x: number;
  /** 格子顶边（相对热力图内容容器） */
  y: number;
  /** 顶部空间不足时改为在格子下方展开 */
  below: boolean;
}

export default function HeatmapTooltip({ text, x, y, below }: Props) {
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-20 whitespace-nowrap border-2 border-ink bg-paper px-3 py-1.5 text-xs tracking-wider text-ink shadow-[3px_3px_0_rgba(43,43,38,0.3)]"
      style={
        below
          ? { left: x, top: y + 20, transform: 'translateX(-50%)' }
          : { left: x, top: y - 8, transform: 'translate(-50%, -100%)' }
      }
    >
      {text}
    </div>
  );
}
