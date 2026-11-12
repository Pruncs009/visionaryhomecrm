import { NextResponse, type NextRequest } from 'next/server';

// Inbound webhooks (lead sources, e-sign, MLS, billing). Verify signatures per provider.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  return NextResponse.json({ received: true, provider });
}
