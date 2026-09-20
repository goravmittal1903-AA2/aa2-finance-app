import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from '@/lib/supabase-config'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { requireAuthenticatedUser, canAccessBranch } from '@/lib/authz'

function adminStorage() {
  const url = SUPABASE_URL!
  const key = SUPABASE_SERVICE_ROLE_KEY!
  if (!url || !key) throw new Error('Supabase service role key not configured.')
  return createClient(url, key, { auth: { persistSession: false } })
}

const pathSchema = z.string().min(1).max(512)

export async function GET(request: NextRequest) {
  const auth = await requireAuthenticatedUser()
  if ('error' in auth) return auth.error
  const { profile } = auth

  const pathParam = request.nextUrl.searchParams.get('path') || ''
  const pathParsed = pathSchema.safeParse(pathParam)
  if (!pathParsed.success) return NextResponse.json({ error: 'Invalid document path.' }, { status: 400 })

  // Handle local: prefixed paths (bucket not configured fallback)
  if (pathParsed.data.startsWith('local:')) {
    return NextResponse.json({ url: null, warning: 'Storage not configured — cannot generate view URL.' })
  }

  // Branch Isolation check for employees:
  // Document paths follow pattern: documents/{loan_account_no}/{file_uuid}.ext
  if (profile.role === 'employee' && profile.branch_code && profile.branch_code !== 'ALL') {
    const segments = pathParsed.data.split('/')
    if (segments.length >= 2) {
      const loanNo = segments[1]
      const supabaseAdmin = adminStorage()
      const { data: loan } = await supabaseAdmin.from('loans').select('data').eq('id', loanNo).maybeSingle()
      if (loan && loan.data?.branch_code && !canAccessBranch(profile, loan.data.branch_code)) {
        return NextResponse.json({ error: 'Access denied: Document belongs to a different branch.' }, { status: 403 })
      }
    }
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
  const auth = await requireAuthenticatedUser()
  if ('error' in auth) return auth.error
  const { profile } = auth

  // Only Admin and IT can delete loan documents
  if (profile.role !== 'it' && profile.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden. Only IT or Admin users can delete documents.' }, { status: 403 })
  }

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
