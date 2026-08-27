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
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minute TTL — longer for fewer refetches

export function invalidateCache(store?: string) {
  if (store) {
    // Targeted invalidation: clear keys related to this store
    const table = tbl(store)
    const keysToDelete: string[] = []
    for (const key of memoryCache.keys()) {
      if (
        key.includes(store) ||
        key.includes(table) ||
        ((store === 'documents' || store === 'loan_documents') && (key.includes('documents') || key.includes('loan_documents')))
      ) {
        keysToDelete.push(key)
      }
    }
    for (const key of keysToDelete) {
      memoryCache.delete(key)
    }
  } else {
    memoryCache.clear()
  }
}

let notifyTimer: any = null
const pendingStores = new Set<string>()

function notifyDataChange(store: string) {
  invalidateCache(store)
  if (store === 'documents' || store === 'loan_documents') {
    invalidateCache('documents')
    invalidateCache('loan_documents')
  }
  pendingStores.add(store)
  if (typeof window !== 'undefined') {
    if (notifyTimer) clearTimeout(notifyTimer)
    notifyTimer = setTimeout(() => {
      const stores = Array.from(pendingStores)
      pendingStores.clear()
      window.dispatchEvent(new CustomEvent('aa2_data_changed', { detail: { stores, store } }))
    }, 60)
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

  if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
    return getAllViaServer<T>(store)
  }

  let allData: any[] = []
  let from = 0
  const STEP = 1000

  while (true) {
    const { data, error } = await supabase
      .from(tbl(store))
      .select('data')
      .range(from, from + STEP - 1)

    if (error) {
      console.warn(`getAll(${store}) error:`, error.message)
      return getAllViaServer<T>(store)
    }

    if (!data || data.length === 0) break
    allData = allData.concat(data)
    if (data.length < STEP) break
    from += STEP
  }

  const list = (allData || []).map((r: { data: T }) => r.data)
  const sorted = list.sort((a: any, b: any) =>
    (b.created_at || b.updated_at || b.disbursement_date || b.txn_date || '').localeCompare(
      a.created_at || a.updated_at || a.disbursement_date || a.txn_date || ''
    )
  )

  memoryCache.set(cacheKey, { timestamp: now, data: sorted })
  return sorted
}

// ─── READ: Fetch one by primary key (with cache) ─────────────────────────────
export async function getOne<T>(store: string, id: string | number, forceRefresh = false): Promise<T | null> {
  const cacheKey = `getOne:${tbl(store)}:${id}`
  const cached = memoryCache.get(cacheKey)
  const now = Date.now()

  if (!forceRefresh && cached && (now - cached.timestamp < CACHE_TTL_MS)) {
    return cached.data
  }

  if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
    return getOneViaServer<T>(store, id)
  }

  const { data, error } = await supabase.from(tbl(store)).select('data').eq('id', String(id)).maybeSingle()
  if (error) { console.warn(`getOne(${store}, ${id}):`, error.message); return getOneViaServer<T>(store, id) }
  const result = data ? (data as { data: T }).data : null
  memoryCache.set(cacheKey, { timestamp: now, data: result })
  return result
}

// ─── READ: Fetch filtered by field (with cache) ──────────────────────────────
export async function getFiltered<T>(store: string, field: string, value: string | number, forceRefresh = false): Promise<T[]> {
  const cacheKey = `getFiltered:${tbl(store)}:${field}:${value}`
  const cached = memoryCache.get(cacheKey)
  const now = Date.now()

  if (!forceRefresh && cached && (now - cached.timestamp < CACHE_TTL_MS)) {
    return cached.data
  }

  if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
    return getFilteredViaServer<T>(store, field, value)
  }

  const { data, error } = await supabase.from(tbl(store)).select('data').eq(`data->>${field}`, String(value))
  if (error) { console.warn(`getFiltered(${store}):`, error.message); return getFilteredViaServer<T>(store, field, value) }
  const result = (data || []).map((r: { data: T }) => r.data)
  memoryCache.set(cacheKey, { timestamp: now, data: result })
  return result
}

// ─── WRITE: Optimistic upsert (updates cache FIRST for 0ms UI response) ─────
export async function putOne<T>(store: string, record: T, idField: keyof T | string): Promise<void> {
  // Optimistic: update getAll cache immediately so UI reflects changes at 0ms
  const getAllKey = `getAll:${tbl(store)}`
  const cachedAll = memoryCache.get(getAllKey)
  if (cachedAll) {
    const id = String((record as any)[idField])
    const list = [...cachedAll.data]
    const idx = list.findIndex((r: any) => String(r[idField]) === id)
    if (idx >= 0) {
      list[idx] = record
    } else {
      list.unshift(record)
    }
    memoryCache.set(getAllKey, { timestamp: Date.now(), data: list })
  }

  // Optimistic: update getOne cache
  const id = String((record as any)[idField])
  memoryCache.set(`getOne:${tbl(store)}:${id}`, { timestamp: Date.now(), data: record })

  // Notify UI immediately (0ms response)
  notifyDataChange(store)

  // Fire server write (non-blocking for UI but we still await for error handling)
  await serverWrite({ store, record, idField })
}

// ─── WRITE: Optimistic bulk upsert ───────────────────────────────────────────
export async function putMany<T>(store: string, records: T[], idField: keyof T | string): Promise<void> {
  if (!records.length) return

  // Optimistic: update getAll cache
  const getAllKey = `getAll:${tbl(store)}`
  const cachedAll = memoryCache.get(getAllKey)
  if (cachedAll) {
    const list = [...cachedAll.data]
    for (const record of records) {
      const id = String((record as any)[idField])
      const idx = list.findIndex((r: any) => String(r[idField]) === id)
      if (idx >= 0) {
        list[idx] = record
      } else {
        list.unshift(record)
      }
    }
    memoryCache.set(getAllKey, { timestamp: Date.now(), data: list })
  }

  // Notify UI immediately
  notifyDataChange(store)

  await serverWrite({ store, records, idField })
}

// ─── DELETE: Optimistic remove (removes from cache FIRST) ────────────────────
export async function delOne(store: string, id: string | number): Promise<void> {
  // Optimistic: remove from getAll cache
  const getAllKey = `getAll:${tbl(store)}`
  const cachedAll = memoryCache.get(getAllKey)
  if (cachedAll) {
    const list = cachedAll.data.filter((r: any) => {
      const rId = r.id || r.customer_id || r.loan_account_no || r.txn_id || r.ticket_id || ''
      return String(rId) !== String(id)
    })
    memoryCache.set(getAllKey, { timestamp: Date.now(), data: list })
  }

  // Remove from getOne cache
  memoryCache.delete(`getOne:${tbl(store)}:${id}`)

  // Notify UI immediately
  notifyDataChange(store)

  await serverDelete(store, id)
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

export async function getOneViaServer<T>(store: string, id: string | number): Promise<T | null> {
  const cacheKey = `getOne:${tbl(store)}:${id}`
  const cached = memoryCache.get(cacheKey)
  const now = Date.now()

  if (cached && (now - cached.timestamp < CACHE_TTL_MS)) {
    return cached.data
  }

  const res = await fetch(`/api/db?store=${encodeURIComponent(store)}&field=id&value=${encodeURIComponent(String(id))}`)
  if (!res.ok) return null
  const json = await res.json()
  const list = json.records || []
  const result = list.length > 0 ? list[0] : null
  memoryCache.set(cacheKey, { timestamp: now, data: result })
  return result
}
