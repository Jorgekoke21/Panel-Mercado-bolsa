import { cn } from "@/lib/cn";

interface SparklineProps {
  values: readonly number[];
  width?: number;
  height?: number;
  className?: string;
}

/** Minigráfico SVG sin dependencias. El color sigue la dirección (primer → último valor). */
export function Sparkline({ values, width = 72, height = 22, className }: SparklineProps) {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length < 2) return <svg aria-hidden width={width} height={height} className={className} />;
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const span = max - min || 1;
  const step = width / (finite.length - 1);
  const points = finite
    .map((v, i) => `${(i * step).toFixed(1)},${(height - 1 - ((v - min) / span) * (height - 2)).toFixed(1)}`)
    .join(" ");
  const first = finite[0] ?? 0;
  const last = finite.at(-1) ?? 0;
  const tone = last > first ? "text-positive" : last < first ? "text-negative" : "text-fg-muted";
  return (
    <svg aria-hidden width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={cn(tone, className)}>
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth={1.25} strokeLinejoin="round" />
    </svg>
  );
}
