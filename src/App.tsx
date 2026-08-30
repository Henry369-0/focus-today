import { useCallback, useState } from 'react';
import type { BadgeState, FocusSession, Settings } from './types';
import { BADGES, evaluateBadges } from './lib/badges';
import {
  addSession,
  loadBadges,
  loadSessions,
  loadSettings,
  loadTags,
  rememberTag,
  saveBadges,
  saveSessions,
  saveSettings,
  saveTags,
  uid,
  unlockBadges,
} from './lib/sessions';
import type { ImportResult } from './lib/sessions';
import { useTimer } from './hooks/useTimer';
import type { FocusRecord } from './hooks/useTimer';
import TimerCard from './components/TimerCard';
import StatsStrip from './components/StatsStrip';
import Heatmap from './components/Heatmap';
import BadgeShelf from './components/BadgeShelf';
import SettingsPanel from './components/SettingsPanel';
import DataActions from './components/DataActions';

interface ToastItem {
  key: string;
  badgeId: string;
}

function SectionTitle({ no, title, hint }: { no: string; title: string; hint?: string }) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-3 border-b-[3px] border-double border-ink/60 pb-2">
      <h2 className="text-base font-bold tracking-[0.3em]">
        <span className="mr-2 text-brick">{no}</span>
        {title}
      </h2>
      {hint && <span className="text-xs tracking-widest text-ink/45">{hint}</span>}
    </div>
  );
}

export default function App() {
  const [sessions, setSessions] = useState<FocusSession[]>(() => loadSessions());
  const [badges, setBadges] = useState<BadgeState>(() => loadBadges());
  const [tags, setTags] = useState<string[]>(() => loadTags());
  const [task, setTask] = useState('');
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [initialSettings] = useState(() => loadSettings());

  /** 解锁瞬间弹纸片式 toast，4.8s 后自动收走 */
  const pushToasts = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    const at = Date.now();
    setToasts((prev) => [...prev, ...ids.map((id, i) => ({ key: `${at}-${i}-${id}`, badgeId: id }))]);
    ids.forEach((id, i) => {
      const key = `${at}-${i}-${id}`;
      window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.key !== key)), 4800);
    });
  }, []);

  /** 入账（到点完成或满 5 分钟的放弃都走这里）+ 任务标签记忆 + 徽章判定 */
  const recordFocus = useCallback(
    (record: FocusRecord) => {
      const session: FocusSession = {
        id: uid(),
        startedAt: record.startedAt,
        endedAt: record.endedAt,
        minutes: record.minutes,
        ...(record.task ? { task: record.task } : {}),
        ...(record.abandoned ? { abandoned: true } : {}),
      };
      setSessions(addSession(session));
      if (session.task) setTags(rememberTag(session.task));

      const fresh = evaluateBadges([...sessions, session], badges, Date.now());
      if (fresh.length > 0) {
        setBadges(unlockBadges(fresh.map((f) => f.id), Date.now()));
        pushToasts(fresh.map((f) => f.id));
      }
    },
    [sessions, badges, pushToasts],
  );

  const timer = useTimer(initialSettings, {
    onFocusComplete: recordFocus,
    onBreakComplete: () => {},
  });

  const updateSettings = (next: Settings) => {
    saveSettings(next);
    timer.setSettings(next);
  };

  const handleImport = (result: ImportResult) => {
    setSessions(saveSessions(result.sessions));
    saveBadges(result.badges);
    setBadges(result.badges);
    saveTags(result.tags);
    setTags(result.tags);
    saveSettings(result.settings);
    timer.setSettings(result.settings);
    // 导入的记录可能补齐了还没解锁的徽章
    const fresh = evaluateBadges(result.sessions, result.badges, Date.now());
    if (fresh.length > 0) {
      setBadges(unlockBadges(fresh.map((f) => f.id), Date.now()));
      pushToasts(fresh.map((f) => f.id));
    }
  };

  return (
    <div className="min-h-screen">
      <header className="border-b-2 border-ink/80 bg-mustard/25">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4">
          <span className="flex size-10 items-center justify-center border-2 border-ink bg-paper text-xl font-black text-brick shadow-[2px_2px_0_#2B2B26]">
            番
          </span>
          <div>
            <h1 className="text-lg font-bold leading-tight tracking-widest">番茄年报</h1>
            <p className="text-xs tracking-[0.2em] text-ink/55">focus.today · 攒格子，不断签</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-12 px-4 pb-32 pt-8">
        <section>
          <SectionTitle no="壹" title="专注台" hint="时间戳计时 · 合盖锁屏不漂移" />
          <TimerCard timer={timer} task={task} onTaskChange={setTask} tags={tags} />
        </section>

        <section>
          <SectionTitle no="贰" title="统计" hint="每天 ≥1 个完成番茄算连击" />
          <StatsStrip sessions={sessions} />
        </section>

        <section>
          <SectionTitle no="叁" title="年度热力图" hint="周一开头 · 今天描红边" />
          <Heatmap sessions={sessions} year={year} onYearChange={setYear} />
        </section>

        <section>
          <SectionTitle no="肆" title="成就墙" hint="共 10 枚" />
          <BadgeShelf badges={badges} />
        </section>

        <section>
          <SectionTitle no="伍" title="设置与备份" />
          <div className="grid gap-10 md:grid-cols-2">
            <div>
              <h3 className="mb-3 text-xs font-bold tracking-[0.3em] text-ink/55">计时设置</h3>
              <SettingsPanel settings={timer.state.settings} onChange={updateSettings} />
            </div>
            <div>
              <h3 className="mb-3 text-xs font-bold tracking-[0.3em] text-ink/55">导出 / 导入</h3>
              <DataActions
                sessions={sessions}
                badges={badges}
                tags={tags}
                settings={timer.state.settings}
                onImport={handleImport}
              />
            </div>
          </div>
        </section>
      </main>

      <footer className="fixed inset-x-0 bottom-0 z-40 border-t border-ink/20 bg-paper/90 backdrop-blur">
        <p className="mx-auto max-w-3xl px-4 py-2 text-center text-[11px] tracking-widest text-ink/40">
          focus.today · 数据仅存本机 · 换设备前记得导出备份
        </p>
      </footer>

      {toasts.length > 0 && (
        <div className="fixed bottom-14 left-1/2 z-50 max-w-[92vw] -translate-x-1/2 space-y-2">
          {toasts.map((t) => {
            const def = BADGES.find((b) => b.id === t.badgeId);
            if (!def) return null;
            return (
              <div
                key={t.key}
                className="flex animate-[toast-in_0.35s_ease-out] items-center gap-3 border-2 border-ink bg-paper px-4 py-3 shadow-[4px_4px_0_#2B2B26]"
              >
                <span className="flex size-9 shrink-0 items-center justify-center border-2 border-ink bg-mustard/40 font-black text-brick">
                  {def.glyph}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold tracking-wider">解锁徽章 · {def.name}</p>
                  <p className="text-xs text-ink/60">{def.tease ?? def.condition}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
