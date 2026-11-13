'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, LogIn, Maximize2, Minimize2, RefreshCw } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * The team's Google Sheet, shown inside the CRM. It is the real sheet (not a
 * copy), so edits made here are in Google Sheets and vice versa. Google needs
 * the viewer to be signed in to a Google account the sheet is shared with.
 *
 * The sheet comes first so it gets the room; the title and buttons sit below.
 * "Full screen" stretches the sheet over the whole CRM window (same iframe, so
 * it doesn't reload).
 */
export function SheetEmbed({ sheetId, gid }: { sheetId: string; gid: string }) {
  const [reloadKey, setReloadKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [full, setFull] = useState(false);
  const editUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/edit?gid=${gid}#gid=${gid}`;
  // Google's sign-in can't run inside another site, so it opens in a new tab and comes back to the sheet.
  const signInUrl = `https://accounts.google.com/AccountChooser?continue=${encodeURIComponent(editUrl)}`;

  const reload = () => {
    setLoading(true);
    setReloadKey((k) => k + 1);
  };

  // Full screen: Esc exits (when the CRM has focus) and the page behind doesn't scroll.
  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setFull(false);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [full]);

  const buttons = (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant={full ? 'default' : 'outline'} onClick={() => setFull((f) => !f)}>
        {full ? <><Minimize2 /> Exit full screen</> : <><Maximize2 /> Full screen</>}
      </Button>
      <a href={signInUrl} target="_blank" rel="noopener noreferrer" className={buttonVariants({ size: 'sm', variant: full ? 'outline' : 'default' })}>
        <LogIn /> Sign in to Google
      </a>
      <Button variant="outline" size="sm" onClick={reload}>
        <RefreshCw className={loading ? 'animate-spin' : undefined} /> Reload
      </Button>
      <a href={editUrl} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
        <ExternalLink /> Open in Google Sheets
      </a>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <div
        className={cn(
          full ? 'fixed inset-0 z-[60] flex flex-col gap-2 bg-background p-2' : 'relative',
        )}
        role={full ? 'dialog' : undefined}
        aria-label={full ? 'Pipeline Review Tracker, full screen' : undefined}
      >
        <div className={cn('relative overflow-hidden rounded-xl ring-1 ring-foreground/10', full && 'min-h-0 flex-1')}>
          {loading && (
            <div className="absolute inset-0 grid place-items-center bg-card text-sm text-muted-foreground">Loading the Google Sheet…</div>
          )}
          <iframe
            key={reloadKey}
            src={editUrl}
            title="Pipeline Review Tracker (Google Sheets)"
            onLoad={() => setLoading(false)}
            className={cn('block w-full bg-white', full ? 'h-full' : 'h-[calc(100dvh-7.5rem)] min-h-[520px]')}
            allow="clipboard-read; clipboard-write"
          />
        </div>
        {full && <div className="flex justify-end">{buttons}</div>}
      </div>

      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Pipeline Review Tracker</h1>
          <p className="text-sm text-muted-foreground">
            The team&apos;s Google Sheet, right here. Changes made here are saved in Google Sheets, and changes made in Google Sheets show here.
          </p>
          <p className="text-xs text-muted-foreground">
            If the sheet asks you to sign in, click <strong>Sign in to Google</strong>, sign in with the account the sheet is shared with, then click <strong>Reload</strong>.
          </p>
        </div>
        {!full && buttons}
      </div>
    </div>
  );
}
