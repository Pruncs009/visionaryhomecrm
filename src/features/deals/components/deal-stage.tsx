'use client';

import { useOptimistic, useTransition } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { cn } from '@/lib/utils';
import { updateDealStage } from '../actions';
import { DEAL_STAGE, DEAL_STAGE_SHORT, DEAL_STAGE_VALUES, type DealStage } from '../constants';

export function DealStageBadge({ stage, className }: { stage: DealStage; className?: string }) {
  const s = DEAL_STAGE[stage];
  return (
    <Badge variant="secondary" className={cn('border-transparent', s.className, className)}>
      {DEAL_STAGE_SHORT[stage] ?? s.label}
    </Badge>
  );
}

/** Stage dropdown on the deal page: saves immediately, sidebar counts update. */
export function DealStageSelect({ id, stage, className }: { id: string; stage: DealStage; className?: string }) {
  const [pending, start] = useTransition();
  const [value, setValue] = useOptimistic(stage);
  return (
    <NativeSelect
      id="deal-stage"
      aria-label="Deal stage"
      className={cn('w-full', className)}
      value={value}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value as DealStage;
        start(async () => {
          setValue(next);
          const r = await updateDealStage(id, next);
          if (r.ok) toast.success(`Moved to ${DEAL_STAGE[next].label}`);
          else toast.error(r.error);
        });
      }}
    >
      {DEAL_STAGE_VALUES.map((s) => (
        <NativeSelectOption key={s} value={s}>{DEAL_STAGE[s].label}</NativeSelectOption>
      ))}
    </NativeSelect>
  );
}
