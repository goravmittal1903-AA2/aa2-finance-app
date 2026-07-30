import { getAll, putOne, putMany, delOne } from '@/lib/supabase'
import type { Customer, Loan } from '@/lib/types'

export interface MigrationResult {
  totalMigrated: number
  details: { oldId: string; newId: string; name: string }[]
}

/** Check if customer_id matches standard format MEM12345 (MEM + 5 digits) */
export function isStandardMemberId(id: string): boolean {
  if (!id) return false
  return /^MEM\d{5}$/.test(id.trim())
}

/** Run Member ID Format Migration to standardize all legacy member IDs to MEM12345 format */
export async function runMemberIdMigration(): Promise<MigrationResult> {
  const [customers, loans, documents, grievances] = await Promise.all([
    getAll<Customer>('customers'),
    getAll<Loan>('loans'),
    getAll<any>('documents'),
    getAll<any>('grievances'),
  ])

  // 1. Find max existing standard MEMxxxxx number
  let maxNum = 10000
  for (const c of customers) {
    if (isStandardMemberId(c.customer_id)) {
      const val = parseInt(c.customer_id.substring(3), 10)
      if (val > maxNum) maxNum = val
    }
  }

  // 2. Filter non-standard member IDs
  const nonStandard = customers.filter(c => !isStandardMemberId(c.customer_id))
  if (nonStandard.length === 0) {
    return { totalMigrated: 0, details: [] }
  }

  const details: { oldId: string; newId: string; name: string }[] = []
  let nextNum = maxNum + 1

  // Map of old_id -> new_id
  const idMap = new Map<string, string>()

  for (const cust of nonStandard) {
    const oldId = cust.customer_id
    const newId = `MEM${String(nextNum).padStart(5, '0')}`
    nextNum++
    idMap.set(oldId, newId)
    details.push({ oldId, newId, name: cust.full_name || 'Member' })

    // Update customer object in DB
    const updatedCust: Customer = {
      ...cust,
      customer_id: newId,
      updated_at: new Date().toISOString(),
    }

    // Replace customer in DB (delete old id, save new id)
    await delOne('customers', oldId)
    await putOne('customers', updatedCust, 'customer_id')
  }

  // 3. Cascade update loans
  const loansToUpdate: Loan[] = []
  for (const l of loans) {
    if (idMap.has(l.customer_id)) {
      const newId = idMap.get(l.customer_id)!
      loansToUpdate.push({
        ...l,
        customer_id: newId,
        updated_at: new Date().toISOString(),
      })
    }
  }

  if (loansToUpdate.length > 0) {
    await putMany('loans', loansToUpdate, 'loan_account_no')
  }

  // 4. Cascade update documents
  const docsToUpdate: any[] = []
  for (const d of documents) {
    if (idMap.has(d.customer_id)) {
      const newId = idMap.get(d.customer_id)!
      docsToUpdate.push({
        ...d,
        customer_id: newId,
      })
    }
  }

  if (docsToUpdate.length > 0) {
    await putMany('documents', docsToUpdate, 'doc_id')
  }

  // 5. Cascade update grievances
  const grievancesToUpdate: any[] = []
  for (const g of grievances) {
    if (idMap.has(g.customer_id)) {
      const newId = idMap.get(g.customer_id)!
      grievancesToUpdate.push({
        ...g,
        customer_id: newId,
      })
    }
  }

  if (grievancesToUpdate.length > 0) {
    await putMany('grievances', grievancesToUpdate, 'ticket_id')
  }

  return {
    totalMigrated: details.length,
    details,
  }
}
