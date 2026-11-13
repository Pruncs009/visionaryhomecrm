import type { Metadata } from 'next';
import { requireContext } from '@/features/auth/guards';
import { SheetEmbed } from '@/features/pipeline-review/components/sheet-embed';

export const metadata: Metadata = { title: 'Pipeline Review Tracker' };

/** The team's pipeline sheet and tab (from its URL: /d/<id>/edit#gid=<tab>). */
const SHEET_ID = '1Ir9byoCBzeXCG0CgRLoUgZgCA2P9Yhp8jfplNPQ9Uzw';
const SHEET_GID = '1161341563';

export default async function PipelineReviewPage() {
  await requireContext();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pipeline Review Tracker</h1>
        <p className="text-sm text-muted-foreground">
          The team&apos;s Google Sheet, right here. Changes made here are saved in Google Sheets, and changes made in Google Sheets show here.
        </p>
      </div>
      <SheetEmbed sheetId={SHEET_ID} gid={SHEET_GID} />
    </div>
  );
}
