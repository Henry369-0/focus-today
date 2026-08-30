import { BADGES } from '../lib/badges';
import type { BadgeState } from '../types';

/** 成就墙：已解锁亮章，未解锁剪影 + 达成条件 */
export default function BadgeShelf({ badges }: { badges: BadgeState }) {
  const unlockedCount = BADGES.filter((b) => b.id in badges).length;
  return (
    <div>
      <p className="mb-3 text-xs tracking-widest text-ink/55">
        已解锁 {unlockedCount} / {BADGES.length} 枚
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {BADGES.map((b) => {
          const at = badges[b.id];
          const unlocked = at !== undefined;
          return (
            <div
              key={b.id}
              className={`px-3 py-3 text-center ${
                unlocked
                  ? 'border-2 border-ink bg-paper shadow-[3px_3px_0_rgba(43,43,38,0.25)]'
                  : 'border-2 border-dashed border-ink/35'
              }`}
            >
              <span
                className={`mx-auto flex h-11 w-11 items-center justify-center border-2 font-black ${
                  unlocked
                    ? 'border-ink bg-mustard/35 text-brick'
                    : 'border-ink/30 bg-transparent text-ink/25'
                } ${b.glyph.length > 1 ? 'text-sm' : 'text-xl'}`}
              >
                {b.glyph}
              </span>
              <p className={`mt-2 text-sm font-bold ${unlocked ? '' : 'text-ink/45'}`}>{b.name}</p>
              <p className="mt-0.5 text-[11px] leading-4 text-ink/50">
                {unlocked
                  ? `${new Date(at).getMonth() + 1}月${new Date(at).getDate()}日解锁`
                  : b.condition}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
