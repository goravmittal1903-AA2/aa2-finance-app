import { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY } from '@/lib/supabase-config'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'

// Service-role client — bypasses RLS, used only for authenticated write operations
let _adminClient: any = null
function adminClient() {
  if (!_adminClient) {
    const url = SUPABASE_URL!
    const key = SUPABASE_SERVICE_ROLE_KEY!
    if (!url || !key) throw new Error('Supabase service role key not configured.')
    _adminClient = createClient(url, key, { auth: { persistSession: false } })
  }
  return _adminClient
}

const ALLOWED_TABLES = new Set([
  'customers', 'loans', 'repayment_schedule', 'transactions',
  'documents', 'grievances', 'investors', 'investor_txns',
  'loan_documents', 'products', 'audit_events', 'trash', 'audit_log', 'audit_logs',
  'borrowings', 'borrowing_txns', 'cash_accounts', 'cash_txns', 'expenses', 'fixed_assets'
])

function tbl(store: string) {
  return store === 'schedule' ? 'repayment_schedule' : store
}

// ─── GET: read all or filtered ─────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const auth = await createSupabaseServerClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = request.nextUrl
    const store = searchParams.get('store') || ''
    const field = searchParams.get('field') || ''
    const value = searchParams.get('value') || ''
    const table = tbl(store)

    if (!ALLOWED_TABLES.has(table)) {
      return NextResponse.json({ error: 'Invalid table' }, { status: 400 })
    }

    const supabase = adminClient()
    let allData: any[] = []
    let from = 0
    const STEP = 1000

    while (true) {
      let query = supabase.from(table).select('data').range(from, from + STEP - 1)
      if (field && value) {
        query = query.eq(`data->>${field}`, value) as any
      }
      const { data, error } = await query
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      if (!data || data.length === 0) break
      allData = allData.concat(data)
      if (data.length < STEP) break
      from += STEP
    }

    return NextResponse.json({ records: (allData || []).map((r: any) => r.data) })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 })
  }
}

// ─── POST: upsert one or many records ─────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const auth = await createSupabaseServerClient()
    const [{ data: { user } }, body] = await Promise.all([
      auth.auth.getUser(),
      request.json()
    ])
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { store, record, records, idField } = body

    if (!store || !idField) {
      return NextResponse.json({ error: 'store and idField are required' }, { status: 400 })
    }

    const table = tbl(store)
    if (!ALLOWED_TABLES.has(table)) {
      return NextResponse.json({ error: 'Invalid table' }, { status: 400 })
    }

    const supabase = adminClient()

    if (records && Array.isArray(records)) {
      // Bulk upsert
      const payloads = records.map((r: any) => ({ id: String(r[idField]), data: r }))
      const { error } = await supabase.from(table).upsert(payloads)
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    } else if (record) {
      // Single upsert
      const { error } = await supabase.from(table).upsert({ id: String(record[idField]), data: record })
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    } else {
      return NextResponse.json({ error: 'record or records is required' }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 })
  }
}

// ─── DELETE: remove one record ─────────────────────────────────────────────
export async function DELETE(request: NextRequest) {
  try {
    const auth = await createSupabaseServerClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = request.nextUrl
    const store = searchParams.get('store') || ''
    const id = searchParams.get('id') || ''
    const table = tbl(store)

    if (!ALLOWED_TABLES.has(table) || !id) {
      return NextResponse.json({ error: 'Invalid table or id' }, { status: 400 })
    }

    const supabase = adminClient()
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 })
  }
}
