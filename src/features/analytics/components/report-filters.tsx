'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { Loader2 } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { RANGE_OPTIONS, type RangeKey } from '../types';

/**
 * One filter row above all charts. State lives in the URL (?range=&agent=) so a
 * filtered report can be bookmarked or shared, and the server renders it.
 */
export function ReportFilters({
  range,
  agent,
  agents,
}: {
  range: RangeKey;
  agent: string | undefined;
  agents: { id: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const set = (key: 'range' | 'agent', value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  };

  return (
    <div className="flex flex-wrap items-end gap-3" aria-busy={pending}>
      <div className="grid gap-1">
        <Label htmlFor="report-range" className="text-xs text-muted-foreground">Period</Label>
        <NativeSelect id="report-range" value={range} onChange={(e) => set('range', e.target.value)}>
          {RANGE_OPTIONS.map((o) => (
            <NativeSelectOption key={o.value} value={o.value}>{o.label}</NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <div className="grid gap-1">
        <Label htmlFor="report-agent" className="text-xs text-muted-foreground">Agent</Label>
        <NativeSelect id="report-agent" value={agent ?? ''} onChange={(e) => set('agent', e.target.value)}>
          <NativeSelectOption value="">Whole team</NativeSelectOption>
          {agents.map((a) => (
            <NativeSelectOption key={a.id} value={a.id}>{a.name}</NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      {pending && (
        <span className="flex h-8 items-center gap-1.5 text-xs text-muted-foreground" role="status">
          <Loader2 className="size-3.5 animate-spin" aria-hidden /> Updating…
        </span>
      )}
    </div>
  );
}
