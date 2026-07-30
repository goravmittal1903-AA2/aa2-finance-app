import { putOne, getAll } from '@/lib/supabase'

export interface AuditLogRecord {
  id: string
  ts: string
  entity_type: string
  entity_id: string
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE' | 'COLLECT' | 'RESOLVE' | 'CANCEL' | 'REOPEN'
  summary: string
  changes?: { field: string; from: any; to: any }[]
  user: string
}

/** Record an audit trail log entry */
export async function logAuditEvent(
  action: AuditLogRecord['action'],
  entityType: string,
  entityId: string,
  summary: string,
  userEmail?: string,
  changes?: { field: string; from: any; to: any }[]
): Promise<void> {
  const record: AuditLogRecord = {
    id: `AUD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    ts: new Date().toISOString(),
    entity_type: entityType,
    entity_id: String(entityId),
    action,
    summary,
    user: userEmail || 'system',
    changes,
  }

  try {
    await putOne('audit_log', record, 'id')
  } catch (err) {
    console.warn('Audit log write warning:', err)
  }
}

/** Get audit events for a specific entity ID (e.g. Member ID or Loan Account No) */
export async function getEntityAuditLogs(entityId: string): Promise<AuditLogRecord[]> {
  try {
    const [appLogs, dbEvents] = await Promise.all([
      getAll<AuditLogRecord>('audit_log'),
      getAll<any>('audit_events')
    ])

    const formattedDbEvents: AuditLogRecord[] = dbEvents
      .filter(e => e.entity_id === entityId || String(e.entity_id) === entityId)
      .map(e => ({
        id: e.id || `DB-${e.occurred_at}`,
        ts: e.occurred_at || e.created_at || new Date().toISOString(),
        entity_type: e.entity_type || 'database',
        entity_id: String(e.entity_id),
        action: (e.action || 'UPDATE').toUpperCase() as any,
        summary: `DB ${e.action || 'change'} on ${e.entity_type || 'record'} (${e.entity_id})`,
        user: e.actor_email || 'Database Trigger',
      }))

    const all = [...appLogs.filter(l => l.entity_id === entityId || l.summary?.includes(entityId)), ...formattedDbEvents]
    return all.sort((a, b) => (b.ts || '').localeCompare(a.ts || ''))
  } catch (err) {
    console.warn('Get entity audit logs error:', err)
    return []
  }
}
