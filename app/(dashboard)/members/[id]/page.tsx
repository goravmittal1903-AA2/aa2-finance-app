'use client'

import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { getOne, getFiltered } from '@/lib/supabase'
import type { Customer, Loan } from '@/lib/types'
import { inr, fdate, statusColor } from '@/lib/utils'
import { useAuth } from '@/lib/auth-context'
import { ArrowLeft, Phone, MapPin, User, Landmark, Shield, FileText, Plus } from 'lucide-react'

interface PageProps {
  params: Promise<{ id: string }>
}

export default function MemberDetailPage({ params }: PageProps) {
  const { id } = use(params)
  const { user } = useAuth()
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [loans, setLoans] = useState<Loan[]>([])
  const [auditLogs, setAuditLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    async function loadData() {
      try {
        let cust = await getOne<Customer>('customers', id)
        if (!cust) {
          // Fallback: Search all customers for legacy format or substring match
          const { getAll } = await import('@/lib/supabase')
          const allCust = await getAll<Customer>('customers')
          cust = allCust.find(c =>
            c.customer_id === id ||
            (c as any).old_id === id ||
            (c.customer_id && id && c.customer_id.replace(/[-_]/g, '').toLowerCase() === id.replace(/[-_]/g, '').toLowerCase())
          ) || null
        }

        if (!cust) {
          setLoading(false)
          return
        }
        setCustomer(cust)
        const realId = cust.customer_id
        // Fetch loans and audit history for this member
        const { getEntityAuditLogs } = await import('@/lib/audit')
        const [custLoans, logs] = await Promise.all([
          getFiltered<Loan>('loans', 'customer_id', realId),
          getEntityAuditLogs(realId)
        ])
        setLoans(custLoans)
        setAuditLogs(logs)
      } catch (err) {
        console.error('Error loading member details:', err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [id])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-500 text-sm">Loading member details…</p>
        </div>
      </div>
    )
  }

  if (!customer) {
    return (
      <div className="space-y-4">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100 text-center text-slate-400">
          <p className="text-lg font-semibold">Member not found</p>
          <p className="text-sm">The Member ID does not exist in our records.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Top Bar / Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Members
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              // 1. Check for open / active / sanctioned loans
              const activeLoans = loans.filter(l => l.status === 'ACTIVE' || l.status === 'SANCTIONED')
              if (activeLoans.length > 0) {
                alert(
                  `🚫 Cannot Delete Member\n\nMember "${customer.full_name}" (${customer.customer_id}) cannot be deleted because they have ${activeLoans.length} active/sanctioned loan account(s):\n\n` +
                  activeLoans.map(l => `• ${l.loan_account_no} (${l.status} — ${l.product_type})`).join('\n') +
                  `\n\nPlease close or delete the associated loan accounts first before deleting this member.`
                )
                return
              }

              const confirm = window.confirm(`Are you sure you want to delete member "${customer.full_name}" (${customer.customer_id})?`)
              if (!confirm) return

              try {
                const { moveToTrash } = await import('@/lib/trash')
                await moveToTrash('customers', customer.customer_id, customer, customer.full_name, user?.email || 'system')
                const { toast } = await import('@/lib/toast')
                toast.success('Member Deleted', `Member "${customer.full_name}" deleted successfully.`)
                router.push('/members')
              } catch (err: any) {
                alert(`Deletion failed: ${err.message || 'Unknown error'}`)
              }
            }}
            className="flex items-center gap-2 px-3.5 py-2 border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 text-sm font-semibold rounded-xl transition"
          >
            Delete Member
          </button>
          <Link href={`/loans/new?customer_id=${customer.customer_id}`}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl transition-all shadow-md hover:-translate-y-0.5">
            <Plus className="w-4 h-4" /> Sanction New Loan
          </Link>
        </div>
      </div>

      {/* Profile Summary Card */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
        <div className="flex flex-col md:flex-row gap-6 items-start">
          <div className="w-16 h-16 rounded-2xl bg-blue-100 flex items-center justify-center text-blue-600 text-2xl font-bold">
            {customer.full_name?.slice(0, 1).toUpperCase()}
          </div>
          <div className="flex-1 space-y-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-800">{customer.full_name}</h1>
              <p className="text-sm font-mono text-blue-600 font-semibold mt-0.5">{customer.customer_id}</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 border-t border-slate-100">
              <div className="space-y-1">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Contact Information</span>
                <span className="flex items-center gap-2 text-slate-700 text-sm">
                  <Phone className="w-4 h-4 text-slate-400" /> {customer.mobile || '—'}
                </span>
                <span className="text-xs text-slate-500 block">Father / Husband: {customer.father_husband_name || '—'}</span>
              </div>
              
              <div className="space-y-1">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Identity & KYCs</span>
                <span className="flex items-center gap-2 text-slate-700 text-sm">
                  <Shield className="w-4 h-4 text-slate-400" /> Aadhaar (Last 4): <span className="font-mono">{customer.aadhar_last4 || '—'}</span>
                </span>
                <span className="text-xs text-slate-500 block">DOB: {fdate(customer.dob)} ({customer.gender || '—'})</span>
              </div>

              <div className="space-y-1">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Location / Branch</span>
                <span className="flex items-center gap-2 text-slate-700 text-sm">
                  <MapPin className="w-4 h-4 text-slate-400" /> {customer.village_city || '—'}, {customer.district || '—'}
                </span>
                <span className="text-xs text-slate-500 block">Branch Code: {customer.branch_code || '—'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Details Sections Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Full Details List */}
        <div className="lg:col-span-1 bg-white rounded-2xl p-6 shadow-sm border border-slate-100 space-y-4">
          <h2 className="text-md font-bold text-slate-800 pb-2 border-b border-slate-100 flex items-center gap-2">
            <User className="w-4 h-4 text-blue-500" /> Personal Details
          </h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-slate-400">Gender</span><span className="font-medium text-slate-700">{customer.gender || '—'}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">DOB</span><span className="font-medium text-slate-700">{fdate(customer.dob)}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">State</span><span className="font-medium text-slate-700">{customer.state || '—'}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">District</span><span className="font-medium text-slate-700">{customer.district || '—'}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Village/City</span><span className="font-medium text-slate-700">{customer.village_city || '—'}</span></div>
            <div className="flex flex-col gap-1 pt-1"><span className="text-slate-400">Current Address</span><span className="font-medium text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-100 leading-relaxed text-xs">{customer.address_current || '—'}</span></div>
            <div className="flex justify-between border-t border-slate-100 pt-3"><span className="text-slate-400">Branch Manager</span><span className="font-medium text-slate-700">{customer.bm_name || '—'}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Field Officer</span><span className="font-medium text-slate-700">{customer.fo_name || '—'}</span></div>
          </div>
        </div>

        {/* Member Loans Portfolio List & Audit Log */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 space-y-4">
            <h2 className="text-md font-bold text-slate-800 pb-2 border-b border-slate-100 flex items-center gap-2">
              <Landmark className="w-4 h-4 text-blue-500" /> Active & Historical Loans ({loans.length})
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                    <th className="text-left px-4 py-2.5 font-semibold">Account No.</th>
                    <th className="text-left px-4 py-2.5 font-semibold">Product</th>
                    <th className="text-right px-4 py-2.5 font-semibold">Amount</th>
                    <th className="text-right px-4 py-2.5 font-semibold">Outstanding</th>
                    <th className="text-center px-4 py-2.5 font-semibold">Status</th>
                    <th className="px-4 py-2.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loans.map(l => (
                    <tr key={l.loan_account_no} className="tbl-row">
                      <td className="px-4 py-3 font-mono text-xs text-blue-600 font-semibold">{l.loan_account_no}</td>
                      <td className="px-4 py-3 text-slate-700 font-medium">{l.product_type}</td>
                      <td className="px-4 py-3 text-right text-slate-700 font-medium">{inr(l.loan_amount)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-800">{inr(l.ledger_balance)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`badge text-[10px] ${statusColor(l.status)}`}>{l.status}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/loans/${l.loan_account_no}`} className="text-xs text-blue-600 font-semibold hover:underline">
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {loans.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-400 text-sm">
                        No loan accounts associated with this member yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Member Activity Audit History */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 space-y-4">
            <h2 className="text-md font-bold text-slate-800 pb-2 border-b border-slate-100 flex items-center gap-2">
              <FileText className="w-4 h-4 text-purple-500" /> Member Activity Audit History ({auditLogs.length})
            </h2>
            <div className="space-y-3">
              {auditLogs.slice(0, 20).map(log => (
                <div key={log.id} className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs flex justify-between items-start gap-4">
                  <div className="space-y-1">
                    <span className="font-bold text-slate-800 block">{log.summary}</span>
                    <span className="text-slate-500 block text-[11px]">Action: <strong className="text-blue-600 font-mono">{log.action}</strong> · User: {log.user}</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400 whitespace-nowrap">{fdate(log.ts)}</span>
                </div>
              ))}
              {auditLogs.length === 0 && (
                <p className="text-xs text-slate-400 py-4 text-center">No recorded activity history for this member yet.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
