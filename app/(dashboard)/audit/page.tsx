'use client'

import { useEffect, useState } from 'react'
import { getAll } from '@/lib/supabase'
import { fdatetime } from '@/lib/utils'
import { Search, Calendar, ShieldCheck, Download, AlertCircle } from 'lucide-react'

import { getAuditLogs } from '@/lib/audit'

interface AuditLogRecord {
  id: string
  ts: string
  entity_type: string
  entity_id: string
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'RESOLVE' | 'CANCEL' | 'REOPEN'
  summary: string
  changes?: { field: string; from: any; to: any }[]
  user: string
}

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLogRecord[]>([])
  const [loading, setLoading] = useState(true)

  // Filters State
  const [search, setSearch] = useState('')
  const [entityFilter, setEntityFilter] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  useEffect(() => {
    loadAuditLogs()
    const handler = () => loadAuditLogs()
    window.addEventListener('aa2_data_changed', handler)
    return () => window.removeEventListener('aa2_data_changed', handler)
  }, [])

  async function loadAuditLogs() {
    setLoading(true)
    try {
      const [newLogs, oldLogs] = await Promise.all([
        getAuditLogs(),
        getAll<AuditLogRecord>('audit_log').catch(() => []),
      ])

      const mappedNew: AuditLogRecord[] = newLogs.map(n => ({
        id: n.log_id,
        ts: n.timestamp,
        entity_type: n.entity_type,
        entity_id: n.entity_id,
        action: (n.event_type.includes('COLLECT') || n.event_type.includes('SANCTION') || n.event_type.includes('CREATE')) ? 'CREATE'
          : n.event_type.includes('DELETE') ? 'DELETE'
          : n.event_type.includes('SETTLE') ? 'RESOLVE'
          : 'UPDATE',
        summary: n.narration,
        user: `${n.actor_name} (${n.actor_email})`,
      }))

      const combined = [...mappedNew, ...oldLogs]
      setLogs(combined.sort((a, b) => (b.ts || '').localeCompare(a.ts || '')))
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // Filter local logs
  const filtered = logs.filter(l => {
    const q = search.toLowerCase()
    
    const matchSearch = !q ||
      (l.entity_id || '').toLowerCase().includes(q) ||
      (l.summary || '').toLowerCase().includes(q) ||
      (l.user || '').toLowerCase().includes(q)
      
    const matchEntity = !entityFilter || l.entity_type === entityFilter
    const matchAction = !actionFilter || l.action === actionFilter
    
    // ts format: YYYY-MM-DDTHH:MM:SSZ
    const matchFrom = !fromDate || l.ts >= fromDate
    const matchTo = !toDate || l.ts <= toDate + 'T23:59:59Z'

    return matchSearch && matchEntity && matchAction && matchFrom && matchTo
  })

  // Export Audit Logs as CSV
  const exportLogs = () => {
    let csv = 'AUDIT LOG REPORT\nTimestamp,Entity Type,Record ID,Action,Summary,User\n'
    filtered.forEach(l => {
      csv += `"${fdatetime(l.ts)}","${l.entity_type}","${l.entity_id}","${l.action}","${l.summary.replace(/"/g, '""')}","${l.user}"\n`
    })

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.setAttribute('download', `Audit_Logs_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">System Audit Logs</h1>
          <p className="text-slate-500 text-sm mt-0.5">Immutable records of all database writes, logins, and settings updates.</p>
        </div>
        <button
          onClick={exportLogs}
          disabled={filtered.length === 0}
          className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold rounded-xl transition"
        >
          <Download className="w-3.5 h-3.5" /> Export Logs
        </button>
      </div>

      {/* Filters Bar */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
        
        {/* Search */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Search</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="ID, summary, user…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none"
            />
          </div>
        </div>

        {/* Entity Type */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Entity Type</label>
          <select
            value={entityFilter}
            onChange={e => setEntityFilter(e.target.value)}
            className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none"
          >
            <option value="">All Entities</option>
            <option value="Member">Member / Customer</option>
            <option value="Loan">Loan Account</option>
            <option value="Transaction">Transaction</option>
            <option value="Grievance">Grievance</option>
            <option value="Document">Document</option>
            <option value="User">User Profile</option>
          </select>
        </div>

        {/* Action Filter */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Action</label>
          <select
            value={actionFilter}
            onChange={e => setActionFilter(e.target.value)}
            className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none"
          >
            <option value="">All Actions</option>
            <option value="CREATE">CREATE</option>
            <option value="UPDATE">UPDATE</option>
            <option value="DELETE">DELETE</option>
            <option value="RESOLVE">RESOLVE</option>
            <option value="CANCEL">CANCEL</option>
            <option value="REOPEN">REOPEN</option>
          </select>
        </div>

        {/* From Date */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">From Date</label>
          <input
            type="date"
            value={fromDate}
            onChange={e => setFromDate(e.target.value)}
            className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none"
          />
        </div>

        {/* To Date */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">To Date</label>
          <input
            type="date"
            value={toDate}
            onChange={e => setToDate(e.target.value)}
            className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none"
          />
        </div>

      </div>

      {/* Main Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-wide">
                <th className="text-left px-5 py-3 font-semibold">Timestamp</th>
                <th className="text-left px-5 py-3 font-semibold">Entity</th>
                <th className="text-left px-5 py-3 font-semibold">Record ID</th>
                <th className="text-center px-5 py-3 font-semibold">Action</th>
                <th className="text-left px-5 py-3 font-semibold">Activity Summary</th>
                <th className="text-left px-5 py-3 font-semibold">User</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-slate-400">Loading audit log stream…</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-slate-400">No matching activities found</td></tr>
              )}
              {filtered.map((l, i) => (
                <tr key={l.id || i} className="tbl-row align-middle">
                  <td className="px-5 py-3 text-slate-500 font-semibold">{fdatetime(l.ts)}</td>
                  <td className="px-5 py-3 text-slate-600 font-medium">{l.entity_type}</td>
                  <td className="px-5 py-3 font-mono text-[10px] text-blue-600 font-semibold">{l.entity_id}</td>
                  <td className="px-5 py-3 text-center">
                    <span className={`badge text-[9px] ${
                      l.action === 'CREATE' ? 'bg-emerald-50 text-emerald-700' :
                      l.action === 'DELETE' ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'
                    }`}>{l.action}</span>
                  </td>
                  <td className="px-5 py-3 text-slate-700 font-medium">
                    <div>{l.summary}</div>
                    {l.changes && l.changes.length > 0 && (
                      <div className="text-[10px] text-slate-400 mt-1 font-mono leading-relaxed">
                        Changes: {l.changes.map(c => `${c.field}: ${JSON.stringify(c.from)} → ${JSON.stringify(c.to)}`).join('; ')}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3 text-slate-500 font-bold">{l.user || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-slate-50 border border-slate-200/50 p-4 rounded-xl flex gap-2 items-start text-xs text-slate-500 leading-relaxed">
        <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
        <p>
          Audit logs are permanently generated by write events. In production configurations, these records are write-once read-many (WORM) compliant for regulatory audits.
        </p>
      </div>
    </div>
  )
}
