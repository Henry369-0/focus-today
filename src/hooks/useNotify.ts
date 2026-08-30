import { useCallback } from 'react';
import type { SessionKind, Settings } from '../types';
import { playBreakChime, playFocusChime } from '../lib/sound';

export type NotifyStatus = 'sent' | 'fallback' | 'off';

/**
 * 声音 + 桌面通知封装。
 * 返回 fallback 表示通知发不出去（权限被拒/不支持），由调用方回落为"标题闪烁 + 声音"。
 */
export function useNotify() {
  return useCallback(
    (kind: SessionKind, settings: Settings, task?: string): NotifyStatus => {
      if (settings.soundOn) {
        if (kind === 'focus') playFocusChime();
        else playBreakChime();
      }
      if (!settings.notifOn || !('Notification' in window)) return 'off';
      if (Notification.permission !== 'granted') return 'fallback';
      const title = kind === 'focus' ? '🍅 专注完成' : '⏰ 休息结束';
      const body =
        kind === 'focus'
          ? `「${task?.trim() || '专注'}」入账 ${settings.focusMin} 分钟，休息一下`
          : '休息够了，开始下一个番茄';
      try {
        new Notification(title, { body, icon: '/favicon.svg', tag: 'focus-today' });
        return 'sent';
      } catch {
        return 'fallback';
      }
    },
    [],
  );
}
