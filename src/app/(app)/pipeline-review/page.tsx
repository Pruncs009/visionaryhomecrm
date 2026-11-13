import type { Metadata } from 'next';
import { FileSpreadsheet } from 'lucide-react';
import { requireContext } from '@/features/auth/guards';
import { PipelineTable } from '@/features/pipeline-review/components/pipeline-table';
import { readPipelineSheet, sheetsConfig, SheetsError, type PipelineSheet } from '@/lib/google/sheets';

export const metadata: Metadata = { title: 'Pipeline Review Tracker' };
export const dynamic = 'force-dynamic';

/**
 * Pipeline Review Tracker: the pipeline tab of the team's Google Sheet, live.
 * Edits here are written to the sheet; edits in the sheet show here (auto-refresh).
 */
export default async function PipelineReviewPage() {
  await requireContext();
  const cfg = sheetsConfig();

  let sheet: PipelineSheet | null = null;
  let error: string | null = null;
  if (cfg) {
    try {
      sheet = await readPipelineSheet(cfg);
    } catch (e) {
      console.error('[pipeline-review] read failed', e);
      error = e instanceof SheetsError ? e.message : 'Could not load the Google Sheet.';
    }
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pipeline Review Tracker</h1>
        <p className="text-sm text-muted-foreground">
          Live from Google Sheets. Changes here are saved to the sheet, and changes in the sheet show up here.
        </p>
      </div>

      {!cfg ? (
        <Notice title="Google Sheet not connected yet">
          The CRM needs a Google service account to read and write the sheet. Add <code>GOOGLE_SERVICE_ACCOUNT_EMAIL</code>,{' '}
          <code>GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY</code>, <code>PIPELINE_SHEET_ID</code> and <code>PIPELINE_SHEET_GID</code> in Vercel,
          then share the sheet with the service account email as an Editor.
        </Notice>
      ) : error ? (
        <Notice title="Couldn't load the Google Sheet">{error}</Notice>
      ) : sheet ? (
        <PipelineTable sheet={sheet} />
      ) : null}
    </div>
  );
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-14 text-center">
      <FileSpreadsheet className="size-8 text-muted-foreground" aria-hidden />
      <p className="font-medium">{title}</p>
      <p className="max-w-xl text-sm text-muted-foreground">{children}</p>
    </div>
  );
}
