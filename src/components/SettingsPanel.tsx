import { useState } from 'react';
import type { Settings } from '../types';

interface Props {
  settings: Settings;
  onChange: (s: Settings) => void;
}

const NUMBER_FIELDS = [
  { key: 'focusMin', label: '专注时长', min: 1, max: 180, suffix: '分钟' },
  { key: 'breakMin', label: '短休时长', min: 1, max: 60, suffix: '分钟' },
  { key: 'longBreakMin', label: '长休时长', min: 5, max: 90, suffix: '分钟' },
  { key: 'longBreakEvery', label: '长休节奏', min: 2, max: 8, suffix: '个番茄' },
] as const;

const TOGGLES = [
  { key: 'autoStartBreak', label: '自动开始休息' },
  { key: 'autoStartFocus', label: '休息后自动开始下一个专注' },
  { key: 'soundOn', label: '提示音（振荡器合成）' },
  { key: 'notifOn', label: '桌面通知（需浏览器授权）' },
] as const;

/** 时长设置 + 声音/通知开关，改动即存本机；进行中的一轮按开始时的时长结算 */
export default function SettingsPanel({ settings, onChange }: Props) {
  const [hint, setHint] = useState<string | null>(null);

  const clampNum = (v: string, min: number, max: number): number => {
    const n = Number.parseInt(v, 10);
    if (Number.isNaN(n)) return min;
    return Math.min(max, Math.max(min, n));
  };

  const handleNotif = async (checked: boolean) => {
    setHint(null);
    if (!checked) {
      onChange({ ...settings, notifOn: false });
      return;
    }
    if (!('Notification' in window)) {
      setHint('此浏览器不支持桌面通知');
      return;
    }
    let perm = Notification.permission;
    if (perm === 'default') {
      try {
        perm = await Notification.requestPermission();
      } catch {
        perm = 'denied';
      }
    }
    if (perm === 'granted') onChange({ ...settings, notifOn: true });
    else setHint('通知权限被拒绝，可在浏览器地址栏的权限设置里重新允许');
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        {NUMBER_FIELDS.map((f) => (
          <label key={f.key} className="block">
            <span className="block text-[10px] tracking-[0.3em] text-ink/50">{f.label}</span>
            <span className="mt-1 flex items-center gap-1.5">
              <input
                type="number"
                min={f.min}
                max={f.max}
                value={settings[f.key]}
                onChange={(e) =>
                  onChange({ ...settings, [f.key]: clampNum(e.target.value, f.min, f.max) } as Settings)
                }
                className="w-16 border-2 border-ink/60 bg-transparent px-2 py-1 text-center text-sm tabular-nums focus:border-ink focus:outline-none"
              />
              <span className="text-[11px] text-ink/50">{f.suffix}</span>
            </span>
          </label>
        ))}
      </div>

      <div className="space-y-2 border-t border-ink/15 pt-3">
        {TOGGLES.map((t) => (
          <label key={t.key} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings[t.key]}
              onChange={(e) =>
                t.key === 'notifOn'
                  ? void handleNotif(e.target.checked)
                  : onChange({ ...settings, [t.key]: e.target.checked } as Settings)
              }
              className="size-4 accent-brick"
            />
            {t.label}
          </label>
        ))}
      </div>

      {hint && (
        <p className="border-2 border-brick bg-brick/10 px-3 py-2 text-xs text-brick">{hint}</p>
      )}
      <p className="text-[11px] leading-5 text-ink/45">
        修改立即保存到本机；进行中的一轮按开始时的时长结算。
      </p>
    </div>
  );
}
