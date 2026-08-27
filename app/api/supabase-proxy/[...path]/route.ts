import { NextRequest, NextResponse } from 'next/server'
import { SUPABASE_URL } from '@/lib/supabase-config'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': '*',
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  })
}

async function handleProxy(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  const targetUrl = new URL(`${SUPABASE_URL}/${path.join('/')}${req.nextUrl.search}`)

  const headers = new Headers()
  // Forward essential Supabase/PostgREST headers
  const forwardHeaders = ['authorization', 'apikey', 'content-type', 'accept', 'prefer', 'range', 'x-client-info']
  for (const h of forwardHeaders) {
    const val = req.headers.get(h)
    if (val) headers.set(h, val)
  }

  const body = req.method !== 'GET' && req.method !== 'HEAD' ? await req.arrayBuffer() : undefined

  try {
    const res = await fetch(targetUrl.toString(), {
      method: req.method,
      headers,
      body,
      redirect: 'manual',
    })

    const resHeaders = new Headers()
    res.headers.forEach((v, k) => {
      const lower = k.toLowerCase()
      if (lower !== 'content-encoding' && lower !== 'content-length' && lower !== 'transfer-encoding') {
        resHeaders.set(k, v)
      }
    })

    // Apply CORS headers
    Object.entries(CORS_HEADERS).forEach(([k, v]) => resHeaders.set(k, v))

    const resData = await res.arrayBuffer()
    return new NextResponse(resData, {
      status: res.status,
      statusText: res.statusText,
      headers: resHeaders,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Proxy request failed' }, { status: 502, headers: CORS_HEADERS })
  }
}

export const GET = handleProxy
export const POST = handleProxy
export const PUT = handleProxy
export const DELETE = handleProxy
export const PATCH = handleProxy
