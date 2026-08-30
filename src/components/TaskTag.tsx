interface Props {
  value: string;
  onChange: (v: string) => void;
  tags: string[];
  disabled: boolean;
}

/** 任务标签输入 + 最近 8 个标签点选 */
export default function TaskTag({ value, onChange, tags, disabled }: Props) {
  return (
    <div className="mx-auto max-w-md">
      <label className="block text-center text-[11px] tracking-[0.4em] text-ink/50">
        任务标签（可选）
      </label>
      <input
        type="text"
        value={value}
        maxLength={20}
        disabled={disabled}
        placeholder="例：写周报"
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 w-full border-2 border-ink/60 bg-transparent px-3 py-2 text-center text-sm tracking-widest placeholder:text-ink/30 focus:border-ink focus:outline-none disabled:opacity-50"
      />
      {disabled && (
        <p className="mt-1 text-center text-[10px] tracking-widest text-ink/40">
          进行中 · 本轮任务已锁定，下轮可改
        </p>
      )}
      {tags.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <span className="text-[10px] tracking-[0.3em] text-ink/40">最近</span>
          {tags.map((t) => (
            <button
              key={t}
              type="button"
              disabled={disabled}
              onClick={() => onChange(t)}
              className="border border-ink/40 px-2 py-0.5 text-xs text-ink/70 transition-colors hover:border-ink hover:bg-mustard/30 hover:text-ink disabled:opacity-40"
            >
              {t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
