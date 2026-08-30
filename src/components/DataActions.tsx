import { useRef, useState } from 'react';
import type { BadgeState, FocusSession, Settings } from '../types';
import { applyBackup, buildBackup } from '../lib/sessions';
import type { ImportResult } from '../lib/sessions';

const BTN =
  'border-2 border-ink px-5 py-2.5 text-sm font-bold tracking-[0.2em] shadow-[3px_3px_0_#2B2B26] transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0_#2B2B26]';

interface Props {
  sessions: FocusSession[];
  badges: BadgeState;
  tags: string[];
  settings: Settings;
  onImport: (result: ImportResult) => void;
}

/** 导出 / 导入 JSON 备份 */
export default function DataActions({ sessions, badges, tags, settings, onImport }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);

  const handleExport = () => {
    const backup = buildBackup(sessions, badges, tags, settings);
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const d = new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    a.download = `focus-today-backup-${ymd}.json`;
    a.href = url;
    a.click();
    URL.revokeObjectURL(url);
    setStatus(`已导出 ${backup.sessions.length} 条记录`);
  };

  const handleFile = async (file: File) => {
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const result = applyBackup(parsed, { sessions, badges, tags, settings });
      if (!result) {
        setStatus('文件格式不对，导入失败');
        return;
      }
      onImport(result);
      setStatus(
        `已导入 ${result.added} 条新记录${result.badgesAdded > 0 ? `，补解锁 ${result.badgesAdded} 枚徽章` : ''}`,
      );
    } catch {
      setStatus('读取文件失败，请重试');
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm leading-6 text-ink/70">
        所有记录只存在这台浏览器里。换设备、清缓存前，先导出一份 JSON 备份；导入时自动与本机数据合并去重。
      </p>
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={handleExport} className={`${BTN} bg-brick text-paper`}>
          导出数据 JSON
        </button>
        <button type="button" onClick={() => fileRef.current?.click()} className={`${BTN} bg-paper`}>
          导入备份
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
            e.target.value = '';
          }}
        />
      </div>
      {status && <p className="text-xs tracking-wider text-pine">{status}</p>}
    </div>
  );
}
