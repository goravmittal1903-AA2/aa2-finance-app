'use client'

import { useEffect, useState } from 'react'
import { getAll, putOne } from '@/lib/supabase'
import { Download, Upload, Trash2, RefreshCw, CheckCircle, AlertCircle, Database, RotateCcw, Shield } from 'lucide-react'
import { confirmAction } from '@/lib/confirm'

// All data stores in the system
const STORES = [
  'customers', 'loans', 'schedule', 'transactions',
  'investors', 'investor_txns', 'borrowings', 'borrowing_txns',
  'cash_accounts', 'cash_txns', 'expenses', 'fixed_assets',
  'documents', 'grievances', 'products', 'audit_log'
]

const PRIMARY_KEYS: Record<string, string> = {
  customers: 'customer_id', loans: 'loan_account_no', schedule: 'id',
  transactions: 'txn_id', investors: 'id', investor_txns: 'id',
  borrowings: 'id', borrowing_txns: 'id', cash_accounts: 'id',
  cash_txns: 'id', expenses: 'id', fixed_assets: 'id',
  documents: 'doc_id', grievances: 'ticket_id', products: 'product_id', audit_log: 'id'
}

type Tab = 'backup' | 'restore' | 'trash' | 'migration'
type BackupStatus = 'idle' | 'running' | 'done' | 'error'

// Soft-delete: items with deleted_at field set
interface DeletedRecord {
  store: string
  id: string
  label: string
  deleted_at: string
  data: Record<string, unknown>
}

export default function DataToolsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('backup')
  const [backupStatus, setBackupStatus] = useState<BackupStatus>('idle')
  const [backupProgress, setBackupProgress] = useState(0)
  const [restoreFile, setRestoreFile] = useState<File | null>(null)
  const [restoreStatus, setRestoreStatus] = useState<BackupStatus>('idle')
  const [restoreLog, setRestoreLog] = useState<string[]>([])
  const [deletedItems, setDeletedItems] = useState<DeletedRecord[]>([])
  const [trashLoading, setTrashLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    if (activeTab === 'trash') loadDeletedItems()
  }, [activeTab])

  // ── BACKUP ────────────────────────────────────────────────────────────────
  async function handleBackup() {
    setBackupStatus('running')
    setBackupProgress(0)
    setMessage('')
    setErrorMessage('')
    try {
      const backup: Record<string, unknown[]> = {
        _meta: [{
          version: '1.0',
          created_at: new Date().toISOString(),
          app: 'AA2 Finance MFI Platform',
          stores: STORES
        }]
      }
      for (let i = 0; i < STORES.length; i++) {
        const store = STORES[i]
        try {
          const data = await getAll<Record<string, unknown>>(store)
          backup[store] = data
        } catch {
          backup[store] = []
        }
        setBackupProgress(Math.round(((i + 1) / STORES.length) * 100))
      }

      const json = JSON.stringify(backup, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const date = new Date().toISOString().slice(0, 10)
      a.href = url
      a.download = `aa2_finance_backup_${date}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      setBackupStatus('done')
      const totalRecords = Object.values(backup).reduce((s, v) => s + (Array.isArray(v) ? v.length : 0), 0)
      setMessage(`Backup complete! ${totalRecords} records exported across ${STORES.length} tables.`)
    } catch (err: any) {
      setBackupStatus('error')
      setErrorMessage(err.message || 'Backup failed.')
    }
  }

  // ── RESTORE ────────────────────────────────────────────────────────────────
  async function handleRestore() {
    if (!restoreFile) return
    const ok = await confirmAction({
      title: 'Confirm Database Restore',
      message: '⚠️ This will OVERWRITE existing data in the database with the backup file contents. Are you sure?',
      confirmText: 'Overwrite & Restore',
      variant: 'danger',
    })
    if (!ok) return

    setRestoreStatus('running')
    setRestoreLog([])
    const log: string[] = []

    try {
      const text = await restoreFile.text()
      const backup = JSON.parse(text) as Record<string, Record<string, unknown>[]>

      for (const store of STORES) {
        if (!backup[store] || !Array.isArray(backup[store])) {
          log.push(`⚠️  ${store}: no data found in backup, skipped.`)
          setRestoreLog([...log])
          continue
        }
        const records = backup[store]
        const pk = PRIMARY_KEYS[store] || 'id'
        let count = 0
        for (const record of records) {
          try {
            await putOne(store, record, pk)
            count++
          } catch (e: any) {
            log.push(`✗  ${store} [${record[pk]}]: ${e.message}`)
          }
        }
        log.push(`✓  ${store}: ${count} of ${records.length} records restored.`)
        setRestoreLog([...log])
      }

      setRestoreStatus('done')
      setMessage('Restore complete!')
    } catch (err: any) {
      setRestoreStatus('error')
      setErrorMessage(err.message || 'Restore failed. Ensure the file is a valid AA2 backup JSON.')
    }
  }

  // ── TRASH CAN ──────────────────────────────────────────────────────────────
  async function loadDeletedItems() {
    setTrashLoading(true)
    try {
      const { getTrashItems } = await import('@/lib/trash')
      const items = await getTrashItems()
      const formatted: DeletedRecord[] = items.map(item => ({
        store: item.store_name,
        id: item.record_id,
        label: item.title || item.record_id,
        deleted_at: item.deleted_at,
        trash_id: item.trash_id,
        data: item.data,
      }))
      setDeletedItems(formatted)
    } catch (err) {
      console.warn('Failed to load trash items:', err)
      setDeletedItems([])
    } finally {
      setTrashLoading(false)
    }
  }

  async function handleRestore_item(item: DeletedRecord) {
    try {
      const { restoreFromTrash } = await import('@/lib/trash')
      const trashId = (item as any).trash_id || item.id
      await restoreFromTrash(trashId)
      setMessage(`Restored: ${item.label}`)
      await loadDeletedItems()
    } catch (err: any) {
      setErrorMessage(err.message || 'Restore failed.')
    }
  }

  // ── MIGRATION ─────────────────────────────────────────────────────────────
  const [migrating, setMigrating] = useState(false)
  const [migrationResult, setMigrationResult] = useState<any>(null)

  async function handleRunMigration() {
    const ok = await confirmAction({
      title: 'Run Member ID Migration',
      message: 'Run Member ID Format Migration now? This will convert non-standard Member IDs (like MEM-1D8KJ0JNOW) to standard MEM12345 format and update all related loans, documents, and grievances.',
      confirmText: 'Run Migration',
      variant: 'warning',
    })
    if (!ok) return
    setMigrating(true)
    setMessage('')
    setErrorMessage('')
    try {
      const { runMemberIdMigration } = await import('@/lib/migration')
      const result = await runMemberIdMigration()
      setMigrationResult(result)
      setMessage(`Migration complete! ${result.totalMigrated} member ID(s) updated to standard MEM12345 format.`)
    } catch (err: any) {
      setErrorMessage(err.message || 'Migration failed.')
    } finally {
      setMigrating(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Data Management Tools</h1>
        <p className="text-slate-500 text-sm mt-0.5">Database backup, restore, and soft-deleted record recovery.</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        {([
          { id: 'backup', label: 'Backup Database', icon: Download },
          { id: 'restore', label: 'Restore from Backup', icon: Upload },
          { id: 'trash', label: 'Trash Can / Recovery', icon: Trash2 },
        ] as { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[]).map(tab => (
          <button key={tab.id} onClick={() => { setActiveTab(tab.id); setMessage(''); setErrorMessage('') }}
            className={`px-4 py-3 text-xs font-bold border-b-2 flex items-center gap-2 transition ${activeTab === tab.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            <tab.icon className="w-3.5 h-3.5" /> {tab.label}
          </button>
        ))}
      </div>

      {/* Alerts */}
      {message && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-xl text-sm flex items-center gap-2"><CheckCircle className="w-4 h-4" /> {message}</div>}
      {errorMessage && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-center gap-2"><AlertCircle className="w-4 h-4" /> {errorMessage}</div>}

      {/* ── TAB 1: Backup ── */}
      {activeTab === 'backup' && (
        <div className="bg-white p-8 rounded-2xl border border-slate-100 space-y-6 max-w-xl">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-blue-100 flex items-center justify-center">
              <Database className="w-7 h-7 text-blue-600" />
            </div>
            <div>
              <h2 className="font-bold text-slate-800">Backup All Data</h2>
              <p className="text-xs text-slate-500 mt-0.5">Downloads a complete JSON snapshot of all {STORES.length} data tables. Keep this file safe.</p>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800 flex gap-2">
            <Shield className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <p>Perform regular backups — at least weekly — and store the backup file in a secure location. This file contains all customer and financial data.</p>
          </div>

          <div className="space-y-2 text-xs text-slate-600">
            <p className="font-bold text-slate-700 mb-2">Includes these tables:</p>
            <div className="grid grid-cols-2 gap-1">
              {STORES.map(s => (
                <div key={s} className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0" /><span className="font-mono">{s}</span></div>
              ))}
            </div>
          </div>

          {backupStatus === 'running' && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-slate-600"><span>Backing up…</span><span>{backupProgress}%</span></div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full transition-all duration-300" style={{ width: `${backupProgress}%` }} />
              </div>
            </div>
          )}

          <button onClick={handleBackup} disabled={backupStatus === 'running'}
            className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold rounded-xl transition text-sm shadow-lg shadow-blue-500/20">
            <Download className="w-4 h-4" />
            {backupStatus === 'running' ? 'Backing up…' : 'Download Database Backup (JSON)'}
          </button>
        </div>
      )}

      {/* ── TAB 2: Restore ── */}
      {activeTab === 'restore' && (
        <div className="bg-white p-8 rounded-2xl border border-slate-100 space-y-6 max-w-xl">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-amber-100 flex items-center justify-center">
              <RotateCcw className="w-7 h-7 text-amber-600" />
            </div>
            <div>
              <h2 className="font-bold text-slate-800">Restore from Backup</h2>
              <p className="text-xs text-slate-500 mt-0.5">Upload a previously downloaded AA2 backup JSON file to restore the database.</p>
            </div>
          </div>

          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-xs text-red-800 flex gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <p><strong>Warning:</strong> Restoring will overwrite existing records with the data from the backup file. This action cannot be undone. Back up current data first.</p>
          </div>

          <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center">
            <Upload className="w-8 h-8 text-slate-400 mx-auto mb-3" />
            <label className="cursor-pointer">
              <span className="text-sm text-slate-600 font-medium">{restoreFile ? restoreFile.name : 'Click to select backup JSON file'}</span>
              <input type="file" accept=".json" onChange={e => { setRestoreFile(e.target.files?.[0] || null); setRestoreStatus('idle'); setRestoreLog([]) }} className="hidden" />
            </label>
          </div>

          {restoreLog.length > 0 && (
            <div className="bg-slate-900 rounded-xl p-4 font-mono text-xs text-slate-300 max-h-48 overflow-y-auto space-y-1">
              {restoreLog.map((line, i) => (
                <div key={i} className={line.startsWith('✓') ? 'text-emerald-400' : line.startsWith('✗') ? 'text-red-400' : 'text-amber-400'}>{line}</div>
              ))}
            </div>
          )}

          <button onClick={handleRestore} disabled={!restoreFile || restoreStatus === 'running'}
            className="w-full flex items-center justify-center gap-2 py-3 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-bold rounded-xl transition text-sm">
            <RotateCcw className="w-4 h-4" />
            {restoreStatus === 'running' ? 'Restoring…' : 'Restore Database from Backup'}
          </button>
        </div>
      )}

      {/* ── TAB: Member ID Migration ── */}
      {activeTab === 'migration' && (
        <div className="bg-white p-8 rounded-2xl border border-slate-100 space-y-6 max-w-xl">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-purple-100 flex items-center justify-center">
              <Database className="w-7 h-7 text-purple-600" />
            </div>
            <div>
              <h2 className="font-bold text-slate-800">Standardize Member IDs</h2>
              <p className="text-xs text-slate-500 mt-0.5">Converts legacy member IDs (like MEM-1D8KJ0JNOW) to standard MEM12345 format and updates all linked loans, documents & grievances.</p>
            </div>
          </div>

          <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 text-xs text-purple-900 space-y-1">
            <p className="font-bold">What this migration does:</p>
            <p>1. Finds all member records with old non-standard ID formats.</p>
            <p>2. Assigns new sequential member IDs: <code className="bg-purple-100 px-1 font-mono rounded">MEM10001</code>, <code className="bg-purple-100 px-1 font-mono rounded">MEM10002</code>, etc.</p>
            <p>3. Automatically updates all associated loans, repayment schedules, documents, and grievances so no records are disconnected.</p>
          </div>

          {migrationResult && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-2 max-h-48 overflow-y-auto">
              <p className="font-bold text-slate-800">Migration Results ({migrationResult.totalMigrated} updated):</p>
              {migrationResult.details.map((d: any, idx: number) => (
                <div key={idx} className="flex justify-between text-slate-600 font-mono">
                  <span>{d.name}</span>
                  <span><span className="text-red-500 line-through">{d.oldId}</span> → <strong className="text-emerald-600">{d.newId}</strong></span>
                </div>
              ))}
              {migrationResult.totalMigrated === 0 && (
                <p className="text-emerald-600 font-semibold">🎉 All member IDs are already in standard MEM12345 format!</p>
              )}
            </div>
          )}

          <button onClick={handleRunMigration} disabled={migrating}
            className="w-full flex items-center justify-center gap-2 py-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold rounded-xl transition text-sm shadow-lg shadow-purple-500/20">
            <RefreshCw className={`w-4 h-4 ${migrating ? 'animate-spin' : ''}`} />
            {migrating ? 'Running Migration…' : 'Run Member ID Format Migration'}
          </button>
        </div>
      )}

      {/* ── TAB 3: Trash Can ── */}
      {activeTab === 'trash' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-600">Records marked as deleted (soft-delete). Click Restore to recover them.</p>
            <button onClick={loadDeletedItems} className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition">
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
            <table className="w-full text-xs">
              <thead><tr className="bg-slate-50 text-slate-500 text-[10px] uppercase">
                <th className="px-5 py-3 text-left">Store</th>
                <th className="px-5 py-3 text-left">Record</th>
                <th className="px-5 py-3 text-left">ID</th>
                <th className="px-5 py-3 text-left">Deleted At</th>
                <th className="px-5 py-3 text-center">Action</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {trashLoading && <tr><td colSpan={5} className="py-10 text-center text-slate-400">Loading trash can…</td></tr>}
                {!trashLoading && deletedItems.length === 0 && (
                  <tr><td colSpan={5} className="py-10 text-center text-slate-400">
                    <div className="flex flex-col items-center gap-2">
                      <Trash2 className="w-8 h-8 text-slate-300" />
                      <p>Trash can is empty. No soft-deleted records found.</p>
                    </div>
                  </td></tr>
                )}
                {deletedItems.map((item, i) => (
                  <tr key={i} className="hover:bg-slate-50/50">
                    <td className="px-5 py-3"><span className="badge bg-slate-100 text-slate-600 text-[9px] font-mono">{item.store}</span></td>
                    <td className="px-5 py-3 font-semibold text-slate-800">{item.label}</td>
                    <td className="px-5 py-3 font-mono text-slate-500 text-[10px]">{item.id}</td>
                    <td className="px-5 py-3 text-slate-500">{new Date(item.deleted_at).toLocaleString('en-IN')}</td>
                    <td className="px-5 py-3 text-center">
                      <button onClick={() => handleRestore_item(item)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded-lg transition mx-auto">
                        <RotateCcw className="w-3 h-3" /> Restore
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
