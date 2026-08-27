'use client'

import { useEffect, useState } from 'react'
import { getAll, putOne } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { parseBranchExcelWorkbook, type ParsedExcelData } from '@/lib/excel-importer'
import { Download, Upload, Trash2, RefreshCw, CheckCircle, AlertCircle, Database, RotateCcw, Shield, FileSpreadsheet, History, Layers, FileCheck } from 'lucide-react'
import { confirmAction } from '@/lib/confirm'
import { toast } from '@/lib/toast'

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

type Tab = 'excel_import' | 'backup' | 'restore' | 'trash'
type StatusState = 'idle' | 'running' | 'done' | 'error'

interface BatchLog {
  id: string
  batch_id: string
  file_name: string
  branch_name: string
  uploaded_by: string
  uploaded_at: string
  members_created: number
  members_updated: number
  loans_created: number
  loans_updated: number
  total_records: number
  status: 'COMPLETED' | 'ROLLED_BACK'
  rolled_back_by?: string
  rolled_back_at?: string
}

export default function DataToolsPage() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState<Tab>('excel_import')
  const isIT = user?.role === 'it'

  // Excel Import state
  const [excelFile, setExcelFile] = useState<File | null>(null)
  const [parsedData, setParsedData] = useState<ParsedExcelData | null>(null)
  const [importStatus, setImportStatus] = useState<StatusState>('idle')
  const [importProgress, setImportProgress] = useState(0)
  const [importLog, setImportLog] = useState<string[]>([])
  const [batches, setBatches] = useState<BatchLog[]>([])
  const [batchLoading, setBatchLoading] = useState(false)
  const [rollingBackId, setRollingBackId] = useState<string | null>(null)

  // Backup & Restore state
  const [backupStatus, setBackupStatus] = useState<StatusState>('idle')
  const [backupProgress, setBackupProgress] = useState(0)
  const [restoreFile, setRestoreFile] = useState<File | null>(null)
  const [restoreStatus, setRestoreStatus] = useState<StatusState>('idle')
  const [restoreLog, setRestoreLog] = useState<string[]>([])
  const [message, setMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    if (activeTab === 'excel_import') loadBatchHistory()
  }, [activeTab])

  async function loadBatchHistory() {
    setBatchLoading(true)
    try {
      const logs = await getAll<any>('audit_log')
      const parsed: BatchLog[] = logs
        .filter(l => l.batch_id || (l.data && l.data.batch_id))
        .map(l => (l.data ? l.data : l) as BatchLog)
        .sort((a, b) => new Date(b.uploaded_at || 0).getTime() - new Date(a.uploaded_at || 0).getTime())
      setBatches(parsed)
    } catch {
      setBatches([])
    } finally {
      setBatchLoading(false)
    }
  }

  // Handle Excel Parsing
  async function handleExcelFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setExcelFile(file)
    setMessage('')
    setErrorMessage('')
    try {
      const buffer = await file.arrayBuffer()
      const parsed = parseBranchExcelWorkbook(buffer, file.name)
      setParsedData(parsed)
      toast.success(`Excel file "${file.name}" parsed successfully.`)
    } catch (err: any) {
      setParsedData(null)
      setErrorMessage(`Could not parse Excel file: ${err.message}`)
      toast.error('Failed to parse Excel file.')
    }
  }

  // Execute Excel Master Import in Chunked Payloads
  async function executeMasterImport() {
    if (!parsedData || !excelFile) return
    setImportStatus('running')
    setImportProgress(0)
    setImportLog(['Starting Master Excel Import…'])
    setMessage('')
    setErrorMessage('')

    const batchId = `BATCH-${Date.now()}`
    const CHUNK_SIZE = 40

    try {
      const customers = parsedData.customers
      const totalChunks = Math.ceil(customers.length / CHUNK_SIZE) || 1
      let totalCreatedM = 0
      let totalUpdatedM = 0
      let totalCreatedL = 0
      let totalUpdatedL = 0

      for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
        const start = chunkIdx * CHUNK_SIZE
        const end = start + CHUNK_SIZE
        const cChunk = customers.slice(start, end)
        
        const customerIds = new Set(cChunk.map(c => c.customer_id))
        const lChunk = parsedData.loans.filter(l => customerIds.has(l.customer_id))
        
        const loanNos = new Set(lChunk.map(l => l.loan_account_no))
        const sChunk = parsedData.schedules.filter(s => loanNos.has(s.loan_account_no))
        const tChunk = parsedData.transactions.filter(t => loanNos.has(t.loan_account_no))

        const isLastChunk = chunkIdx === totalChunks - 1

        const res = await fetch('/api/admin/import-excel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            batchId,
            fileName: excelFile.name,
            branchName: parsedData.branchName,
            customers: cChunk,
            loans: lChunk,
            schedules: sChunk,
            transactions: tChunk,
            isLastChunk,
            totalMembers: customers.length,
          }),
        })

        if (!res.ok) {
          const text = await res.text()
          let errMsg = 'Chunk upload failed.'
          try {
            const errJson = JSON.parse(text)
            errMsg = errJson.error || errMsg
          } catch {
            errMsg = `Server returned HTTP ${res.status}: ${text.slice(0, 100)}`
          }
          throw new Error(errMsg)
        }

        const result = await res.json()
        totalCreatedM += result.membersCreated || 0
        totalUpdatedM += result.membersUpdated || 0
        totalCreatedL += result.loansCreated || 0
        totalUpdatedL += result.loansUpdated || 0

        const pct = Math.round(((chunkIdx + 1) / totalChunks) * 100)
        setImportProgress(pct)
      }

      setImportStatus('done')
      setMessage(`Import successful! Batch ID: ${batchId}. Members created: ${totalCreatedM}, updated: ${totalUpdatedM}. Loans created: ${totalCreatedL}, updated: ${totalUpdatedL}.`)
      toast.success('Master Excel Import executed successfully!')
      setExcelFile(null)
      setParsedData(null)
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('aa2_data_changed', { detail: { stores: ['customers', 'loans'] } }))
      await loadBatchHistory()
    } catch (err: any) {
      setImportStatus('error')
      setErrorMessage(err.message || 'Import failed.')
      toast.error(err.message || 'Import failed.')
    }
  }

  // Execute Rollback Reversal
  async function handleRollbackBatch(batch: BatchLog) {
    const ok = await confirmAction({
      title: `Reverse Upload Batch ${batch.batch_id}?`,
      message: `Are you sure you want to ROLLBACK and DELETE all records created from "${batch.file_name}" uploaded on ${new Date(batch.uploaded_at).toLocaleString('en-IN')}? This cannot be undone.`,
      confirmText: 'Reverse & Rollback',
      variant: 'danger',
    })
    if (!ok) return

    setRollingBackId(batch.batch_id)
    try {
      const res = await fetch('/api/admin/rollback-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId: batch.batch_id }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Rollback failed.')

      toast.success(`Batch ${batch.batch_id} successfully reversed! Deleted ${result.deletedCount} records.`)
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('aa2_data_changed', { detail: { stores: ['customers', 'loans'] } }))
      await loadBatchHistory()
    } catch (err: any) {
      toast.error(err.message || 'Rollback failed.')
    } finally {
      setRollingBackId(null)
    }
  }

  // Backup & Restore Handlers
  async function handleBackup() {
    setBackupStatus('running')
    setBackupProgress(0)
    try {
      const backup: Record<string, unknown[]> = { _meta: [{ version: '1.0', created_at: new Date().toISOString(), app: 'AA2 Platform', stores: STORES }] }
      for (let i = 0; i < STORES.length; i++) {
        const store = STORES[i]
        try { backup[store] = await getAll<Record<string, unknown>>(store) } catch { backup[store] = [] }
        setBackupProgress(Math.round(((i + 1) / STORES.length) * 100))
      }
      const json = JSON.stringify(backup, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `aa2_finance_backup_${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      setBackupStatus('done')
      setMessage('JSON Backup download complete!')
    } catch (err: any) {
      setBackupStatus('error')
      setErrorMessage(err.message || 'Backup failed.')
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Database className="w-7 h-7 text-blue-600" /> System Data Tools & Master Excel Sync
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Import branch Excel workbooks, execute incremental updates, review batch history, or rollback uploads.
          </p>
        </div>
      </div>

      {/* Role Notice */}
      {!isIT && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex items-center gap-3 text-amber-600 dark:text-amber-400 text-sm">
          <Shield className="w-5 h-5 flex-shrink-0" />
          <span>Notice: Master Excel Import & Batch Reversals are restricted to <strong>IT Role</strong> users only. Logged in as: {user?.role || 'Guest'}.</span>
        </div>
      )}

      {/* Alert Messages */}
      {message && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 p-4 rounded-2xl flex items-center gap-3 text-sm">
          <CheckCircle className="w-5 h-5 flex-shrink-0" />
          <span>{message}</span>
        </div>
      )}
      {errorMessage && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 p-4 rounded-2xl flex items-center gap-3 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 gap-2">
        <button
          onClick={() => setActiveTab('excel_import')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'excel_import'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" /> Master Excel Sync & History
        </button>
        <button
          onClick={() => setActiveTab('backup')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'backup'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <Download className="w-4 h-4" /> System JSON Backup
        </button>
      </div>

      {/* TAB 1: MASTER EXCEL SYNC & ROLLBACK HISTORY */}
      {activeTab === 'excel_import' && (
        <div className="space-y-6">
          {/* Excel Upload Card */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-2">
              <Upload className="w-5 h-5 text-blue-600" /> Upload Branch Master Excel File
            </h2>
            <p className="text-slate-500 text-sm mb-4">
              Select branch Excel workbook (e.g. <code>PATAUDI DATA_22082026.xlsx</code>, <code>KHATAULI_22082026.xlsx</code>, <code>Haridwar.xlsx</code>). The system will dynamically parse members, loans, EMIs, collections, and DPD buckets.
            </p>

            <div className="flex flex-col sm:flex-row items-center gap-4">
              <input
                type="file"
                accept=".xlsx,.xls"
                disabled={!isIT || importStatus === 'running'}
                onChange={handleExcelFileSelect}
                className="file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 text-sm text-slate-500 cursor-pointer disabled:opacity-50"
              />

              {parsedData && (
                <button
                  onClick={executeMasterImport}
                  disabled={!isIT || importStatus === 'running'}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl transition-all shadow-md shadow-blue-500/20 flex items-center gap-2 disabled:opacity-50"
                >
                  {importStatus === 'running' ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" /> Executing Sync ({importProgress}%)
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4" /> Execute Master Sync
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Parsed Preview Box */}
            {parsedData && (
              <div className="mt-6 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                    <FileCheck className="w-4 h-4" /> File Preview Summary
                  </span>
                  <span className="text-xs font-semibold px-2.5 py-1 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded-full">
                    Branch: {parsedData.branchName}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                  <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                    <div className="text-xs text-slate-500">Members Found</div>
                    <div className="text-lg font-bold text-slate-900 dark:text-white">{parsedData.customers.length}</div>
                  </div>
                  <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                    <div className="text-xs text-slate-500">Loans Parsed</div>
                    <div className="text-lg font-bold text-slate-900 dark:text-white">{parsedData.loans.length}</div>
                  </div>
                  <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                    <div className="text-xs text-slate-500">Schedules Generated</div>
                    <div className="text-lg font-bold text-slate-900 dark:text-white">{parsedData.schedules.length}</div>
                  </div>
                  <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                    <div className="text-xs text-slate-500">Paid Installment Txns</div>
                    <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{parsedData.transactions.length}</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Upload Batch History & Step-by-Step Rollback Table */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <History className="w-5 h-5 text-blue-600" /> Upload Batch History & Step-by-Step Reversal
                </h3>
                <p className="text-slate-500 text-xs mt-0.5">
                  Review all past Excel imports. IT users can reverse/rollback any upload batch to restore database state.
                </p>
              </div>
              <button
                onClick={loadBatchHistory}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title="Refresh History"
              >
                <RefreshCw className={`w-4 h-4 ${batchLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {batches.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm">
                No past upload batches found. Upload an Excel file above to log your first batch.
              </div>
            ) : (
              <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 uppercase tracking-wider">
                    <tr>
                      <th className="p-3">Batch ID</th>
                      <th className="p-3">File Name</th>
                      <th className="p-3">Branch</th>
                      <th className="p-3">Uploaded At</th>
                      <th className="p-3">Uploaded By</th>
                      <th className="p-3 text-right">Created / Updated</th>
                      <th className="p-3 text-center">Status</th>
                      <th className="p-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                    {batches.map(b => (
                      <tr key={b.id || b.batch_id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                        <td className="p-3 font-mono font-bold text-blue-600 dark:text-blue-400">{b.batch_id}</td>
                        <td className="p-3 text-slate-900 dark:text-white font-semibold">{b.file_name}</td>
                        <td className="p-3 text-slate-600 dark:text-slate-400">{b.branch_name}</td>
                        <td className="p-3 text-slate-500">{new Date(b.uploaded_at).toLocaleString('en-IN')}</td>
                        <td className="p-3 text-slate-500">{b.uploaded_by}</td>
                        <td className="p-3 text-right">
                          <span className="text-emerald-600 font-bold">+{b.members_created || 0}</span> / <span className="text-blue-600">{b.members_updated || 0}</span>
                        </td>
                        <td className="p-3 text-center">
                          {b.status === 'ROLLED_BACK' ? (
                            <span className="px-2 py-0.5 bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 rounded-full font-bold">
                              ROLLED BACK
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 rounded-full font-bold">
                              COMPLETED
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          {b.status !== 'ROLLED_BACK' && (
                            <button
                              onClick={() => handleRollbackBatch(b)}
                              disabled={!isIT || rollingBackId === b.batch_id}
                              className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 font-bold rounded-lg transition-colors flex items-center gap-1.5 ml-auto disabled:opacity-50 text-xs"
                            >
                              {rollingBackId === b.batch_id ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <RotateCcw className="w-3.5 h-3.5" />
                              )}
                              Reverse Upload
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: SYSTEM JSON BACKUP */}
      {activeTab === 'backup' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Download className="w-5 h-5 text-blue-600" /> Export System JSON Backup
          </h2>
          <p className="text-slate-500 text-sm">
            Download a full database snapshot containing customers, loans, repayment schedules, transactions, products, and audit logs.
          </p>
          <button
            onClick={handleBackup}
            disabled={backupStatus === 'running'}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl transition-all shadow-md shadow-blue-500/20 flex items-center gap-2 disabled:opacity-50"
          >
            {backupStatus === 'running' ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" /> Exporting ({backupProgress}%)
              </>
            ) : (
              <>
                <Download className="w-4 h-4" /> Export Backup File (.json)
              </>
            )}
          </button>
        </div>
      )}
    </div>
  )
}
