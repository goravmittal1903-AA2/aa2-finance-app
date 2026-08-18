import { putOne, delOne, getAll, getOne } from '@/lib/supabase'
import { logAuditEvent } from '@/lib/audit'

export interface TrashItem {
  trash_id: string
  store_name: string
  record_id: string
  title: string
  data: any
  deleted_at: string
  deleted_by: string
}

const ID_FIELDS: Record<string, string> = {
  customers: 'customer_id',
  loans: 'loan_account_no',
  repayment_schedule: 'id',
  transactions: 'txn_id',
  documents: 'doc_id',
  grievances: 'ticket_id',
  investors: 'id',
  products: 'product_id',
  borrowings: 'id',
  cash_accounts: 'id',
  expenses: 'id',
  fixed_assets: 'id',
}

/** Move an item to Trash Can (Soft Delete) & Log Audit Event */
export async function moveToTrash(
  storeName: string,
  recordId: string | number,
  recordData: any,
  title: string,
  deletedBy: string
): Promise<void> {
  const trashId = `TRASH-${Date.now()}-${Math.floor(Math.random() * 1000)}`
  const item: TrashItem = {
    trash_id: trashId,
    store_name: storeName,
    record_id: String(recordId),
    title: title || String(recordId),
    data: recordData,
    deleted_at: new Date().toISOString(),
    deleted_by: deletedBy || 'system',
  }

  // 1. Save in trash store
  await putOne('trash', item, 'trash_id')

  // 2. Remove from active store
  await delOne(storeName, recordId)

  // 3. Log Audit Event in System Audit Logs
  try {
    await logAuditEvent(
      'DELETE',
      storeName,
      String(recordId),
      `Deleted ${title || storeName} (${recordId})`,
      deletedBy || 'system'
    )
  } catch (err) {
    console.warn('Audit log write warning on moveToTrash:', err)
  }
}

/** Restore an item from Trash Can back to active store & Log Audit Event */
export async function restoreFromTrash(trashId: string, restoredBy = 'system'): Promise<TrashItem> {
  const item = await getOne<TrashItem>('trash', trashId)
  if (!item) throw new Error('Trash item not found.')

  const idField = ID_FIELDS[item.store_name] || 'id'

  // 1. Put back into main store
  await putOne(item.store_name, item.data, idField)

  // 2. Remove from trash
  await delOne('trash', trashId)

  // 3. Log Audit Event in System Audit Logs
  try {
    await logAuditEvent(
      'RESTORE',
      item.store_name,
      item.record_id,
      `Restored ${item.title || item.store_name} (${item.record_id}) from Trash`,
      restoredBy
    )
  } catch (err) {
    console.warn('Audit log write warning on restoreFromTrash:', err)
  }

  return item
}

/** Permanently purge an item from Trash Can & Log Audit Event */
export async function purgeFromTrash(trashId: string, purgedBy = 'system'): Promise<TrashItem> {
  const item = await getOne<TrashItem>('trash', trashId)
  if (!item) throw new Error('Trash item not found.')

  await delOne('trash', trashId)

  try {
    await logAuditEvent(
      'DELETE',
      item.store_name,
      item.record_id,
      `Permanently purged ${item.title || item.store_name} (${item.record_id}) from Trash`,
      purgedBy
    )
  } catch (err) {
    console.warn('Audit log write warning on purgeFromTrash:', err)
  }

  return item
}

/** Get all trash items */
export async function getTrashItems(): Promise<TrashItem[]> {
  const items = await getAll<TrashItem>('trash')
  return items.sort((a, b) => (b.deleted_at || '').localeCompare(a.deleted_at || ''))
}
