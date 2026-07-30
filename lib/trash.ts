import { putOne, delOne, getAll, getOne } from '@/lib/supabase'

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
  investors: 'investor_id',
  products: 'product_id',
}

/** Move an item to Trash Can (Soft Delete) */
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
}

/** Restore an item from Trash Can back to active store */
export async function restoreFromTrash(trashId: string): Promise<TrashItem> {
  const item = await getOne<TrashItem>('trash', trashId)
  if (!item) throw new Error('Trash item not found.')

  const idField = ID_FIELDS[item.store_name] || 'id'

  // 1. Put back into main store
  await putOne(item.store_name, item.data, idField)

  // 2. Remove from trash
  await delOne('trash', trashId)

  return item
}

/** Get all trash items */
export async function getTrashItems(): Promise<TrashItem[]> {
  const items = await getAll<TrashItem>('trash')
  return items.sort((a, b) => (b.deleted_at || '').localeCompare(a.deleted_at || ''))
}
