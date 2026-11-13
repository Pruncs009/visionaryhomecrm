'use client';

import { useEffect, useState } from 'react';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { Download, FileText, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { getFileDownloadUrl, getFilePreviewUrl } from '../actions';
import type { TransactionFile } from '../types';

type Kind = 'pdf' | 'image' | 'text' | 'other';

/** What the browser can show inline. Uses the extension too, since some uploads have no type. */
function previewKind(f: Pick<TransactionFile, 'fileName' | 'mimeType'>): Kind {
  const ext = f.fileName.split('.').pop()?.toLowerCase() ?? '';
  const mime = f.mimeType ?? '';
  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) return ext === 'heic' ? 'other' : 'image';
  if (mime === 'text/plain' || ext === 'txt') return 'text';
  return 'other';
}

const BLOB_TYPE: Record<Exclude<Kind, 'other'>, string> = { pdf: 'application/pdf', image: '', text: 'text/plain; charset=utf-8' };

/**
 * Opens a document in a large window on top of the deal page (the page stays
 * where it is). PDFs, images and text show inline; Word / Excel offer a download.
 */
export function FilePreview({ file, onClose }: { file: TransactionFile | null; onClose: () => void }) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const kind = file ? previewKind(file) : 'other';

  useEffect(() => {
    if (!file || kind === 'other') return;
    let cancelled = false;
    let objectUrl: string | null = null;
    setSrc(null);
    setError(null);
    (async () => {
      const r = await getFilePreviewUrl(file.id);
      if (!r.ok) return !cancelled && setError(r.error);
      try {
        // Load it as a local copy so it always displays inline (never triggers a download).
        const res = await fetch(r.url);
        if (!res.ok) throw new Error(String(res.status));
        const raw = await res.blob();
        const type = BLOB_TYPE[kind as Exclude<Kind, 'other'>] || raw.type;
        objectUrl = URL.createObjectURL(type ? new Blob([raw], { type }) : raw);
        if (!cancelled) setSrc(objectUrl);
      } catch {
        if (!cancelled) setError('Could not load a preview of this file.');
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file, kind]);

  const download = async () => {
    if (!file) return;
    const r = await getFileDownloadUrl(file.id);
    if (r.ok) window.location.assign(r.url); // download only; the page stays open
    else toast.error(r.error);
  };

  return (
    <DialogPrimitive.Root open={!!file} onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/40 supports-backdrop-filter:backdrop-blur-xs" />
        <DialogPrimitive.Popup className="fixed inset-3 z-50 flex flex-col overflow-hidden rounded-xl bg-popover text-popover-foreground ring-1 ring-foreground/10 outline-none sm:inset-6">
          {file && (
            <>
              <div className="flex items-center gap-3 border-b px-4 py-2.5">
                <DialogPrimitive.Title className="min-w-0 flex-1 truncate text-sm font-semibold">{file.fileName}</DialogPrimitive.Title>
                <Button variant="outline" size="sm" onClick={download}><Download /> Download</Button>
                <DialogPrimitive.Close aria-label="Close preview" className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                  <X className="size-4" />
                </DialogPrimitive.Close>
              </div>
              <div className="relative flex min-h-0 flex-1 items-center justify-center bg-muted/40">
                {kind === 'other' ? (
                  <div className="flex max-w-sm flex-col items-center gap-3 p-6 text-center text-sm">
                    <FileText className="size-10 text-muted-foreground" aria-hidden />
                    <p>This file type can&apos;t be previewed in the browser.</p>
                    <Button onClick={download}><Download /> Download to open it</Button>
                  </div>
                ) : error ? (
                  <p className="p-6 text-sm text-destructive">{error}</p>
                ) : !src ? (
                  <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Loading preview" />
                ) : kind === 'image' ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a local preview copy, not an optimisable asset
                  <img src={src} alt={file.fileName} className="max-h-full max-w-full object-contain p-4" />
                ) : (
                  <iframe src={src} title={file.fileName} className="size-full border-0 bg-white" />
                )}
              </div>
            </>
          )}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
