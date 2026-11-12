import { Flame, Snowflake, Thermometer } from 'lucide-react';
import { cn } from '@/lib/utils';

type Temperature = 'hot' | 'warm' | 'cold';

const STYLE: Record<Temperature, { label: string; icon: React.ElementType; className: string }> = {
  hot: { label: 'Hot', icon: Flame, className: 'bg-critical/10 text-critical' },
  warm: { label: 'Warm', icon: Thermometer, className: 'bg-chart-1/15 text-foreground' },
  cold: { label: 'Cold', icon: Snowflake, className: 'bg-muted text-muted-foreground' },
};

/** "82 · Hot" — icon + word, so temperature is never conveyed by color alone. */
export function ScoreBadge({ score, temperature, className }: { score: number | null; temperature: Temperature | null; className?: string }) {
  if (score === null || !temperature) return null;
  const s = STYLE[temperature];
  const Icon = s.icon;
  return (
    <span
      role="img"
      aria-label={`AI lead score ${score} out of 100, ${s.label}`}
      title={`AI lead score ${score}/100 (${s.label})`}
      className={cn('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums', s.className, className)}
    >
      <Icon className="size-3" aria-hidden />
      <span aria-hidden>{score} · {s.label}</span>
    </span>
  );
}
