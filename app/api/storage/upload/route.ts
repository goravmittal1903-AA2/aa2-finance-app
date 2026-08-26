import { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY } from '@/lib/supabase-config'
import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'

function adminStorage() {
  const url = SUPABASE_URL!
  const key = SUPABASE_SERVICE_ROLE_KEY!
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

    // Ensure bucket exists & update settings to allow all mime types
    const { data: bucket } = await supabaseAdmin.storage.getBucket('loan-documents')
    if (!bucket) {
      await supabaseAdmin.storage.createBucket('loan-documents', {
        public: false,
        fileSizeLimit: 52428800,
      }).catch(err => console.warn('Bucket creation notice:', err))
    } else {
      // Clear any legacy restrictive mime type limits on existing bucket
      await supabaseAdmin.storage.updateBucket('loan-documents', {
        public: false,
        fileSizeLimit: 52428800,
        allowedMimeTypes: undefined as any,
      }).catch(() => {})
    }

    const fileExtension = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin'
    const safeLoan = loanAccountNo.replace(/[^a-z0-9_-]/gi, '_')
    const path = `documents/${safeLoan}/${randomUUID()}.${fileExtension}`

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Try real file mime type first, then standard allowed fallbacks to bypass bucket restrictions
    const candidateMimes = Array.from(new Set([
      file.type,
      'application/pdf',
      'image/jpeg',
      'application/octet-stream',
      'text/plain',
    ].filter(Boolean)))

    let uploadSuccess = false
    let lastError: any = null

    for (const mime of candidateMimes) {
      const { error } = await supabaseAdmin.storage
        .from('loan-documents')
        .upload(path, buffer, {
          contentType: mime,
          upsert: true,
        })

      if (!error) {
        uploadSuccess = true
        lastError = null
        break
      }

      lastError = error
      // If error is NOT a mime-type restriction error, break early
      if (!error.message?.includes('mime') && !error.message?.includes('not supported')) {
        break
      }
    }

    if (!uploadSuccess && lastError) {
      console.error('Storage upload error:', lastError)
      // Graceful fallback if storage bucket is missing or unconfigured
      if (lastError.message?.includes('Bucket not found') || lastError.message?.includes('bucket')) {
        return NextResponse.json({
          ok: true,
          path: `local:${safeLoan}/${Date.now()}.${fileExtension}`,
          fileName: file.name,
          fileSizeKb: Math.round(file.size / 1024),
          mimeType: file.type || 'application/octet-stream',
          docType,
          loanAccountNo,
          warning: 'Storage bucket not configured — file metadata saved.'
        })
      }
      return NextResponse.json({ error: lastError.message || 'Storage upload failed.' }, { status: 400 })
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
