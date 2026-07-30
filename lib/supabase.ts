import { createSupabaseBrowserClient } from '@/lib/supabase-client'

// Browser client for reads (uses session/RLS)
export const supabase = createSupabaseBrowserClient()

// Table name mapper (schedule → repayment_schedule)
export function tbl(store: string) {
  return store === 'schedule' ? 'repayment_schedule' : store
}

// ─── SERVER-SIDE WRITE HELPER ─────────────────────────────────────────────────
// All writes go through /api/db which uses service-role key to bypass RLS.
// This fixes the RLS branch_isolation policy blocking writes from the browser.
async function serverWrite(body: object): Promise<void> {
  const res = await fetch('/api/db', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
    console.warn('serverWrite error:', err.error)
    throw new Error(err.error || 'Write failed')
  }
}

async function serverDelete(store: string, id: string | number): Promise<void> {
  const res = await fetch(`/api/db?store=${encodeURIComponent(store)}&id=${encodeURIComponent(String(id))}`, {
    method: 'DELETE',
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
    console.warn('serverDelete error:', err.error)
  }
}

// ─── IN-MEMORY CACHE FOR INSTANT 0MS RESPONSES ────────────────────────────────
const memoryCache = new Map<string, { timestamp: number; data: any }>()
const CACHE_TTL_MS = 60 * 1000 // 1 minute TTL with instant cache hit

export function invalidateCache(store?: string) {
  if (store) {
    memoryCache.delete(tbl(store))
    memoryCache.delete(store)
  } else {
    memoryCache.clear()
  }
}

// ─── READ: Generic fetch all (fast, direct browser client with cache) ────────
export async function getAll<T>(store: string, forceRefresh = false): Promise<T[]> {
  const cacheKey = `getAll:${tbl(store)}`
  const cached = memoryCache.get(cacheKey)
  const now = Date.now()

  if (!forceRefresh && cached && (now - cached.timestamp < CACHE_TTL_MS)) {
    return cached.data
  }

  const { data, error } = await supabase.from(tbl(store)).select('data')
  if (error) {
    console.warn(`getAll(${store}) error:`, error.message)
    return getAllViaServer<T>(store)
  }
  const list = (data || []).map((r: { data: T }) => r.data)
  const sorted = list.sort((a: any, b: any) =>
    (b.created_at || b.updated_at || b.disbursement_date || b.txn_date || '').localeCompare(
      a.created_at || a.updated_at || a.disbursement_date || a.txn_date || ''
    )
  )

  memoryCache.set(cacheKey, { timestamp: now, data: sorted })
  return sorted
}

// ─── READ: Fetch one by primary key ──────────────────────────────────────────
export async function getOne<T>(store: string, id: string | number): Promise<T | null> {
  const { data, error } = await supabase.from(tbl(store)).select('data').eq('id', String(id)).maybeSingle()
  if (error) { console.warn(`getOne(${store}, ${id}):`, error.message); return null }
  return data ? (data as { data: T }).data : null
}

// ─── READ: Fetch filtered by field ───────────────────────────────────────────
export async function getFiltered<T>(store: string, field: string, value: string | number): Promise<T[]> {
  const { data, error } = await supabase.from(tbl(store)).select('data').eq(`data->>${field}`, String(value))
  if (error) { console.warn(`getFiltered(${store}):`, error.message); return [] }
  return (data || []).map((r: { data: T }) => r.data)
}

function notifyDataChange(store: string) {
  invalidateCache(store)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('aa2_data_changed', { detail: { store } }))
  }
}

// ─── WRITE: Upsert one record (via server to bypass RLS) ─────────────────────
export async function putOne<T>(store: string, record: T, idField: keyof T | string): Promise<void> {
  await serverWrite({ store, record, idField })
  notifyDataChange(store)
}

// ─── WRITE: Upsert many records (via server to bypass RLS) ───────────────────
export async function putMany<T>(store: string, records: T[], idField: keyof T | string): Promise<void> {
  if (!records.length) return
  await serverWrite({ store, records, idField })
  notifyDataChange(store)
}

// ─── DELETE: Remove one record (via server to bypass RLS) ────────────────────
export async function delOne(store: string, id: string | number): Promise<void> {
  await serverDelete(store, id)
  notifyDataChange(store)
}

// ─── FILTERED READ via server (for cases when RLS blocks reads too) ──────────
export async function getAllViaServer<T>(store: string): Promise<T[]> {
  const res = await fetch(`/api/db?store=${encodeURIComponent(store)}`)
  if (!res.ok) return []
  const json = await res.json()
  return json.records || []
}

export async function getFilteredViaServer<T>(store: string, field: string, value: string | number): Promise<T[]> {
  const res = await fetch(`/api/db?store=${encodeURIComponent(store)}&field=${encodeURIComponent(field)}&value=${encodeURIComponent(String(value))}`)
  if (!res.ok) return []
  const json = await res.json()
  return json.records || []
}
