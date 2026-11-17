// Batang progres menuju ambang graduation. `bps` 0–10000.
export function ProgressBar({ bps, label }: { bps: number; label: string }) {
  const percent = Math.max(0, Math.min(100, bps / 100));
  return (
    <div
      className="progress"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(percent)}
    >
      <div style={{ width: `${percent}%` }} />
    </div>
  );
}
