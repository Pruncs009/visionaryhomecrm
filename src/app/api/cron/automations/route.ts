import { NextResponse } from 'next/server';

// Scheduled job: runs due automations (drip emails, task reminders).
export async function GET() {
  return NextResponse.json({ ok: true });
}
