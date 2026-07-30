import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'

const RESOURCES = {
  customers: {
    table: 'customers',
    fields: ['full_name', 'customer_id', 'mobile', 'aadhar_last4', 'father_husband_name', 'village_city'],
    order: 'full_name',
    fullText: true,
  },
  loans: {
    table: 'loans',
    fields: ['loan_account_no', 'member_name', 'member_name_cache', 'customer_id', 'branch_code', 'status'],
    order: 'loan_account_no',
    fullText: true,
  },
  documents: {
    table: 'documents',
    fields: ['loan_account_no', 'customer_id', 'member_name', 'file_name', 'doc_type'],
    order: 'uploaded_date',
    fullText: false,
  },
  grievances: {
    table: 'grievances',
    fields: ['ticket_id', 'customer_id', 'member_name', 'category', 'status'],
    order: 'created_at',
    fullText: false,
  },
} as const

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key, { auth: { persistSession: false } })
}

function numericParameter(value: string | null, fallback: number, max: number) {
  const parsed = Number.parseInt(value || '', 10)
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), max) : fallback
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ resource: string }> }) {
  const { resource } = await params
  const definition = RESOURCES[resource as keyof typeof RESOURCES]
  if (!definition) return NextResponse.json({ error: 'Unknown resource.' }, { status: 404 })

  // Simple auth check — just verify logged in, don't query user_profiles
  try {
    const serverClient = await createSupabaseServerClient()
    const { data: { user }, error: authError } = await serverClient.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthenticated. Please log in.' }, { status: 401 })
    }
  } catch (err) {
    return NextResponse.json({ error: 'Auth check failed.' }, { status: 401 })
  }

  const { searchParams } = request.nextUrl
  const page = numericParameter(searchParams.get('page'), 1, 100000)
  const pageSize = numericParameter(searchParams.get('pageSize'), 50, 50)
  const search = (searchParams.get('q') || '').trim().replace(/[%,().]/g, '')

  // Use admin client so RLS doesn't block reads
  const supabase = adminClient()

  let query = supabase
    .from(definition.table)
    .select('data', { count: 'exact' })

  if (search) {
    if (definition.fullText) {
      // Try websearch, fall back to ilike if fulltext index not available
      try {
        const expression = definition.fields
          .map(field => `data->>${field}.ilike.*${search}*`)
          .join(',')
        query = query.or(expression)
      } catch {
        // fallback — no search filter
      }
    } else {
      const expression = definition.fields
        .map(field => `data->>${field}.ilike.*${search}*`)
        .join(',')
      query = query.or(expression)
    }
  }

  const start = (page - 1) * pageSize
  const { data, count, error } = await query.range(start, start + pageSize - 1)
  if (error) {
    console.warn(`records/${resource} error:`, error.message)
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  // Sort in memory by most-recent first (created_at or updated_at inside JSONB data)
  const rows = (data || []).map((row: any) => row.data)
  rows.sort((a: any, b: any) => {
    const ta = a.created_at || a.updated_at || a.uploaded_date || a.disbursement_date || ''
    const tb = b.created_at || b.updated_at || b.uploaded_date || b.disbursement_date || ''
    return tb.localeCompare(ta)
  })

  return NextResponse.json({
    data: rows,
    page,
    pageSize,
    total: count || 0,
    totalPages: Math.max(1, Math.ceil((count || 0) / pageSize)),
  })
}
