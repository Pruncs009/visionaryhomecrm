'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { Download, Eye, FileText, Image as ImageIcon, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import type { FileCategory } from '@/types/database.types';
import { deleteTransactionFile, getFileDownloadUrl, recordTransactionUpload } from '../actions';
import {
  ALLOWED_UPLOAD_TYPES, MAX_UPLOAD_BYTES, STORAGE_BUCKET, transactionFilePath,
} from '../constants';
import type { TransactionFile } from '../types';
import { FilePreview } from './file-preview';
import { formatBytes } from './tx-bits';

/**
 * Documents for a deal. Upload flow:
 *   1. browser → Supabase Storage directly (private bucket; RLS checks the org folder)
 *   2. server action records the file row (re-validates the path; removes the object if that fails)
 * Downloads use 60-second signed URLs.
 */
export function DocumentsPanel({
  orgId,
  transactionId,
  files,
  timezone,
  canDelete,
}: {
  orgId: string;
  transactionId: string;
  files: TransactionFile[];
  timezone: string;
  canDelete: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  // No type picker on the Docs tab: uploads are stored as "other".
  const category: FileCategory = 'other';
  const [uploading, setUploading] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [, start] = useTransition();
  const [previewing, setPreviewing] = useState<TransactionFile | null>(null);
  const when = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: timezone });

  async function upload(list: FileList | null) {
    if (!list?.length) return;
    const supabase = createClient();
    let ok = 0;
    for (const file of Array.from(list)) {
      if (file.size > MAX_UPLOAD_BYTES) { toast.error(`${file.name} is over 25 MB`); continue; }
      if (file.type && !ALLOWED_UPLOAD_TYPES.includes(file.type)) { toast.error(`${file.name}: PDF, images, Word, Excel or text only`); continue; }
      setUploading(file.name);
      const path = transactionFilePath(orgId, transactionId, file.name);
      const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
      if (error) { toast.error(`Upload failed: ${file.name}`); continue; }
      const r = await recordTransactionUpload({ transactionId, path, fileName: file.name, size: file.size, mimeType: file.type, category });
      if (!r.ok) { toast.error(r.error); continue; }
      ok++;
    }
    setUploading(null);
    if (inputRef.current) inputRef.current.value = '';
    if (ok) {
      toast.success(ok === 1 ? 'Document uploaded' : `${ok} documents uploaded`);
      router.refresh();
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle>Documents</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <label
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); void upload(e.dataTransfer.files); }}
          className={cn('flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 border-dashed p-6 text-center text-sm hover:bg-muted/40', dragOver && 'border-primary bg-primary/5')}
        >
          <Upload className="size-6 text-muted-foreground" aria-hidden />
          {uploading ? <span>Uploading {uploading}…</span> : <span><strong>Drop files</strong> or click to upload</span>}
          <span className="text-xs text-muted-foreground">PDF, images, Word, Excel · up to 25 MB each</span>
          <input ref={inputRef} type="file" multiple className="sr-only" disabled={!!uploading}
            accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.doc,.docx,.xls,.xlsx,.txt"
            onChange={(e) => void upload(e.target.files)} />
        </label>

        {files.length === 0 ? (
          <p className="text-sm text-muted-foreground">No documents yet.</p>
        ) : (
          <ul className="divide-y">
            {files.map((f) => {
              const Icon = f.mimeType?.startsWith('image/') ? ImageIcon : FileText;
              return (
                <li key={f.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                  <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0 flex-1">
                    {/* Click the name to view it in a window over the page */}
                    <button
                      type="button"
                      onClick={() => setPreviewing(f)}
                      title={`View ${f.fileName}`}
                      className="block max-w-full truncate text-left text-sm font-medium text-primary hover:underline"
                    >
                      {f.fileName}
                    </button>
                    <p className="text-xs text-muted-foreground">
                      {formatBytes(f.sizeBytes)} · {when.format(new Date(f.createdAt))}{f.uploaderName && ` · ${f.uploaderName}`}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon-sm" aria-label={`View ${f.fileName}`} title="View" onClick={() => setPreviewing(f)}>
                    <Eye />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label={`Download ${f.fileName}`}
                    onClick={() => start(async () => {
                      const r = await getFileDownloadUrl(f.id);
                      if (r.ok) window.location.assign(r.url);
                      else toast.error(r.error);
                    })}>
                    <Download />
                  </Button>
                  {canDelete && (
                    <Button variant="ghost" size="icon-sm" aria-label={`Delete ${f.fileName}`}
                      onClick={() => {
                        if (!confirm(`Delete ${f.fileName}? This can't be undone.`)) return;
                        start(async () => {
                          const r = await deleteTransactionFile(transactionId, f.id);
                          if (r.ok) toast.success('Document deleted');
                          else toast.error(r.error);
                        });
                      }}>
                      <Trash2 />
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <FilePreview file={previewing} onClose={() => setPreviewing(null)} />
      </CardContent>
    </Card>
  );
}
