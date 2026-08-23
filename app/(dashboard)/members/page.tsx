'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { getAll, putOne } from '@/lib/supabase'
import type { Customer, Loan } from '@/lib/types'
import { usePaginatedResource } from '@/lib/use-paginated-resource'
import { useRealtimeInvalidation } from '@/lib/use-realtime-invalidation'
import { exportToExcel } from '@/lib/utils'
import { TableSkeleton } from '@/components/Skeleton'
import { toast } from '@/lib/toast'
import { confirmAction } from '@/lib/confirm'
import {
  Search, UserPlus, Phone, MapPin, AlertTriangle,
  X, ShieldAlert, CheckCircle2, ScanLine, Download,
  Filter, CheckSquare, Square, Users, ArrowRight, Building2, UserCheck
} from 'lucide-react'

interface DuplicateGroup {
  type: 'mobile' | 'aadhaar' | 'name'
  value: string
  members: Customer[]
}

async function findDuplicates(): Promise<DuplicateGroup[]> {
  const all = await getAll<Customer>('customers')
  const groups: DuplicateGroup[] = []

  const byMobile: Record<string, Customer[]> = {}
  all.filter(c => c.mobile?.trim()).forEach(c => {
    const key = c.mobile.trim()
    byMobile[key] = [...(byMobile[key] || []), c]
  })
  Object.entries(byMobile).filter(([, v]) => v.length > 1).forEach(([k, v]) =>
    groups.push({ type: 'mobile', value: k, members: v }))

  const byAadhaar: Record<string, Customer[]> = {}
  all.filter(c => c.aadhar_last4?.trim()).forEach(c => {
    const key = c.aadhar_last4.trim()
    byAadhaar[key] = [...(byAadhaar[key] || []), c]
  })
  Object.entries(byAadhaar).filter(([, v]) => v.length > 1).forEach(([k, v]) =>
    groups.push({ type: 'aadhaar', value: k, members: v }))

  return groups
}

export default function MembersPage() {
  const [search, setSearch] = useState('')
  const { data: customers, page, setPage, total, totalPages, loading, error, resetToFirstPage, refresh } =
    usePaginatedResource<Customer>('customers', search)
  useRealtimeInvalidation('customers', refresh)

  // Extra context data for member badges and filters
  const [allLoans, setAllLoans] = useState<Loan[]>([])
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'CLOSED' | 'PROSPECTIVE'>('ALL')
  const [selectedBranch, setSelectedBranch] = useState('ALL')
  const [selectedFO, setSelectedFO] = useState('ALL')

  // Multi-select batch operations
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set())
  const [showReassignModal, setShowReassignModal] = useState(false)
  const [reassignFO, setReassignFO] = useState('')
  const [reassignBranch, setReassignBranch] = useState('')
  const [reassigning, setReassigning] = useState(false)

  // Duplicate detection state
  const [showDupModal, setShowDupModal] = useState(false)
  const [dupLoading, setDupLoading] = useState(false)
  const [dupGroups, setDupGroups] = useState<DuplicateGroup[]>([])

  useEffect(() => {
    getAll<Loan>('loans').then(setAllLoans).catch(console.error)
  }, [])

  // Build member loan status map
  const memberLoanStatusMap = useMemo(() => {
    const map = new Map<string, { activeCount: number; closedCount: number }>()
    allLoans.forEach(l => {
      const cid = l.customer_id
      if (!cid) return
      const entry = map.get(cid) || { activeCount: 0, closedCount: 0 }
      if (l.status === 'ACTIVE' || l.status === 'SANCTIONED') {
        entry.activeCount++
      } else if ((l.status || '').startsWith('CLOS')) {
        entry.closedCount++
      }
      map.set(cid, entry)
    })
    return map
  }, [allLoans])

  // Extract filter options
  const branchOptions = useMemo(() => {
    const set = new Set<string>()
    customers.forEach(c => { if (c.branch_code) set.add(c.branch_code) })
    allLoans.forEach(l => { if (l.branch_code) set.add(l.branch_code) })
    return Array.from(set).sort()
  }, [customers, allLoans])

  const foOptions = useMemo(() => {
    const set = new Set<string>()
    customers.forEach(c => { if (c.fo_name) set.add(c.fo_name) })
    allLoans.forEach(l => { if (l.fo_name) set.add(l.fo_name) })
    return Array.from(set).sort()
  }, [customers, allLoans])

  // Filtered customers display
  const displayedCustomers = useMemo(() => {
    return customers.filter(c => {
      if (selectedBranch !== 'ALL' && (c.branch_code || '') !== selectedBranch) return false
      if (selectedFO !== 'ALL' && (c.fo_name || '') !== selectedFO) return false

      const stat = memberLoanStatusMap.get(c.customer_id)
      const activeCount = stat?.activeCount || 0
      const closedCount = stat?.closedCount || 0

      if (statusFilter === 'ACTIVE' && activeCount === 0) return false
      if (statusFilter === 'CLOSED' && (activeCount > 0 || closedCount === 0)) return false
      if (statusFilter === 'PROSPECTIVE' && (activeCount > 0 || closedCount > 0)) return false

      return true
    })
  }, [customers, selectedBranch, selectedFO, statusFilter, memberLoanStatusMap])

  // Select all visible
  const handleToggleSelectAll = () => {
    if (selectedMemberIds.size === displayedCustomers.length && displayedCustomers.length > 0) {
      setSelectedMemberIds(new Set())
    } else {
      setSelectedMemberIds(new Set(displayedCustomers.map(c => c.customer_id)))
    }
  }

  const handleToggleSelectOne = (id: string) => {
    setSelectedMemberIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Bulk Export Selected
  const handleExportSelected = () => {
    const toExport = customers.filter(c => selectedMemberIds.has(c.customer_id))
    if (toExport.length === 0) return
    exportToExcel(
      toExport.map(c => ({
        'Member ID': c.customer_id,
        'Full Name': c.full_name,
        'Father/Husband Name': c.father_husband_name || '',
        'Mobile': c.mobile || '',
        'Aadhaar (Last 4)': c.aadhar_last4 || '',
        'PAN Card': c.pan_no || '',
        'DOB': c.dob || '',
        'Village/City': c.village_city || '',
        'Pincode': c.pincode || '',
        'District': c.district || '',
        'State': c.state || '',
        'Branch Name': c.branch_code || '',
        'BM Name': c.bm_name || '',
        'FO Name': c.fo_name || '',
      })),
      `Selected_Members_${toExport.length}`
    )
  }

  // Bulk Reassign Action
  const handleBulkReassign = async () => {
    if (!reassignFO && !reassignBranch) {
      toast.error('Missing Input', 'Please enter a new Field Officer or Branch Name.')
      return
    }
    const ok = await confirmAction({
      title: 'Confirm Bulk Assignment',
      message: `Are you sure you want to reassign ${selectedMemberIds.size} selected member(s) to FO: "${reassignFO || 'Unchanged'}" / Branch: "${reassignBranch || 'Unchanged'}"?`,
      confirmText: 'Yes, Reassign Members',
      variant: 'info'
    })
    if (!ok) return

    setReassigning(true)
    try {
      const allCust = await getAll<Customer>('customers')
      const targetCusts = allCust.filter(c => selectedMemberIds.has(c.customer_id))

      for (const c of targetCusts) {
        const updated: Customer = {
          ...c,
          fo_name: reassignFO || c.fo_name,
          branch_code: reassignBranch || c.branch_code,
          updated_at: new Date().toISOString(),
        }
        await putOne('customers', updated, 'customer_id')
      }

      toast.success('Members Reassigned', `Successfully updated ${targetCusts.length} members.`)
      setSelectedMemberIds(new Set())
      setShowReassignModal(false)
      refresh()
      window.dispatchEvent(new Event('aa2_data_changed'))
    } catch (err: any) {
      toast.error('Reassignment Failed', err.message || 'Could not complete bulk update.')
    } finally {
      setReassigning(false)
    }
  }

  async function handleCheckDuplicates() {
    setShowDupModal(true)
    setDupLoading(true)
    try {
      const groups = await findDuplicates()
      setDupGroups(groups)
    } catch (e) {
      console.error(e)
    } finally {
      setDupLoading(false)
    }
  }

  return (
    <div className="space-y-5 pb-10">
      {/* Top Header & Quick Action Buttons */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Members Directory</h1>
          <p className="text-slate-500 text-xs mt-0.5">{total} registered borrower profiles</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => exportToExcel(
              customers.map(c => ({
                'Member ID': c.customer_id,
                'Full Name': c.full_name,
                'Father/Husband Name': c.father_husband_name || '',
                'Mobile': c.mobile || '',
                'Aadhaar (Last 4)': c.aadhar_last4 || '',
                'PAN Card': c.pan_no || '',
                'DOB': c.dob || '',
                'Village/City': c.village_city || '',
                'Pincode': c.pincode || '',
                'District': c.district || '',
                'State': c.state || '',
                'Branch Name': c.branch_code || '',
                'BM Name': c.bm_name || '',
                'FO Name': c.fo_name || '',
              })),
              'All_Members_List'
            )}
            className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl transition shadow-xs"
          >
            <Download className="w-3.5 h-3.5 text-emerald-600" /> Export Excel
          </button>
          <button
            onClick={handleCheckDuplicates}
            className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl transition shadow-xs"
          >
            <ScanLine className="w-3.5 h-3.5 text-amber-600" /> Scan Duplicates
          </button>
          <Link
            href="/members/new"
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl transition shadow-sm"
          >
            <UserPlus className="w-3.5 h-3.5" /> + Onboard New Member
          </Link>
        </div>
      </div>

      {/* Multi-Criteria Filters & Omni-Search */}
      <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Status Filter Pills */}
          <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-xl border border-slate-200 text-xs">
            {(['ALL', 'ACTIVE', 'CLOSED', 'PROSPECTIVE'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setStatusFilter(tab)}
                className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                  statusFilter === tab
                    ? 'bg-white text-slate-800 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {tab === 'ALL' ? 'All Members'
                  : tab === 'ACTIVE' ? 'Active Borrowers'
                  : tab === 'CLOSED' ? 'Closed Borrowers'
                  : 'Prospective (No Loans)'}
              </button>
            ))}
          </div>

          {/* Branch Filter */}
          <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 text-xs">
            <span className="text-slate-400">Branch:</span>
            <select
              value={selectedBranch}
              onChange={e => setSelectedBranch(e.target.value)}
              className="bg-transparent font-bold text-slate-700 focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Branches ({branchOptions.length})</option>
              {branchOptions.map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>

          {/* Field Officer Filter */}
          <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 text-xs">
            <span className="text-slate-400">Officer:</span>
            <select
              value={selectedFO}
              onChange={e => setSelectedFO(e.target.value)}
              className="bg-transparent font-bold text-slate-700 focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Officers ({foOptions.length})</option>
              {foOptions.map(fo => (
                <option key={fo} value={fo}>{fo}</option>
              ))}
            </select>
          </div>

          {(selectedBranch !== 'ALL' || selectedFO !== 'ALL' || statusFilter !== 'ALL' || search) && (
            <button
              onClick={() => {
                setSelectedBranch('ALL')
                setSelectedFO('ALL')
                setStatusFilter('ALL')
                setSearch('')
                resetToFirstPage()
              }}
              className="text-blue-600 hover:underline font-bold text-[11px] ml-auto"
            >
              Reset Filters
            </button>
          )}
        </div>

        {/* Omni Search Input */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by member name, Member ID (MEM-XXXXX), mobile number, Aadhaar suffix, PAN, or village…"
            value={search}
            onChange={e => { setSearch(e.target.value); resetToFirstPage() }}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
          />
        </div>
      </div>

      {/* Sticky Batch Operations Bar */}
      {selectedMemberIds.size > 0 && (
        <div className="bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-lg flex flex-wrap items-center justify-between gap-3 text-xs animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <CheckSquare className="w-4 h-4 text-blue-400" />
            <span className="font-bold">{selectedMemberIds.size} Member(s) Selected</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportSelected}
              className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg font-semibold transition"
            >
              Export Selected
            </button>
            <button
              onClick={() => setShowReassignModal(true)}
              className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold transition"
            >
              Bulk Reassign FO/Branch
            </button>
            <button
              onClick={() => setSelectedMemberIds(new Set())}
              className="px-2 py-1 text-slate-400 hover:text-white transition"
            >
              Clear Selection
            </button>
          </div>
        </div>
      )}

      {/* Members Directory Table */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-400 uppercase tracking-wide text-[10px]">
                <th className="px-4 py-3 text-center w-10">
                  <button onClick={handleToggleSelectAll} className="p-0.5 text-slate-400 hover:text-slate-600">
                    {selectedMemberIds.size > 0 && selectedMemberIds.size === displayedCustomers.length
                      ? <CheckSquare className="w-3.5 h-3.5 text-blue-600" />
                      : <Square className="w-3.5 h-3.5" />}
                  </button>
                </th>
                <th className="text-left px-4 py-3 font-semibold">Member ID</th>
                <th className="text-left px-4 py-3 font-semibold">Borrower Name</th>
                <th className="text-left px-4 py-3 font-semibold">Status / Loans</th>
                <th className="text-left px-4 py-3 font-semibold">Contact / Village</th>
                <th className="text-left px-4 py-3 font-semibold">Branch & FO</th>
                <th className="text-right px-4 py-3 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading && (
                <tr>
                  <td colSpan={7} className="p-4">
                    <TableSkeleton rows={5} cols={6} />
                  </td>
                </tr>
              )}
              {!loading && error && <tr><td colSpan={7} className="px-5 py-10 text-center text-red-500">{error}</td></tr>}
              {!loading && !error && displayedCustomers.length === 0 && (
                <tr><td colSpan={7} className="px-5 py-10 text-center text-slate-400">No member records match the selected filters.</td></tr>
              )}
              {displayedCustomers.map(c => {
                const stat = memberLoanStatusMap.get(c.customer_id)
                const activeCount = stat?.activeCount || 0
                const closedCount = stat?.closedCount || 0
                const isSelected = selectedMemberIds.has(c.customer_id)

                return (
                  <tr key={c.customer_id} className={`hover:bg-slate-50/60 transition ${isSelected ? 'bg-blue-50/40' : ''}`}>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => handleToggleSelectOne(c.customer_id)} className="p-0.5 text-slate-400 hover:text-slate-600">
                        {isSelected ? <CheckSquare className="w-3.5 h-3.5 text-blue-600" /> : <Square className="w-3.5 h-3.5" />}
                      </button>
                    </td>
                    <td className="px-4 py-3 font-mono text-blue-600 font-bold">
                      <Link href={`/members/${c.customer_id}`} className="hover:underline">
                        {c.customer_id}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-bold text-slate-800">
                      <Link href={`/members/${c.customer_id}`} className="hover:underline">
                        {c.full_name}
                      </Link>
                      <p className="text-[10.5px] font-normal text-slate-400 mt-0.5">S/O, W/O: {c.father_husband_name || '—'}</p>
                    </td>
                    <td className="px-4 py-3">
                      {activeCount > 0 ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9.5px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Active ({activeCount} loan{activeCount > 1 ? 's' : ''})
                        </span>
                      ) : closedCount > 0 ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9.5px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                          Closed ({closedCount})
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9.5px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                          Prospective
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <div className="flex items-center gap-1 font-mono text-slate-700">
                        <Phone className="w-3 h-3 text-slate-400" /> {c.mobile || '—'}
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5 truncate max-w-[140px]">{c.village_city || '—'}, {c.district || ''}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <p className="font-semibold text-slate-700">{c.branch_code || 'Head Office'}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">FO: {c.fo_name || '—'}</p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/members/${c.customer_id}`}
                        className="text-[11px] font-bold text-blue-600 hover:underline inline-flex items-center gap-1"
                      >
                        Profile <ArrowRight className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {total > 0 && (
          <div className="px-5 py-3 border-t border-slate-50 bg-slate-50/50 flex items-center justify-between gap-4">
            <p className="text-xs text-slate-400">Page {page} of {totalPages} · {total} total registered members</p>
            <div className="flex gap-2">
              <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 disabled:opacity-40">Previous</button>
              <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </div>

      {/* Bulk Reassign Modal */}
      {showReassignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-800 text-sm">Bulk Reassign ({selectedMemberIds.size} Members)</h3>
              <button onClick={() => setShowReassignModal(false)} className="p-1 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-600 block mb-1">New Field Officer Name</label>
                <input
                  type="text"
                  placeholder="e.g. Ramesh Kumar"
                  value={reassignFO}
                  onChange={e => setReassignFO(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-600 block mb-1">New Branch Name</label>
                <input
                  type="text"
                  placeholder="e.g. Jaipur"
                  value={reassignBranch}
                  onChange={e => setReassignBranch(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button onClick={() => setShowReassignModal(false)} className="px-3 py-1.5 border border-slate-200 rounded-xl text-xs font-semibold">Cancel</button>
              <button onClick={handleBulkReassign} disabled={reassigning} className="px-4 py-1.5 bg-blue-600 text-white rounded-xl text-xs font-bold disabled:opacity-50">
                {reassigning ? 'Updating...' : 'Save Reassignment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Duplicate Scan Modal */}
      {showDupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-amber-500" />
                <h2 className="font-bold text-slate-800">Duplicate Member Validation</h2>
              </div>
              <button onClick={() => setShowDupModal(false)} className="p-1.5 hover:bg-slate-100 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {dupLoading && (
                <div className="py-12 text-center text-slate-400">
                  <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                  Scanning all members for duplicates…
                </div>
              )}
              {!dupLoading && dupGroups.length === 0 && (
                <div className="py-10 text-center">
                  <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
                  <p className="font-semibold text-slate-700">No duplicates found!</p>
                  <p className="text-sm text-slate-400 mt-1">All member mobile numbers and Aadhaar suffixes are unique.</p>
                </div>
              )}
              {!dupLoading && dupGroups.length > 0 && (
                <>
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 flex gap-2">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <p>Found <strong>{dupGroups.length} duplicate group(s)</strong>. Review and take corrective action for each group.</p>
                  </div>
                  {dupGroups.map((group, i) => (
                    <div key={i} className="border border-amber-200 bg-amber-50/30 rounded-xl overflow-hidden">
                      <div className="px-4 py-2.5 bg-amber-100/60 flex items-center gap-2 text-xs font-bold text-amber-800 uppercase tracking-wider">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Duplicate {group.type === 'mobile' ? 'Mobile' : 'Aadhaar Suffix'}: {group.value}
                        <span className="ml-auto font-normal text-amber-600">{group.members.length} records</span>
                      </div>
                      <div className="divide-y divide-amber-100">
                        {group.members.map(m => (
                          <div key={m.customer_id} className="px-4 py-2.5 flex items-center justify-between gap-4 text-xs">
                            <div>
                              <p className="font-bold text-slate-800">{m.full_name} <span className="font-mono text-blue-600 font-semibold">({m.customer_id})</span></p>
                              <p className="text-slate-500 text-[11px]">{m.village_city || '—'}, {m.district || '—'} · Branch: {m.branch_code || '—'}</p>
                            </div>
                            <Link href={`/members/${m.customer_id}`} className="px-2.5 py-1 bg-white border border-amber-300 text-amber-800 hover:bg-amber-50 rounded-lg text-xs font-bold">
                              View
                            </Link>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
