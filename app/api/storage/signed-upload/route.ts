import { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY } from '@/lib/supabase-config'
import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'

function adminStorage() {
  const url = SUPABASE_URL!
  const key = SUPABASE_SERVICE_ROLE_KEY!
  if (!url || !key) throw new Error('Supabase service role key not configured.')
  return createClient(url, key, { auth: { persistSession: false } })
}

const requestSchema = z.object({
  loanAccountNo: z.string().min(1).max(64),
  fileName: z.string().min(1).max(256),
  mimeType: z.string().min(1).max(256),
})

export async function POST(request: NextRequest) {
  try {
    const serverClient = await createSupabaseServerClient()
    const { data: { user }, error: authError } = await serverClient.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthenticated. Please log in.' }, { status: 401 })
    }

    const body = requestSchema.safeParse(await request.json())
    if (!body.success) return NextResponse.json({ error: 'Invalid upload parameters.' }, { status: 400 })

    const supabaseAdmin = adminStorage()

    // Ensure bucket exists
    const { data: bucket } = await supabaseAdmin.storage.getBucket('loan-documents')
    if (!bucket) {
      await supabaseAdmin.storage.createBucket('loan-documents', {
        public: false,
        fileSizeLimit: 26214400,
      }).catch(err => console.warn('Bucket create warning:', err))
    }

    const fileExtension = body.data.fileName.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin'
    const safeLoan = body.data.loanAccountNo.replace(/[^a-z0-9_-]/gi, '_')
    const path = `documents/${safeLoan}/${randomUUID()}.${fileExtension}`

    const { data, error } = await supabaseAdmin.storage
      .from('loan-documents')
      .createSignedUploadUrl(path)

    if (error || !data) {
      console.error('Signed upload error:', error)
      return NextResponse.json({ error: error?.message || 'Could not prepare upload. Ensure storage bucket exists.' }, { status: 400 })
    }

    return NextResponse.json({ path, token: data.token, bucket: 'loan-documents' })
  } catch (err: any) {
    console.error('Signed upload exception:', err)
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 })
  }
}
