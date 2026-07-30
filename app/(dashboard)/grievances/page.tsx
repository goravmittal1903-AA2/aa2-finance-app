'use client'

import { useEffect, useState } from 'react'
import { getAll, getOne, putOne } from '@/lib/supabase'
import type { Customer, Grievance } from '@/lib/types'
import { fdate, fdatetime, todayISO } from '@/lib/utils'
import { Search, MessageSquare, AlertTriangle, Eye, Send, RotateCcw, CheckCircle2, XCircle } from 'lucide-react'

import { useAuth } from '@/lib/auth-context'

const CATEGORIES = ['Calculations Discrepancy', 'Staff Misbehaviour', 'Wrong Mobile/Details', 'Payment Receipt Missing', 'Other']
const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH']

export default function GrievancesPage() {
  const { user } = useAuth()
  const [grievances, setGrievances] = useState<Grievance[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [selectedTicket, setSelectedTicket] = useState<Grievance | null>(null)

  const activeUserEmail = user?.email || 'Management@aa2finance.com'
  
  // Create Form State
  const [newGrv, setNewGrv] = useState({
    customer_id: '',
    category: 'Calculations Discrepancy',
    severity: 'MEDIUM',
    description: ''
  })
  const [submitting, setSubmitting] = useState(false)

  // Action Form State
  const [actionNotes, setActionNotes] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  useEffect(() => {
    loadData()
    const handler = () => loadData()
    window.addEventListener('aa2_data_changed', handler)
    return () => window.removeEventListener('aa2_data_changed', handler)
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [g, c] = await Promise.all([
        getAll<Grievance>('grievances'),
        getAll<Customer>('customers')
      ])
      setGrievances(g.sort((a,b) => (b.created_at || '').localeCompare(a.created_at || '')))
      setCustomers(c.sort((a,b) => (a.full_name || '').localeCompare(b.full_name || '')))
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newGrv.customer_id || !newGrv.description) return
    setSubmitting(true)

    try {
      const customer = customers.find(c => c.customer_id === newGrv.customer_id)
      if (!customer) throw new Error('Member not found')

      const ticketId = 'GRV-' + Date.now().toString().slice(-7)
      const now = new Date().toISOString()
      
      const newGrievance: Grievance = {
        ticket_id: ticketId,
        customer_id: newGrv.customer_id,
        member_name: customer.full_name,
        loan_account_no: '', // Optional or linkable
        category: newGrv.category,
        severity: newGrv.severity,
        description: newGrv.description,
        status: 'Open',
        resolution_notes: '',
        resolved_date: null,
        resolved_by: null,
        created_at: now,
        created_by: activeUserEmail,
      }
      
      // Seed history log
      const historyItem = {
        action: 'FILED',
        user: activeUserEmail,
        date: now,
        notes: 'Grievance filed: ' + newGrv.description
      }
      ;(newGrievance as any).history = [historyItem]

      await putOne('grievances', newGrievance, 'ticket_id')
      setNewGrv({
        customer_id: '',
        category: 'Calculations Discrepancy',
        severity: 'MEDIUM',
        description: ''
      })
      await loadData()
      alert(`Grievance ticket ${ticketId} filed successfully.`)
    } catch (err: any) {
      alert(err.message || 'Failed to file grievance')
    } finally {
      setSubmitting(false)
    }
  }

  const handleTicketAction = async (action: 'RESOLVED' | 'CANCELLED' | 'REOPENED') => {
    if (!selectedTicket) return
    if (!actionNotes.trim()) {
      alert('Please enter action notes / reason.')
      return
    }

    setActionLoading(true)
    try {
      const ticket = await getOne<Grievance>('grievances', selectedTicket.ticket_id)
      if (!ticket) throw new Error('Ticket not found')

      const now = new Date().toISOString()
      
      // Update ticket status
      if (action === 'RESOLVED') {
        ticket.status = 'Resolved'
        ticket.resolution_notes = actionNotes
        ticket.resolved_date = todayISO()
        ticket.resolved_by = activeUserEmail
      } else if (action === 'CANCELLED') {
        ticket.status = 'Closed' // using Closed as Cancelled state mapping
        ticket.resolution_notes = 'Cancelled: ' + actionNotes
        ticket.resolved_date = todayISO()
        ticket.resolved_by = activeUserEmail
      } else if (action === 'REOPENED') {
        ticket.status = 'Open' // set back to Open
        ticket.resolution_notes = ''
        ticket.resolved_date = null
        ticket.resolved_by = null
      }

      // Add to history
      const historyList = (ticket as any).history || []
      historyList.push({
        action,
        user: activeUserEmail,
        date: now,
        notes: actionNotes
      })
      ;(ticket as any).history = historyList

      await putOne('grievances', ticket, 'ticket_id')
      
      setActionNotes('')
      setSelectedTicket(null)
      await loadData()
      alert(`Ticket status updated to ${action}.`)
    } catch (err: any) {
      alert(err.message || 'Action failed')
    } finally {
      setActionLoading(false)
    }
  }

  // Filter local tickets
  const filtered = grievances.filter(g => {
    const q = search.toLowerCase()
    return !q ||
      g.ticket_id?.toLowerCase().includes(q) ||
      g.member_name?.toLowerCase().includes(q) ||
      g.customer_id?.toLowerCase().includes(q) ||
      g.category?.toLowerCase().includes(q)
  })

  const openTicketsCount = grievances.filter(g => g.status === 'Open' || g.status === 'In Progress').length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Grievance & Support Logs</h1>
        <p className="text-slate-500 text-sm mt-0.5">{openTicketsCount} open tickets / {grievances.length} total tickets filed</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: File Ticket Form */}
        <div className="lg:col-span-1 bg-white rounded-2xl p-6 shadow-sm border border-slate-100 space-y-4 h-fit">
          <h3 className="text-sm font-bold text-slate-800 pb-2 border-b border-slate-100 flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-blue-500" /> Log New Grievance
          </h3>

          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Member *</label>
              <select
                value={newGrv.customer_id}
                onChange={e => setNewGrv(prev => ({ ...prev, customer_id: e.target.value }))}
                required
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">-- Choose Member --</option>
                {customers.map(c => (
                  <option key={c.customer_id} value={c.customer_id}>{c.full_name} ({c.customer_id})</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Category</label>
              <select
                value={newGrv.category}
                onChange={e => setNewGrv(prev => ({ ...prev, category: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none"
              >
                {CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Severity</label>
              <select
                value={newGrv.severity}
                onChange={e => setNewGrv(prev => ({ ...prev, severity: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none"
              >
                {SEVERITIES.map(sev => (
                  <option key={sev} value={sev}>{sev}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Complaint Description *</label>
              <textarea
                value={newGrv.description}
                onChange={e => setNewGrv(prev => ({ ...prev, description: e.target.value }))}
                required
                rows={3}
                placeholder="Enter details of the issue..."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-semibold rounded-xl text-xs transition shadow-md shadow-blue-500/10"
            >
              <Send className="w-3.5 h-3.5" /> {submitting ? 'Submitting…' : 'File Complaint Ticket'}
            </button>
          </form>
        </div>

        {/* Right Column: List & Details Modal */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            {/* Search */}
            <div className="p-4 border-b border-slate-100 bg-slate-50/50">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search tickets by ID, member name, category…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-wide">
                    <th className="text-left px-5 py-3 font-semibold">Ticket ID</th>
                    <th className="text-left px-5 py-3 font-semibold">Member</th>
                    <th className="text-left px-5 py-3 font-semibold">Category</th>
                    <th className="text-center px-5 py-3 font-semibold">Severity</th>
                    <th className="text-left px-5 py-3 font-semibold">Filed Date</th>
                    <th className="text-center px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading && (
                    <tr><td colSpan={7} className="px-5 py-8 text-center text-slate-400">Loading grievances…</td></tr>
                  )}
                  {!loading && filtered.length === 0 && (
                    <tr><td colSpan={7} className="px-5 py-8 text-center text-slate-400">No support tickets found</td></tr>
                  )}
                  {filtered.map(g => (
                    <tr key={g.ticket_id} className="tbl-row">
                      <td className="px-5 py-3 font-mono text-[10px] text-blue-600 font-semibold">{g.ticket_id}</td>
                      <td className="px-5 py-3">
                        <div className="font-semibold text-slate-800">{g.member_name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{g.customer_id}</div>
                      </td>
                      <td className="px-5 py-3 text-slate-600">{g.category}</td>
                      <td className="px-5 py-3 text-center">
                        <span className={`badge text-[9px] ${
                          g.severity === 'HIGH' ? 'bg-red-50 text-red-700' :
                          g.severity === 'MEDIUM' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'
                        }`}>{g.severity}</span>
                      </td>
                      <td className="px-5 py-3 text-slate-500">{fdate(g.created_at)}</td>
                      <td className="px-5 py-3 text-center">
                        <span className={`badge text-[9px] ${
                          g.status === 'Resolved' ? 'bg-emerald-50 text-emerald-700' :
                          g.status === 'Open' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-600'
                        }`}>{g.status}</span>
                      </td>
                      <td className="px-5 py-3">
                        <button
                          onClick={() => {
                            // Backwards compatibility build log if not present
                            if (!(g as any).history) {
                              const filedDate = g.created_at || new Date().toISOString()
                              const hist = [
                                { action: 'FILED', user: g.created_by || 'System', date: filedDate, notes: g.description }
                              ]
                              if (g.status === 'Resolved' || g.status === 'Closed') {
                                hist.push({
                                  action: g.status.toUpperCase(),
                                  user: g.resolved_by || 'System',
                                  date: g.resolved_date || filedDate,
                                  notes: g.resolution_notes || 'Resolved and closed.'
                                })
                              }
                              ;(g as any).history = hist
                            }
                            setSelectedTicket(g)
                          }}
                          className="flex items-center gap-1 text-xs text-blue-600 font-semibold hover:underline"
                        >
                          <Eye className="w-3.5 h-3.5" /> View Log
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </div>

      {/* Detail Overlay Dialog */}
      {selectedTicket && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-100 max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-800">Grievance Ticket: {selectedTicket.ticket_id}</h3>
              <button onClick={() => { setSelectedTicket(null); setActionNotes(''); }} className="text-slate-400 hover:text-slate-600 text-lg">&times;</button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-3.5 rounded-xl border border-slate-100 font-medium">
              <div><span className="text-slate-400 block mb-0.5">Status</span><span className="badge text-[9px] bg-blue-50 text-blue-700">{selectedTicket.status}</span></div>
              <div><span className="text-slate-400 block mb-0.5">Severity</span><span className="badge text-[9px] bg-amber-50 text-amber-700">{selectedTicket.severity}</span></div>
              <div className="col-span-2"><span className="text-slate-400 block mb-0.5">Member</span><span className="text-slate-700">{selectedTicket.member_name} ({selectedTicket.customer_id})</span></div>
              <div><span className="text-slate-400 block mb-0.5">Category</span><span className="text-slate-700">{selectedTicket.category}</span></div>
              <div><span className="text-slate-400 block mb-0.5">Filed Date</span><span className="text-slate-700">{fdate(selectedTicket.created_at)}</span></div>
              {selectedTicket.resolution_notes && (
                <div className="col-span-2 border-t border-slate-200/50 pt-2"><span className="text-slate-400 block mb-0.5">Resolution Notes</span><span className="text-slate-700 leading-relaxed block">{selectedTicket.resolution_notes}</span></div>
              )}
            </div>

            <div className="space-y-1">
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Original Complaint Description</h4>
              <p className="bg-slate-50/50 p-3 border border-slate-100 rounded-lg text-xs leading-relaxed text-slate-700">
                {selectedTicket.description}
              </p>
            </div>

            {/* Timeline */}
            <div className="space-y-3">
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">History Log & Action Timeline</h4>
              <div className="space-y-3.5 max-h-48 overflow-y-auto pr-1">
                {((selectedTicket as any).history || []).map((h: any, i: number) => (
                  <div key={i} className="pl-3.5 border-l-2 border-slate-200 relative text-xs">
                    <div className="absolute -left-1.5 top-1 w-2.5 h-2.5 rounded-full bg-blue-500 border-2 border-white" />
                    <div className="text-[10px] text-slate-400">{fdatetime(h.date)} &middot; <strong className="text-slate-500">{h.user}</strong></div>
                    <div className="font-bold text-slate-700 mt-0.5">{h.action}</div>
                    <p className="text-slate-500 mt-1 leading-relaxed">{h.notes}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Action Form */}
            <div className="border-t border-slate-100 pt-4 space-y-3">
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Submit Action Remarks</h4>
              <textarea
                value={actionNotes}
                onChange={e => setActionNotes(e.target.value)}
                placeholder="Enter resolution notes, cancellation reason, or reopen description..."
                rows={2}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none"
              />
              
              <div className="flex gap-2">
                {selectedTicket.status !== 'Resolved' && selectedTicket.status !== 'Closed' ? (
                  <>
                    <button
                      onClick={() => handleTicketAction('RESOLVED')}
                      disabled={actionLoading}
                      className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs font-bold rounded-xl transition shadow-md shadow-emerald-500/10"
                    >
                      Resolve Ticket
                    </button>
                    <button
                      onClick={() => handleTicketAction('CANCELLED')}
                      disabled={actionLoading}
                      className="flex-1 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white text-xs font-bold rounded-xl transition shadow-md shadow-red-500/10"
                    >
                      Cancel Ticket
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => handleTicketAction('REOPENED')}
                    disabled={actionLoading}
                    className="w-full py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-60 text-white text-xs font-bold rounded-xl transition shadow-md shadow-amber-500/10 flex items-center justify-center gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Reopen Ticket
                  </button>
                )}
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  )
}
