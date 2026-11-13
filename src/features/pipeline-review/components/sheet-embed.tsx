'use client';

import { useState } from 'react';
import { ExternalLink, LogIn, RefreshCw } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';

/**
 * The team's Google Sheet, shown inside the CRM. It is the real sheet (not a
 * copy), so edits made here are in Google Sheets and vice versa. Google needs
 * the viewer to be signed in to a Google account the sheet is shared with.
 */
export function SheetEmbed({ sheetId, gid }: { sheetId: string; gid: string }) {
  const [reloadKey, setReloadKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const editUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/edit?gid=${gid}#gid=${gid}`;
  // Google's sign-in can't run inside another site, so it opens in a new tab and comes back to the sheet.
  const signInUrl = `https://accounts.google.com/AccountChooser?continue=${encodeURIComponent(editUrl)}`;

  const reload = () => {
    setLoading(true);
    setReloadKey((k) => k + 1);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-xs text-muted-foreground">
          If the sheet asks you to sign in, click <strong>Sign in to Google</strong>, sign in with the account the sheet is shared with, then click <strong>Reload</strong>.
        </p>
        <a href={signInUrl} target="_blank" rel="noopener noreferrer" className={buttonVariants({ size: 'sm' })}>
          <LogIn /> Sign in to Google
        </a>
        <Button variant="outline" size="sm" onClick={reload}>
          <RefreshCw className={loading ? 'animate-spin' : undefined} /> Reload
        </Button>
        <a href={editUrl} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          <ExternalLink /> Open in Google Sheets
        </a>
      </div>
      <div className="relative overflow-hidden rounded-xl ring-1 ring-foreground/10">
        {loading && (
          <div className="absolute inset-0 grid place-items-center bg-card text-sm text-muted-foreground">Loading the Google Sheet…</div>
        )}
        <iframe
          key={reloadKey}
          src={editUrl}
          title="Pipeline Review Tracker (Google Sheets)"
          onLoad={() => setLoading(false)}
          className="block h-[calc(100dvh-13rem)] min-h-[520px] w-full bg-white"
          allow="clipboard-read; clipboard-write"
        />
      </div>
    </div>
  );
}
