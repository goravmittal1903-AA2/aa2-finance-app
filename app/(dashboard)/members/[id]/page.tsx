'use client'

import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { getOne, getFiltered } from '@/lib/supabase'
import type { Customer, Loan } from '@/lib/types'
import { inr, fdate, statusColor, maskPAN, maskAadhaar } from '@/lib/utils'
import { useAuth } from '@/lib/auth-context'
import { confirmAction } from '@/lib/confirm'
import { ArrowLeft, Phone, MapPin, User, Landmark, Shield, FileText, Plus, Eye, EyeOff } from 'lucide-react'

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
  const [showPAN, setShowPAN] = useState(false)
  const [showAadhaar, setShowAadhaar] = useState(false)
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

  const [isEditing, setIsEditing] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)
  const [editFormData, setEditFormData] = useState<Partial<Customer>>({})

  useEffect(() => {
    if (customer) {
      setEditFormData({ ...customer })
    }
  }, [customer])

  async function handleSaveMemberEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!customer) return
    const { validatePAN } = await import('@/lib/utils')
    if (editFormData.pan_no && !validatePAN(editFormData.pan_no)) {
      const { toast } = await import('@/lib/toast')
      toast.error('Invalid PAN Format', 'Please enter a valid 10-character PAN (e.g. ABCDE1234F)')
      return
    }

    setSavingEdit(true)
    try {
      const { putOne } = await import('@/lib/supabase')
      const updated: Customer = {
        ...customer,
        ...editFormData,
        updated_at: new Date().toISOString(),
        updated_by: user?.email || 'system',
      }
      await putOne('customers', updated, 'customer_id')
      setCustomer(updated)
      setIsEditing(false)
      const { toast } = await import('@/lib/toast')
      toast.success('Member Updated', 'Member details saved successfully.')
      window.dispatchEvent(new Event('aa2_data_changed'))
    } catch (err: any) {
      const { toast } = await import('@/lib/toast')
      toast.error('Save Failed', err.message || 'Could not save member changes.')
    } finally {
      setSavingEdit(false)
    }
  }

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

  const panInvalid = editFormData.pan_no ? !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(editFormData.pan_no.trim().toUpperCase()) : false

  return (
    <div className="space-y-6">
      {/* Top Bar / Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Members
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsEditing(true)}
            className="flex items-center gap-2 px-3.5 py-2 border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 text-sm font-semibold rounded-xl transition shadow-sm"
          >
            <User className="w-4 h-4 text-blue-600" /> Edit Member
          </button>
          <button
            onClick={async () => {
              // 1. Check for open / active / sanctioned loans
              const activeLoans = loans.filter(l => l.status === 'ACTIVE' || l.status === 'SANCTIONED')
              if (activeLoans.length > 0) {
                alert(
                  `Cannot Delete Member\n\nMember "${customer.full_name}" (${customer.customer_id}) cannot be deleted because they have ${activeLoans.length} active/sanctioned loan account(s):\n\n` +
                  activeLoans.map(l => `• ${l.loan_account_no} (${l.status} — ${l.product_type})`).join('\n') +
                  `\n\nPlease close or delete the associated loan accounts first before deleting this member.`
                )
                return
              }

              const ok = await confirmAction({
                title: 'Confirm Delete Member',
                message: `Are you sure you want to delete member "${customer.full_name}" (${customer.customer_id})? The record will be moved to Trash Can.`,
                confirmText: 'Yes, Delete Member',
                variant: 'danger'
              })
              if (!ok) return

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

      {/* Edit Member Modal */}
      {isEditing && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-3xl my-8 overflow-hidden">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Edit Member Details</h3>
                <p className="text-xs text-slate-500">Update profile for Member ID: <span className="font-mono text-blue-600 font-bold">{customer.customer_id}</span></p>
              </div>
              <button onClick={() => setIsEditing(false)} className="text-slate-400 hover:text-slate-600 text-sm font-bold px-2 py-1">✕</button>
            </div>
            <form onSubmit={handleSaveMemberEdit} className="p-6 space-y-5 max-h-[80vh] overflow-y-auto text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Full Name *</label>
                  <input type="text" required value={editFormData.full_name || ''} onChange={e => setEditFormData({ ...editFormData, full_name: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Father / Husband Name *</label>
                  <input type="text" required value={editFormData.father_husband_name || ''} onChange={e => setEditFormData({ ...editFormData, father_husband_name: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Mobile Number (10 digits) *</label>
                  <input type="text" required value={editFormData.mobile || ''} onChange={e => setEditFormData({ ...editFormData, mobile: e.target.value.replace(/\D/g, '').slice(0, 10) })} className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono" />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Date of Birth *</label>
                  <input type="date" required value={editFormData.dob || ''} onChange={e => setEditFormData({ ...editFormData, dob: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Gender *</label>
                  <select value={editFormData.gender || 'Female'} onChange={e => setEditFormData({ ...editFormData, gender: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm">
                    <option value="Female">Female</option>
                    <option value="Male">Male</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">PAN Card Number</label>
                  <input
                    type="text"
                    value={editFormData.pan_no || ''}
                    onChange={e => setEditFormData({ ...editFormData, pan_no: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) })}
                    className={`w-full px-3 py-2 border rounded-xl focus:outline-none focus:ring-2 text-sm font-mono uppercase ${panInvalid ? 'border-red-500 focus:ring-red-400 bg-red-50/50' : 'border-slate-200 focus:ring-blue-500'}`}
                    placeholder="e.g. ABCDE1234F"
                  />
                  {panInvalid && <p className="text-[10px] text-red-600 mt-1">Invalid PAN format (5 letters, 4 digits, 1 letter)</p>}
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Aadhaar (Last 4 digits)</label>
                  <input type="text" value={editFormData.aadhar_last4 || ''} onChange={e => setEditFormData({ ...editFormData, aadhar_last4: e.target.value.replace(/\D/g, '').slice(0, 4) })} className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono" />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Branch Name</label>
                  <input type="text" value={editFormData.branch_code || ''} onChange={e => setEditFormData({ ...editFormData, branch_code: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" placeholder="e.g. Gagalheri" />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Village / City</label>
                  <input type="text" value={editFormData.village_city || ''} onChange={e => setEditFormData({ ...editFormData, village_city: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Pincode</label>
                  <input type="text" value={editFormData.pincode || ''} onChange={e => setEditFormData({ ...editFormData, pincode: e.target.value.replace(/\D/g, '').slice(0, 6) })} className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono" />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">District</label>
                  <input type="text" value={editFormData.district || ''} onChange={e => setEditFormData({ ...editFormData, district: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">State</label>
                  <input type="text" value={editFormData.state || ''} onChange={e => setEditFormData({ ...editFormData, state: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Branch Manager Name</label>
                  <input type="text" value={editFormData.bm_name || ''} onChange={e => setEditFormData({ ...editFormData, bm_name: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Field Officer Name</label>
                  <input type="text" value={editFormData.fo_name || ''} onChange={e => setEditFormData({ ...editFormData, fo_name: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
                </div>
              </div>
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Current Address</label>
                <textarea rows={2} value={editFormData.address_current || ''} onChange={e => setEditFormData({ ...editFormData, address_current: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button type="button" onClick={() => setIsEditing(false)} className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold rounded-xl">Cancel</button>
                <button type="submit" disabled={savingEdit} className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-md disabled:opacity-50 flex items-center gap-2">
                  {savingEdit ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
                <div className="flex items-center gap-2 text-slate-700 text-sm">
                  <Shield className="w-4 h-4 text-slate-400" />
                  <span>Aadhaar: <span className="font-mono font-bold">{showAadhaar ? (customer.aadhar_last4 ? `**** **** ${customer.aadhar_last4}` : '—') : maskAadhaar(customer.aadhar_last4)}</span></span>
                  <button onClick={() => setShowAadhaar(!showAadhaar)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-400" title={showAadhaar ? "Hide Aadhaar" : "Show Aadhaar"}>
                    {showAadhaar ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-700 font-mono">
                  <span>PAN: <span className="font-bold">{showPAN ? (customer.pan_no || '—') : maskPAN(customer.pan_no)}</span></span>
                  {customer.pan_no && (
                    <button onClick={() => setShowPAN(!showPAN)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-400" title={showPAN ? "Hide PAN" : "Show PAN"}>
                      {showPAN ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    </button>
                  )}
                </div>
                <span className="text-xs text-slate-500 block">DOB: {fdate(customer.dob)} ({customer.gender || '—'})</span>
              </div>

              <div className="space-y-1">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Location / Branch</span>
                <span className="flex items-center gap-2 text-slate-700 text-sm">
                  <MapPin className="w-4 h-4 text-slate-400" /> {customer.village_city || '—'}, {customer.district || '—'}
                </span>
                <span className="text-xs text-slate-500 block">Branch Name: {customer.branch_code || '—'}</span>
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
                      <td className="px-4 py-3 font-mono text-xs text-blue-600 font-semibold">
                        <Link href={`/loans/${l.loan_account_no}`} className="hover:underline">
                          {l.loan_account_no}
                        </Link>
                      </td>
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
