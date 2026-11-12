type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditSellerPage({ params }: PageProps) {
  const { id } = await params; // Next.js 15: params is a Promise

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Edit Seller</h1>
      <p className="text-muted-foreground">ID: {id}</p>
    </div>
  );
}
