type PageProps = {
  params: Promise<{ memberId: string }>;
};

export default async function TeamMemberPage({ params }: PageProps) {
  const { memberId } = await params; // Next.js 15: params is a Promise

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Team member</h1>
      <p className="text-muted-foreground">ID: {memberId}</p>
    </div>
  );
}
