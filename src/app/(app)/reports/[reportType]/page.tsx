type PageProps = {
  params: Promise<{ reportType: string }>;
};

export default async function ReportDetailPage({ params }: PageProps) {
  const { reportType } = await params; // Next.js 15: params is a Promise

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Report</h1>
      <p className="text-muted-foreground">ID: {reportType}</p>
    </div>
  );
}
