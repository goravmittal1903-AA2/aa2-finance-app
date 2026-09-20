import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from '@/lib/supabase-config'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuthenticatedUser, canAccessBranch } from '@/lib/authz'

// Service-role client — used with server-side authorization checks
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

// Tables restricted strictly to IT and Admin roles
const ADMIN_ONLY_TABLES = new Set([
  'investors', 'investor_txns', 'borrowings', 'borrowing_txns', 'fixed_assets', 'audit_log', 'audit_logs'
])

function tbl(store: string) {
  return store === 'schedule' ? 'repayment_schedule' : store
}

// ─── GET: read all or filtered ─────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser()
    if ('error' in auth) return auth.error
    const { profile } = auth

    const { searchParams } = request.nextUrl
    const store = searchParams.get('store') || ''
    const field = searchParams.get('field') || ''
    const value = searchParams.get('value') || ''
    const table = tbl(store)

    if (!ALLOWED_TABLES.has(table)) {
      return NextResponse.json({ error: 'Invalid table' }, { status: 400 })
    }

    if (ADMIN_ONLY_TABLES.has(table) && profile.role !== 'it' && profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden. Admin access required for this resource.' }, { status: 403 })
    }

    const supabase = adminClient()

    let allData: any[] = []
    let from = 0
    const STEP = 1000

    while (true) {
      let query = supabase.from(table).select('data').range(from, from + STEP - 1)
      if (field && value) {
        if (field === 'id') {
          query = query.or(`id.eq.${value}`) as any
        } else {
          query = query.eq(`data->>${field}`, value) as any
        }
      }
      let { data, error } = await query
      if (error && field !== 'id') {
        const fallback = await supabase.from(table).select('data').eq('id', value).range(from, from + STEP - 1)
        if (!fallback.error) {
          data = fallback.data
          error = null
        }
      }
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      if (!data || data.length === 0) {
        if (field === 'id' && from === 0) {
          const alt = await supabase.from(table).select('data')
            .or(`data->>loan_account_no.eq.${value},data->>customer_id.eq.${value},data->>id.eq.${value}`)
            .range(from, from + STEP - 1)
          if (!alt.error && alt.data && alt.data.length > 0) {
            data = alt.data
          }
        }
      }
      if (!data || data.length === 0) break
      allData = allData.concat(data)
      if (data.length < STEP) break
      from += STEP
    }

    let records = (allData || []).map((r: any) => r.data)

    // Branch filtering for employees on loans
    if (profile.role === 'employee' && profile.branch_code && profile.branch_code !== 'ALL') {
      if (table === 'loans') {
        records = records.filter((r: any) => canAccessBranch(profile, r.branch_code || r.branch_name))
      }
    }

    return NextResponse.json({ records })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 })
  }
}

// ─── POST: upsert one or many records ─────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser()
    if ('error' in auth) return auth.error
    const { profile } = auth

    const body = await request.json()
    const { store, record, records, idField } = body

    if (!store || !idField) {
      return NextResponse.json({ error: 'store and idField are required' }, { status: 400 })
    }

    const table = tbl(store)
    if (!ALLOWED_TABLES.has(table)) {
      return NextResponse.json({ error: 'Invalid table' }, { status: 400 })
    }

    if (ADMIN_ONLY_TABLES.has(table) && profile.role !== 'it' && profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden. Admin access required to modify this resource.' }, { status: 403 })
    }

    const supabase = adminClient()

    if (records && Array.isArray(records)) {
      const payloads = records.map((r: any) => ({ id: String(r[idField]), data: r }))
      const { error } = await supabase.from(table).upsert(payloads)
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    } else if (record) {
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
    const auth = await requireAuthenticatedUser()
    if ('error' in auth) return auth.error
    const { profile } = auth

    // Only Admin or IT can delete records
    if (profile.role !== 'it' && profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden. Only IT and Admin roles can delete records.' }, { status: 403 })
    }

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

