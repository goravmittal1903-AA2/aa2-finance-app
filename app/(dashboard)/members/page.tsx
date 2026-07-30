'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getAll } from '@/lib/supabase'
import type { Customer } from '@/lib/types'
import { usePaginatedResource } from '@/lib/use-paginated-resource'
import { useRealtimeInvalidation } from '@/lib/use-realtime-invalidation'
import {
  Search, UserPlus, Phone, MapPin, AlertTriangle,
  X, ShieldAlert, CheckCircle2, ScanLine
} from 'lucide-react'

// ── Duplicate Detection Types ──────────────────────────────────────────────────
interface DuplicateGroup {
  type: 'mobile' | 'aadhaar' | 'name'
  value: string
  members: Customer[]
}

async function findDuplicates(): Promise<DuplicateGroup[]> {
  const all = await getAll<Customer>('customers')
  const groups: DuplicateGroup[] = []

  // By Mobile
  const byMobile: Record<string, Customer[]> = {}
  all.filter(c => c.mobile?.trim()).forEach(c => {
    const key = c.mobile.trim()
    byMobile[key] = [...(byMobile[key] || []), c]
  })
  Object.entries(byMobile).filter(([, v]) => v.length > 1).forEach(([k, v]) =>
    groups.push({ type: 'mobile', value: k, members: v }))

  // By Aadhaar last 4 + name similarity
  const byAadhaar: Record<string, Customer[]> = {}
  all.filter(c => c.aadhar_last4?.trim()).forEach(c => {
    const key = c.aadhar_last4.trim()
    byAadhaar[key] = [...(byAadhaar[key] || []), c]
  })
  Object.entries(byAadhaar).filter(([, v]) => v.length > 1).forEach(([k, v]) =>
    groups.push({ type: 'aadhaar', value: k, members: v }))

  return groups
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function MembersPage() {
  const [search, setSearch] = useState('')
  const { data: customers, page, setPage, total, totalPages, loading, error, resetToFirstPage, refresh } =
    usePaginatedResource<Customer>('customers', search)
  useRealtimeInvalidation('customers', refresh)

  // Duplicate detection
  const [showDupModal, setShowDupModal] = useState(false)
  const [dupLoading, setDupLoading] = useState(false)
  const [dupGroups, setDupGroups] = useState<DuplicateGroup[]>([])

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
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Members</h1>
          <p className="text-slate-500 text-sm mt-0.5">{total} total members</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCheckDuplicates}
            className="flex items-center gap-2 px-4 py-2.5 border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-700 text-sm font-semibold rounded-xl transition"
          >
            <ScanLine className="w-4 h-4" /> Check Duplicates
          </button>
          <Link
            href="/members/new"
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl transition shadow-lg shadow-blue-500/20 hover:-translate-y-0.5"
          >
            <UserPlus className="w-4 h-4" /> Add Member
          </Link>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder="Search by name, ID, mobile, Aadhaar, father's name…"
          value={search}
          onChange={e => { setSearch(e.target.value); resetToFirstPage() }}
          className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 shadow-sm"
        />
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                <th className="text-left px-5 py-3 font-semibold">Member ID</th>
                <th className="text-left px-5 py-3 font-semibold">Full Name</th>
                <th className="text-left px-5 py-3 font-semibold">Father / Husband</th>
                <th className="text-left px-5 py-3 font-semibold">Mobile</th>
                <th className="text-left px-5 py-3 font-semibold">Aadhaar (last 4)</th>
                <th className="text-left px-5 py-3 font-semibold">Village / City</th>
                <th className="text-left px-5 py-3 font-semibold">Branch / FO</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading && <tr><td colSpan={8} className="px-5 py-10 text-center text-slate-400">Loading members…</td></tr>}
              {!loading && error && <tr><td colSpan={8} className="px-5 py-10 text-center text-red-500">{error}</td></tr>}
              {!loading && !error && customers.length === 0 && (
                <tr><td colSpan={8} className="px-5 py-10 text-center text-slate-400">No members found</td></tr>
              )}
              {customers.map(c => (
                <tr key={c.customer_id} className="tbl-row">
                  <td className="px-5 py-3 font-mono text-xs text-blue-600 font-semibold">{c.customer_id}</td>
                  <td className="px-5 py-3 font-semibold text-slate-800">{c.full_name}</td>
                  <td className="px-5 py-3 text-slate-600">{c.father_husband_name || '—'}</td>
                  <td className="px-5 py-3">
                    {c.mobile
                      ? <span className="flex items-center gap-1.5 text-slate-600"><Phone className="w-3 h-3 text-slate-400" />{c.mobile}</span>
                      : '—'}
                  </td>
                  <td className="px-5 py-3 font-mono text-slate-600">{c.aadhar_last4 || '—'}</td>
                  <td className="px-5 py-3">
                    {c.village_city
                      ? <span className="flex items-center gap-1 text-slate-600 text-xs"><MapPin className="w-3 h-3 text-slate-400" />{c.village_city}</span>
                      : '—'}
                  </td>
                  <td className="px-5 py-3 text-slate-500 text-xs">{c.branch_code || '—'} / {c.fo_name || '—'}</td>
                  <td className="px-5 py-3">
                    <Link href={`/members/${c.customer_id}`}
                      className="text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors">
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {total > 0 && (
          <div className="px-5 py-3 border-t border-slate-50 bg-slate-50/50 flex items-center justify-between gap-4">
            <p className="text-xs text-slate-400">Page {page} of {totalPages} · 50 per page · {total} members</p>
            <div className="flex gap-2">
              <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 disabled:opacity-40">Previous</button>
              <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Duplicate Validation Modal ── */}
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
                              <span className="font-semibold text-slate-800">{m.full_name}</span>
                              <span className="ml-2 font-mono text-blue-600">{m.customer_id}</span>
                            </div>
                            <div className="text-slate-500 flex items-center gap-3">
                              <span>{m.village_city || '—'}</span>
                              <span className="text-slate-400">{m.branch_code || '—'}</span>
                              <Link href={`/members/${m.customer_id}`} onClick={() => setShowDupModal(false)}
                                className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold rounded-lg transition">
                                View
                              </Link>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end">
              <button onClick={() => setShowDupModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-xl transition">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
