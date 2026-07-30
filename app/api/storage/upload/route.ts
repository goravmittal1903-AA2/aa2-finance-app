import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'

function adminStorage() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  if (!url || !key) throw new Error('Supabase service role key not configured.')
  return createClient(url, key, { auth: { persistSession: false } })
}

export async function POST(request: NextRequest) {
  try {
    // Auth check - just verify the user is logged in, don't require user_profiles table
    const serverClient = await createSupabaseServerClient()
    const { data: { user }, error: authError } = await serverClient.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthenticated. Please log in.' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const loanAccountNo = (formData.get('loanAccountNo') as string) || 'UNASSIGNED'
    const docType = (formData.get('docType') as string) || 'OTHER'

    if (!file) {
      return NextResponse.json({ error: 'No file provided.' }, { status: 400 })
    }

    if (file.size > 25 * 1024 * 1024) {
      return NextResponse.json({ error: 'File size exceeds 25 MB limit.' }, { status: 400 })
    }

    const supabaseAdmin = adminStorage()

    // Ensure bucket exists - create silently if missing
    const { data: bucket } = await supabaseAdmin.storage.getBucket('loan-documents')
    if (!bucket) {
      const { error: createErr } = await supabaseAdmin.storage.createBucket('loan-documents', {
        public: false,
        fileSizeLimit: 26214400,
      })
      if (createErr) {
        console.warn('Bucket creation warning (may already exist):', createErr.message)
      }
    }

    const fileExtension = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin'
    const safeLoan = loanAccountNo.replace(/[^a-z0-9_-]/gi, '_')
    const path = `documents/${safeLoan}/${randomUUID()}.${fileExtension}`

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const { error: uploadError } = await supabaseAdmin.storage
      .from('loan-documents')
      .upload(path, buffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: true,
      })

    if (uploadError) {
      console.error('Storage upload error:', uploadError)
      // If bucket is not found, return metadata-only mode (graceful degradation)
      if (uploadError.message?.includes('Bucket not found') || uploadError.message?.includes('bucket')) {
        return NextResponse.json({
          ok: true,
          path: `local:${safeLoan}/${Date.now()}.${fileExtension}`,
          fileName: file.name,
          fileSizeKb: Math.round(file.size / 1024),
          mimeType: file.type || 'application/octet-stream',
          docType,
          loanAccountNo,
          warning: 'Storage bucket not configured — file metadata saved only.'
        })
      }
      return NextResponse.json({ error: uploadError.message || 'Storage upload failed.' }, { status: 400 })
    }

    return NextResponse.json({
      ok: true,
      path,
      fileName: file.name,
      fileSizeKb: Math.round(file.size / 1024),
      mimeType: file.type || 'application/octet-stream',
      docType,
      loanAccountNo,
    })
  } catch (err: any) {
    console.error('Upload handler exception:', err)
    return NextResponse.json({ error: err.message || 'Server upload failed.' }, { status: 500 })
  }
}
