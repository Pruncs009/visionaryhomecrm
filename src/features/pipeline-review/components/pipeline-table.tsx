'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { ExternalLink, Lock, Plus, RefreshCw, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { PipelineSheet } from '@/lib/google/sheets';
import { addPipelineRow, savePipelineCell } from '../actions';

/** How often the page re-reads the sheet so edits made in Google Sheets show up. */
const REFRESH_MS = 30_000;

type Editing = { rowNumber: number; column: number; value: string; original: string } | null;

export function PipelineTable({ sheet }: { sheet: PipelineSheet }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Editing>(null);
  const [saved, setSaved] = useState<Record<string, string>>({}); // optimistic values until the next refresh
  const [syncedAt, setSyncedAt] = useState(() => new Date());
  const [refreshing, startRefresh] = useTransition();
  const [, startSave] = useTransition();
  const editingRef = useRef(false);
  editingRef.current = editing !== null;

  // New data from the server → drop optimistic values, stamp the sync time.
  useEffect(() => {
    setSaved({});
    setSyncedAt(new Date());
  }, [sheet]);

  const refresh = () => startRefresh(() => router.refresh());

  // Keep in step with Google Sheets: refresh on a timer and when the tab comes back into view.
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible' && !editingRef.current) startRefresh(() => router.refresh());
    };
    const id = window.setInterval(tick, REFRESH_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [router]);

  const value = (rowNumber: number, column: number, fallback: string) => saved[`${rowNumber}:${column}`] ?? fallback;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sheet.rows;
    return sheet.rows.filter((r) => r.cells.some((c) => c.toLowerCase().includes(q)));
  }, [sheet.rows, query]);

  const commit = (e: NonNullable<Editing>) => {
    if (!editingRef.current) return; // Enter then blur: save once
    editingRef.current = false;
    setEditing(null);
    if (e.value === e.original) return;
    const key = `${e.rowNumber}:${e.column}`;
    setSaved((s) => ({ ...s, [key]: e.value }));
    startSave(async () => {
      const r = await savePipelineCell({ rowNumber: e.rowNumber, column: e.column, value: e.value, expected: e.original });
      if (r.ok) {
        toast.success(`Saved to Google Sheets: ${sheet.headers[e.column]}`);
        router.refresh();
        return;
      }
      setSaved((s) => {
        const { [key]: _drop, ...rest } = s;
        return rest;
      });
      toast.error(r.error);
      if (r.conflict) router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the tracker" className="pl-8" aria-label="Search the tracker" />
        </div>
        <span className="text-xs text-muted-foreground">
          {rows.length} of {sheet.rows.length} rows · tab “{sheet.title}” · synced {syncedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing}>
            <RefreshCw className={cn(refreshing && 'animate-spin')} /> Refresh
          </Button>
          <AddRowButton headers={sheet.headers} onAdded={refresh} />
          <a href={sheet.url} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            <ExternalLink /> Open in Google Sheets
          </a>
        </div>
      </div>

      <div className="max-h-[calc(100dvh-14rem)] overflow-auto rounded-xl ring-1 ring-foreground/10">
        <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="sticky top-0 left-0 z-20 border-b bg-muted px-2 py-2 text-right text-xs font-medium text-muted-foreground">#</th>
              {sheet.headers.map((h, c) => (
                <th key={c} className="sticky top-0 z-10 border-b bg-muted px-3 py-2 text-left text-xs font-semibold whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={sheet.headers.length + 1} className="px-4 py-10 text-center text-muted-foreground">No rows match.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.rowNumber} className="group">
                <td className="sticky left-0 z-[5] border-b bg-card px-2 py-1.5 text-right text-xs text-muted-foreground tabular-nums group-hover:bg-muted">{r.rowNumber}</td>
                {r.cells.map((cell, c) => {
                  const shown = value(r.rowNumber, c, cell);
                  const isEditing = editing?.rowNumber === r.rowNumber && editing.column === c;
                  const locked = r.formula[c];
                  return (
                    <td key={c} className="max-w-80 border-b px-1 py-0.5 align-top group-hover:bg-muted/50">
                      {isEditing ? (
                        <Input
                          autoFocus
                          onFocus={(e) => e.currentTarget.select()}
                          value={editing.value}
                          onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                          onBlur={() => commit(editing)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commit(editing);
                            if (e.key === 'Escape') {
                              editingRef.current = false;
                              setEditing(null);
                            }
                          }}
                          className="h-7 min-w-40"
                          aria-label={`${sheet.headers[c]}, row ${r.rowNumber}`}
                        />
                      ) : (
                        <button
                          type="button"
                          disabled={locked}
                          title={locked ? 'Formula — change it in Google Sheets' : `Edit ${sheet.headers[c]}`}
                          onClick={() => setEditing({ rowNumber: r.rowNumber, column: c, value: shown, original: cell })}
                          className={cn(
                            'block min-h-7 w-full rounded px-2 py-1 text-left break-words whitespace-pre-wrap',
                            locked ? 'cursor-default text-muted-foreground' : 'hover:bg-primary/10',
                            shown !== cell && 'text-primary',
                          )}
                        >
                          {shown || <span className="text-muted-foreground/40">—</span>}
                          {locked && <Lock className="ml-1 inline size-3 align-[-1px] opacity-50" aria-label="formula" />}
                        </button>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Click a cell to edit it; press Enter to save to Google Sheets. Cells with a lock are formulas and can only be changed in the sheet.
      </p>
    </div>
  );
}

function AddRowButton({ headers, onAdded }: { headers: string[]; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<string[]>([]);
  const [pending, start] = useTransition();
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => { setOpen(o); if (o) setValues(headers.map(() => '')); }}>
      <DialogPrimitive.Trigger className={buttonVariants({ size: 'sm' })}><Plus /> Add row</DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/10 supports-backdrop-filter:backdrop-blur-xs" />
        <DialogPrimitive.Popup className="fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl bg-popover text-popover-foreground ring-1 ring-foreground/10 outline-none">
          <div className="flex items-center justify-between border-b px-5 py-3">
            <DialogPrimitive.Title className="text-base font-semibold">Add a row to the tracker</DialogPrimitive.Title>
            <DialogPrimitive.Close aria-label="Close" className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="size-4" /></DialogPrimitive.Close>
          </div>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const r = await addPipelineRow(values);
                if (!r.ok) return void toast.error(r.error);
                toast.success('Row added to Google Sheets');
                setOpen(false);
                onAdded();
              });
            }}
          >
            <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto p-5 sm:grid-cols-2">
              {headers.map((h, i) => (
                <label key={i} className="space-y-1 text-sm">
                  <span className="block text-xs text-muted-foreground">{h}</span>
                  <Input value={values[i] ?? ''} onChange={(e) => setValues((v) => v.map((x, j) => (j === i ? e.target.value : x)))} />
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2 border-t px-5 py-3">
              <DialogPrimitive.Close render={<Button type="button" variant="outline" />}>Cancel</DialogPrimitive.Close>
              <Button type="submit" disabled={pending}>{pending ? 'Adding…' : 'Add row'}</Button>
            </div>
          </form>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
