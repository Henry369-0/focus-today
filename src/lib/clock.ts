/** 放弃入账门槛：专注满 5 分钟才按实际分钟入账（防刷数据） */
export const ABANDON_CREDIT_MIN = 5;

/** 到点判定：秒数永远由 endsAt - now 推算，睡过头（合盖/锁屏）也算完成 */
export function isDue(endsAt: number, now: number): boolean {
  return now >= endsAt;
}

/** 秒表显示：向上取整——起始即显示 25:00，最后一秒显示 00:01 而非 00:00 */
export function formatMMSS(ms: number): string {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * 放弃结算：按"实际专注时长"（扣除暂停）算整分钟。
 * 不满 5 分钟 → null（不入账）；满 5 分钟 → 实际整分钟。
 */
export function abandonCreditMinutes(focusedElapsedMs: number): number | null {
  const minutes = Math.floor(Math.max(0, focusedElapsedMs) / 60_000);
  return minutes >= ABANDON_CREDIT_MIN ? minutes : null;
}
