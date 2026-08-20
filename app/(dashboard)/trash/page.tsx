'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { getTrashItems, restoreFromTrash, type TrashItem } from '@/lib/trash'
import { fdate } from '@/lib/utils'
import {
  Trash2, RotateCcw, ShieldAlert, Search, RefreshCw, CheckCircle, AlertCircle, FileText, User, Landmark, HelpCircle
} from 'lucide-react'
import { confirmAction } from '@/lib/confirm'

export default function TrashRecoveryPage() {
  const { user } = useAuth()
  const [items, setItems] = useState<TrashItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [storeFilter, setStoreFilter] = useState('ALL')
  const [actionMsg, setActionMsg] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [restoringId, setRestoringId] = useState<string | null>(null)

  const isIT = user?.role === 'it'

  useEffect(() => {
    if (isIT) loadTrash()
    else setLoading(false)
    const handler = () => { if (isIT) loadTrash() }
    window.addEventListener('aa2_data_changed', handler)
    return () => window.removeEventListener('aa2_data_changed', handler)
  }, [isIT])

  async function loadTrash() {
    setLoading(true)
    setErrorMsg('')
    try {
      const data = await getTrashItems()
      setItems(data)
    } catch (err: any) {
      console.error(err)
      setErrorMsg(err.message || 'Failed to load Trash items.')
    } finally {
      setLoading(false)
    }
  }

  async function handleRestore(item: TrashItem) {
    const ok = await confirmAction({
      title: 'Confirm Restore',
      message: `Restore "${item.title}" (${item.store_name}) back into the active database?`,
      confirmText: 'Restore Item',
      variant: 'warning',
    })
    if (!ok) return
    setRestoringId(item.trash_id)
    setActionMsg('')
    setErrorMsg('')
    try {
      await restoreFromTrash(item.trash_id, user?.email || 'system')
      if (item.store_name === 'transactions' && item.data?.loan_account_no) {
        const { recalcLoanLedger } = await import('@/lib/calculations')
        await recalcLoanLedger(item.data.loan_account_no)
      }
      setActionMsg(`Successfully restored "${item.title}" back into ${item.store_name}.`)
      await loadTrash()
    } catch (err: any) {
      console.error(err)
      setErrorMsg(err.message || 'Restoration failed.')
    } finally {
      setRestoringId(null)
    }
  }

  // Access Control Guard — IT Role Only
  if (!isIT) {
    return (
      <div className="max-w-xl mx-auto my-12 bg-white rounded-2xl p-8 shadow-sm border border-red-100 text-center space-y-4">
        <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-800">Access Restricted</h2>
          <p className="text-slate-500 text-sm mt-1">
            The Trash Can & Item Recovery portal is accessible exclusively to <strong className="text-slate-700">IT Administrator IDs</strong>.
          </p>
        </div>
        <p className="text-xs text-slate-400">
          Your current account role: <span className="font-mono uppercase font-bold text-slate-600">{user?.role || 'Guest'}</span>
        </p>
      </div>
    )
  }

  const filtered = items.filter(i => {
    const q = search.toLowerCase()
    const matchQ = !q ||
      (i.title || '').toLowerCase().includes(q) ||
      (i.record_id || '').toLowerCase().includes(q) ||
      (i.deleted_by || '').toLowerCase().includes(q)
    const matchStore = storeFilter === 'ALL' || i.store_name === storeFilter
    return matchQ && matchStore
  })

  function getStoreIcon(store: string) {
    switch (store) {
      case 'customers': return <User className="w-4 h-4 text-blue-500" />
      case 'loans': return <Landmark className="w-4 h-4 text-emerald-500" />
      case 'documents': return <FileText className="w-4 h-4 text-purple-500" />
      case 'grievances': return <HelpCircle className="w-4 h-4 text-amber-500" />
      default: return <Trash2 className="w-4 h-4 text-slate-400" />
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-800">Trash Can & Recovery</h1>
            <span className="px-2.5 py-0.5 bg-red-100 text-red-700 text-[10px] font-extrabold uppercase rounded-full tracking-wider">
              IT Security Only
            </span>
          </div>
          <p className="text-slate-500 text-sm mt-0.5">
            Soft-deleted members, loans, and documents. Restore items back to active status at any time.
          </p>
        </div>
        <button
          onClick={loadTrash}
          className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl text-xs font-semibold transition"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh Trash
        </button>
      </div>

      {actionMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 p-4 rounded-2xl text-xs font-semibold flex items-center gap-2">
          <CheckCircle className="w-4 h-4 flex-shrink-0" /> {actionMsg}
        </div>
      )}
      {errorMsg && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-2xl text-xs font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {errorMsg}
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by title, record ID, or user who deleted…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <select
          value={storeFilter}
          onChange={e => setStoreFilter(e.target.value)}
          className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none"
        >
          <option value="ALL">All Categories ({items.length})</option>
          <option value="customers">Members ({items.filter(i => i.store_name === 'customers').length})</option>
          <option value="loans">Loans ({items.filter(i => i.store_name === 'loans').length})</option>
          <option value="documents">Documents ({items.filter(i => i.store_name === 'documents').length})</option>
          <option value="grievances">Grievances ({items.filter(i => i.store_name === 'grievances').length})</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-wide">
                <th className="text-left px-5 py-3 font-semibold">Category</th>
                <th className="text-left px-5 py-3 font-semibold">Item Title / ID</th>
                <th className="text-left px-5 py-3 font-semibold">Deleted Date</th>
                <th className="text-left px-5 py-3 font-semibold">Deleted By</th>
                <th className="text-center px-5 py-3 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-slate-400">
                    <span className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin inline-block mr-2" />
                    Loading Trash Can records…
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400">
                    <Trash2 className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    <p className="font-semibold text-sm text-slate-600">Trash Can is Empty</p>
                    <p className="text-xs text-slate-400 mt-0.5">No deleted items match the selected criteria.</p>
                  </td>
                </tr>
              )}
              {!loading && filtered.map((item, idx) => (
                <tr key={item.trash_id || `trash-${item.store_name}-${idx}`} className="hover:bg-slate-50/50 transition">
                  <td className="px-5 py-3">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 rounded-lg font-bold text-slate-700 uppercase text-[9px]">
                      {getStoreIcon(item.store_name)} {item.store_name}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="font-bold text-slate-800">{item.title}</div>
                    <div className="text-[10px] font-mono text-slate-400">ID: {item.record_id}</div>
                  </td>
                  <td className="px-5 py-3 text-slate-600 font-medium">
                    {fdate(item.deleted_at)}
                  </td>
                  <td className="px-5 py-3 text-slate-500 font-mono text-[11px]">
                    {item.deleted_by}
                  </td>
                  <td className="px-5 py-3 text-center">
                    <button
                      onClick={() => handleRestore(item)}
                      disabled={restoringId === item.trash_id}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition shadow-sm"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      {restoringId === item.trash_id ? 'Restoring…' : 'Restore Record'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
