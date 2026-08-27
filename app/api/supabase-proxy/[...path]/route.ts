import { NextRequest, NextResponse } from 'next/server'
import { SUPABASE_URL } from '@/lib/supabase-config'

async function handleProxy(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  const targetUrl = new URL(`${SUPABASE_URL}/${path.join('/')}${req.nextUrl.search}`)

  const headers = new Headers(req.headers)
  headers.delete('host')
  headers.delete('connection')

  const body = req.method !== 'GET' && req.method !== 'HEAD' ? await req.arrayBuffer() : undefined

  try {
    const res = await fetch(targetUrl.toString(), {
      method: req.method,
      headers,
      body,
      redirect: 'manual',
    })

    const resHeaders = new Headers(res.headers)
    resHeaders.delete('content-encoding')

    const resData = await res.arrayBuffer()
    return new NextResponse(resData, {
      status: res.status,
      statusText: res.statusText,
      headers: resHeaders,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Proxy request failed' }, { status: 502 })
  }
}

export const GET = handleProxy
export const POST = handleProxy
export const PUT = handleProxy
export const DELETE = handleProxy
export const PATCH = handleProxy
export const OPTIONS = handleProxy
