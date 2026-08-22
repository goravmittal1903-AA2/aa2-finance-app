import { putOne, getAll } from './supabase'

export type AuditEventType =
  | 'PAYMENT_COLLECTED'
  | 'PAYMENT_DELETED'
  | 'LOAN_SANCTIONED'
  | 'LOAN_RESTRUCTURED'
  | 'OTS_SETTLED'
  | 'KYC_UPDATED'
  | 'DOCUMENT_UPLOADED'
  | 'DOCUMENT_DELETED'
  | 'USER_LOGIN'
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'RESTORE'
  | string

export interface AuditLogEntry {
  log_id: string
  timestamp: string
  event_type: AuditEventType
  entity_type: string
  entity_id: string
  actor_email: string
  actor_name: string
  actor_role: string
  branch_code?: string
  old_values?: Record<string, any>
  new_values?: Record<string, any>
  narration: string
}

export async function logAuditEvent(
  entryOrAction: Omit<AuditLogEntry, 'log_id' | 'timestamp'> | string,
  entity_type?: string,
  entity_id?: string,
  narration?: string,
  actor_email?: string,
  changes?: any
): Promise<string> {
  const log_id = 'AUDIT-' + Date.now() + '-' + Math.floor(Math.random() * 1000)
  
  let fullEntry: AuditLogEntry

  if (typeof entryOrAction === 'object') {
    fullEntry = {
      ...entryOrAction,
      log_id,
      timestamp: new Date().toISOString(),
    }
  } else {
    fullEntry = {
      log_id,
      timestamp: new Date().toISOString(),
      event_type: entryOrAction || 'UPDATE',
      entity_type: entity_type || 'SYSTEM',
      entity_id: String(entity_id || ''),
      actor_email: actor_email || 'system',
      actor_name: (actor_email || 'system').split('@')[0],
      actor_role: 'staff',
      narration: narration || `${entryOrAction} on ${entity_type} ${entity_id}`,
      new_values: changes,
    }
  }

  try {
    await putOne('audit_logs', fullEntry, 'log_id')
  } catch (err) {
    console.warn('Failed to persist audit log:', err)
  }

  return log_id
}

export async function getAuditLogs(): Promise<AuditLogEntry[]> {
  try {
    const logs = await getAll<AuditLogEntry>('audit_logs', true)
    return logs.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''))
  } catch (err) {
    console.warn('Failed to load audit logs:', err)
    return []
  }
}

export async function getEntityAuditLogs(entity_id: string): Promise<AuditLogEntry[]> {
  const all = await getAuditLogs()
  return all.filter(l => l.entity_id === entity_id)
}
