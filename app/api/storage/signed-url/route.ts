import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'

function adminStorage() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  if (!url || !key) throw new Error('Supabase service role key not configured.')
  return createClient(url, key, { auth: { persistSession: false } })
}

const pathSchema = z.string().min(1).max(512)

async function requireAuth(request: NextRequest) {
  try {
    const serverClient = await createSupabaseServerClient()
    const { data: { user }, error } = await serverClient.auth.getUser()
    if (error || !user) return null
    return user
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  const user = await requireAuth(request)
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  const pathParam = request.nextUrl.searchParams.get('path') || ''
  const pathParsed = pathSchema.safeParse(pathParam)
  if (!pathParsed.success) return NextResponse.json({ error: 'Invalid document path.' }, { status: 400 })

  // Handle local: prefixed paths (bucket not configured fallback)
  if (pathParsed.data.startsWith('local:')) {
    return NextResponse.json({ url: null, warning: 'Storage not configured — cannot generate view URL.' })
  }

  try {
    const supabaseAdmin = adminStorage()
    const { data, error } = await supabaseAdmin.storage
      .from('loan-documents')
      .createSignedUrl(pathParsed.data, 3600)

    if (error || !data) {
      console.warn('Signed URL error:', error?.message)
      return NextResponse.json({ url: null, error: error?.message || 'File not found in storage.' })
    }

    return NextResponse.json({ url: data.signedUrl })
  } catch (err: any) {
    console.error('Signed URL exception:', err)
    return NextResponse.json({ url: null, error: err.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const user = await requireAuth(request)
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  const pathParam = request.nextUrl.searchParams.get('path') || ''
  const pathParsed = pathSchema.safeParse(pathParam)
  if (!pathParsed.success) return NextResponse.json({ error: 'Invalid document path.' }, { status: 400 })

  if (pathParsed.data.startsWith('local:')) {
    return NextResponse.json({ ok: true, warning: 'Storage not configured — metadata only deletion.' })
  }

  try {
    const supabaseAdmin = adminStorage()
    const { error } = await supabaseAdmin.storage.from('loan-documents').remove([pathParsed.data])
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
