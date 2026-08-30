/**
 * Web Audio 合成铃声：零音频文件。
 * AudioContext 必须在用户手势后创建/恢复，ensureAudio 在开始/继续等按钮里调用。
 */

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (ctx) return ctx;
  try {
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AC) ctx = new AC();
  } catch {
    // 无音频环境：静默降级
  }
  return ctx;
}

/** 在用户手势里调用一次，解锁浏览器的自动播放策略 */
export function ensureAudio(): void {
  const c = getCtx();
  if (c && c.state === 'suspended') void c.resume().catch(() => {});
}

function tone(freq: number, delay: number, duration: number, volume = 0.12): void {
  const c = getCtx();
  if (!c) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  const t0 = c.currentTime + delay;
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
}

/** 专注结束：三音上行（C5–E5–G5） */
export function playFocusChime(): void {
  ensureAudio();
  [523.25, 659.25, 783.99].forEach((f, i) => tone(f, i * 0.16, 0.38));
}

/** 休息结束：两音下行（G5–C5） */
export function playBreakChime(): void {
  ensureAudio();
  [783.99, 523.25].forEach((f, i) => tone(f, i * 0.18, 0.42));
}
