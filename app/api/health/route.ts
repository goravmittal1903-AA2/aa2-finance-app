import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({ status: 'ok', service: 'aa2-finance', timestamp: new Date().toISOString() })
}
