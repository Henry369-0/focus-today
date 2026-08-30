import type { BadgeState, FocusSession, Settings } from '../types';

export const SESSIONS_KEY = 'focus.v1.sessions';
export const SETTINGS_KEY = 'focus.v1.settings';
export const BADGES_KEY = 'focus.v1.badges';
export const TAGS_KEY = 'focus.v1.tags';
/** 配额意识：一条约 100B，5000 条约 0.5MB，远低于 5MB */
export const MAX_SESSIONS = 5000;
export const MAX_TAGS = 8;

export const DEFAULT_SETTINGS: Settings = {
  focusMin: 25,
  breakMin: 5,
  longBreakMin: 15,
  longBreakEvery: 4,
  autoStartBreak: true,
  autoStartFocus: false,
  soundOn: true,
  notifOn: false,
};

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 存储满/被禁用：静默降级，不阻塞主流程
  }
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function isSessionLike(v: unknown): v is FocusSession {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as Record<string, unknown>;
  return (
    typeof s.id === 'string' &&
    s.id.length > 0 &&
    Number.isFinite(s.startedAt) &&
    Number.isFinite(s.endedAt) &&
    (s.endedAt as number) >= (s.startedAt as number) &&
    typeof s.minutes === 'number' &&
    s.minutes > 0 &&
    (s.task === undefined || typeof s.task === 'string')
  );
}

/** 最近记录在前，裁剪至 5000 条 */
export function loadSessions(): FocusSession[] {
  const list = read<unknown[]>(SESSIONS_KEY);
  if (!Array.isArray(list)) return [];
  return list.filter(isSessionLike).sort((a, b) => b.endedAt - a.endedAt);
}

/** 新记录置顶写入，裁剪至最近 5000 条；返回新列表（已持久化） */
export function addSession(session: FocusSession): FocusSession[] {
  const next = [session, ...loadSessions().filter((s) => s.id !== session.id)].slice(
    0,
    MAX_SESSIONS,
  );
  write(SESSIONS_KEY, next);
  return next;
}

export function saveSessions(list: FocusSession[]): FocusSession[] {
  const next = [...list].sort((a, b) => b.endedAt - a.endedAt).slice(0, MAX_SESSIONS);
  write(SESSIONS_KEY, next);
  return next;
}

export function loadSettings(): Settings {
  const raw = read<Partial<Settings>>(SETTINGS_KEY);
  return raw ? { ...DEFAULT_SETTINGS, ...raw } : { ...DEFAULT_SETTINGS };
}

export function saveSettings(settings: Settings): void {
  write(SETTINGS_KEY, settings);
}

export function loadBadges(): BadgeState {
  const raw = read<BadgeState>(BADGES_KEY);
  if (!raw || typeof raw !== 'object') return {};
  const out: BadgeState = {};
  for (const [id, at] of Object.entries(raw)) {
    if (typeof at === 'number' && Number.isFinite(at)) out[id] = at;
  }
  return out;
}

export function saveBadges(state: BadgeState): void {
  write(BADGES_KEY, state);
}

/** 解锁一批徽章（同一枚保留最早解锁时间），返回新状态（已持久化） */
export function unlockBadges(ids: string[], at: number): BadgeState {
  const next = loadBadges();
  for (const id of ids) {
    next[id] = Math.min(next[id] ?? at, at);
  }
  saveBadges(next);
  return next;
}

export function loadTags(): string[] {
  const raw = read<unknown[]>(TAGS_KEY);
  return Array.isArray(raw) ? raw.filter((t): t is string => typeof t === 'string') : [];
}

export function saveTags(tags: string[]): void {
  write(TAGS_KEY, tags);
}

/** 记住最近 8 个标签（置顶去重），返回新列表（已持久化） */
export function rememberTag(tag: string): string[] {
  const t = tag.trim();
  if (!t) return loadTags();
  const next = [t, ...loadTags().filter((x) => x !== t)].slice(0, MAX_TAGS);
  saveTags(next);
  return next;
}

/* ---------------- 导出 / 导入 ---------------- */

export interface Backup {
  app: string;
  version: number;
  exportedAt: string;
  sessions: FocusSession[];
  badges: BadgeState;
  tags: string[];
  settings: Settings;
}

export function buildBackup(
  sessions: FocusSession[],
  badges: BadgeState,
  tags: string[],
  settings: Settings,
): Backup {
  return {
    app: 'focus.today',
    version: 1,
    exportedAt: new Date().toISOString(),
    sessions,
    badges,
    tags,
    settings,
  };
}

export interface ImportPayload {
  sessions: FocusSession[];
  badges: BadgeState;
  tags: string[];
  settings: Settings;
}

export interface ImportResult extends ImportPayload {
  /** 新合并进来的记录条数 */
  added: number;
  /** 新补解锁的徽章数 */
  badgesAdded: number;
}

function isValidSettings(v: unknown): v is Settings {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as Record<string, unknown>;
  return (
    Number.isFinite(s.focusMin) &&
    Number.isFinite(s.breakMin) &&
    Number.isFinite(s.longBreakMin) &&
    Number.isFinite(s.longBreakEvery) &&
    typeof s.autoStartBreak === 'boolean' &&
    typeof s.autoStartFocus === 'boolean' &&
    typeof s.soundOn === 'boolean' &&
    typeof s.notifOn === 'boolean'
  );
}

/** 合并导入：按 id 去重、徽章取最早解锁时间、标签并集；本机数据优先。格式不对返回 null */
export function applyBackup(raw: unknown, current: ImportPayload): ImportResult | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const b = raw as Record<string, unknown>;
  if (!Array.isArray(b.sessions)) return null;

  const imported = (b.sessions as unknown[]).filter(isSessionLike);
  const known = new Set(current.sessions.map((s) => s.id));
  const fresh = imported.filter((s) => !known.has(s.id));
  const sessions = [...fresh, ...current.sessions];

  const badges: BadgeState = { ...current.badges };
  let badgesAdded = 0;
  if (typeof b.badges === 'object' && b.badges !== null) {
    for (const [id, at] of Object.entries(b.badges as Record<string, unknown>)) {
      if (typeof at !== 'number' || !Number.isFinite(at)) continue;
      if (badges[id] === undefined) {
        badges[id] = at;
        badgesAdded += 1;
      } else {
        badges[id] = Math.min(badges[id], at);
      }
    }
  }

  const rawTags = Array.isArray(b.tags)
    ? b.tags.filter((t): t is string => typeof t === 'string')
    : [];
  const tags = [...new Set([...current.tags, ...rawTags])].slice(0, MAX_TAGS);

  const settings = isValidSettings(b.settings) ? (b.settings as Settings) : current.settings;

  return { sessions, badges, tags, settings, added: fresh.length, badgesAdded };
}
