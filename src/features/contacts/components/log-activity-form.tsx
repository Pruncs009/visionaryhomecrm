'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { logActivity } from '../actions';
import { MANUAL_ACTIVITY_LABEL, MANUAL_ACTIVITY_TYPES } from '../constants';

/** Log a call / email / text / meeting. Times are entered in the browser's timezone and sent as ISO. */
export function LogActivityForm({ contactId }: { contactId: string }) {
  const boundLogActivity = useMemo(() => logActivity.bind(null, contactId), [contactId]);
  const [state, formAction, isPending] = useActionState(boundLogActivity, {});
  const formRef = useRef<HTMLFormElement>(null);
  const [localTime, setLocalTime] = useState('');
  const router = useRouter();

  useEffect(() => {
    if (state.success) {
      toast.success(state.success);
      formRef.current?.reset();
      setLocalTime('');
      router.refresh(); // the action doesn't revalidate (see addNote in actions.ts)
    }
  }, [state, router]);

  const error = state.fieldErrors?.summary?.[0] ?? state.fieldErrors?.occurred_at?.[0] ?? state.error;

  return (
    <form ref={formRef} action={formAction} className="space-y-2 rounded-lg bg-muted/40 p-3">
      <div className="flex flex-wrap gap-2">
        <NativeSelect name="type" aria-label="Activity type" defaultValue="call" size="sm">
          {MANUAL_ACTIVITY_TYPES.map((t) => (
            <NativeSelectOption key={t} value={t}>{MANUAL_ACTIVITY_LABEL[t]}</NativeSelectOption>
          ))}
        </NativeSelect>
        <Input
          type="datetime-local"
          aria-label="When (leave empty for now)"
          className="h-7 w-auto text-xs"
          value={localTime}
          onChange={(e) => setLocalTime(e.target.value)}
        />
        {/* datetime-local has no timezone; convert in the browser so the server stores the right instant */}
        <input type="hidden" name="occurred_at" value={localTime ? new Date(localTime).toISOString() : ''} />
      </div>
      <Input name="summary" placeholder="What happened? e.g. Left voicemail about Saturday showing" aria-label="Activity summary" maxLength={2000} />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end">
        <Button type="submit" size="sm" variant="secondary" disabled={isPending}>{isPending ? 'Logging…' : 'Log activity'}</Button>
      </div>
    </form>
  );
}
