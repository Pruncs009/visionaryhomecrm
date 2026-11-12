import { NextResponse, type NextRequest } from 'next/server';

// Public ICS feed so agents can subscribe from Google/Outlook calendars.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  return new NextResponse(`BEGIN:VCALENDAR\nX-TOKEN:${token}\nEND:VCALENDAR`, {
    headers: { 'Content-Type': 'text/calendar' },
  });
}
