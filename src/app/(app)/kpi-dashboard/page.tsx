import type { Metadata } from 'next';
import Link from 'next/link';
import { BarChart3 } from 'lucide-react';
import { requireArea } from '@/features/auth/guards';
import { KPI_SHEET } from '@/features/kpi/sheet-config';
import { SheetEmbed } from '@/features/pipeline-review/components/sheet-embed';

export const metadata: Metadata = { title: 'KPI Dashboard' };

export default async function KpiDashboardPage() {
  await requireArea('kpi');
  return (
    <SheetEmbed
      sheetId={KPI_SHEET.id}
      gid={KPI_SHEET.gid}
      title="KPI Dashboard"
      description="The team's KPI Google Sheet, right here. Changes made here are saved in Google Sheets, and changes made in Google Sheets show here."
      extra={
        <Link href="/reports/kpi" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
          <BarChart3 className="size-4" aria-hidden /> See the KPI report
        </Link>
      }
    />
  );
}
