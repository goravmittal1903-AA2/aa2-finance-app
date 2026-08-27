'use client'

import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { getOne, getFiltered, putOne } from '@/lib/supabase'
import { logAuditEvent, getAuditLogs, type AuditLogEntry } from '@/lib/audit'
import type { Customer, Loan } from '@/lib/types'
import { inr, fdate, statusColor, maskPAN } from '@/lib/utils'
import { useAuth } from '@/lib/auth-context'
import { confirmAction } from '@/lib/confirm'
import { toast } from '@/lib/toast'
import {
  ArrowLeft, Phone, MapPin, User, Landmark, Shield,
  FileText, Plus, CheckCircle2, Clock, Trash2, Edit3, X, Eye, EyeOff
} from 'lucide-react'

interface PageProps {
  params: Promise<{ id: string }>
}

export default function MemberDetailPage({ params }: PageProps) {
  const { id } = use(params)
  const { user } = useAuth()
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [loans, setLoans] = useState<Loan[]>([])
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [showPAN, setShowPAN] = useState(false)
  const router = useRouter()

  const [activeTab, setActiveTab] = useState<'profile' | 'loans' | 'audit'>('profile')

  async function loadData() {
    try {
      let cust = await getOne<Customer>('customers', id)
      if (!cust) {
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

      // Fetch member loans
      const custLoans = await getFiltered<Loan>('loans', 'customer_id', realId)
      setLoans(custLoans)

      // Fetch comprehensive audit history for this member and their loans
      const allLogs = await getAuditLogs()
      const loanNos = new Set(custLoans.map(l => l.loan_account_no))
      const memberLogs = allLogs.filter(l =>
        l.entity_id === realId ||
        loanNos.has(l.entity_id) ||
        (l.narration && (l.narration.includes(realId) || l.narration.includes(cust!.full_name)))
      )
      setAuditLogs(memberLogs)
    } catch (err) {
      console.error('Error loading member details:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
    const handler = () => loadData()
    window.addEventListener('aa2_data_changed', handler)
    return () => window.removeEventListener('aa2_data_changed', handler)
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
      toast.error('Invalid PAN Format', 'Please enter a valid 10-character PAN (e.g. ABCDE1234F)')
      return
    }

    setSavingEdit(true)
    try {
      const updated: Customer = {
        ...customer,
        ...editFormData,
        updated_at: new Date().toISOString(),
        updated_by: user?.email || 'system',
      }
      await putOne('customers', updated, 'customer_id')

      // Record immutable audit log for member profile edit
      await logAuditEvent({
        event_type: 'KYC_UPDATED',
        entity_type: 'MEMBER',
        entity_id: customer.customer_id,
        actor_email: user?.email || 'system',
        actor_name: (user?.email || 'system').split('@')[0],
        actor_role: 'staff',
        branch_code: updated.branch_code,
        narration: `Member profile updated for ${updated.full_name} (${customer.customer_id})`,
        old_values: customer,
        new_values: updated,
      })

      setCustomer(updated)
      setIsEditing(false)
      toast.success('Member Updated', 'Member details saved and logged successfully.')
      window.dispatchEvent(new Event('aa2_data_changed'))
      loadData()
    } catch (err: any) {
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
          <p className="text-slate-500 text-xs font-medium tracking-wide">Loading member profile…</p>
        </div>
      </div>
    )
  }

  if (!customer) {
    return (
      <div className="space-y-4">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-800">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="bg-white rounded-2xl p-8 shadow-xs border border-slate-100 text-center text-slate-400">
          <p className="text-sm font-bold text-slate-700">Member Not Found</p>
          <p className="text-xs text-slate-400 mt-1">The Member ID does not exist in our database records.</p>
        </div>
      </div>
    )
  }

  const panInvalid = editFormData.pan_no ? !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(editFormData.pan_no.trim().toUpperCase()) : false

  return (
    <div className="space-y-6 pb-12">
      {/* Top Bar Navigation & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link href="/members" className="flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Members
        </Link>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsEditing(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 text-xs font-semibold rounded-xl transition shadow-xs"
          >
            <Edit3 className="w-3.5 h-3.5 text-blue-600" /> Edit Profile
          </button>
          <button
            onClick={async () => {
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
                await logAuditEvent({
                  event_type: 'DELETE',
                  entity_type: 'MEMBER',
                  entity_id: customer.customer_id,
                  actor_email: user?.email || 'system',
                  actor_name: (user?.email || 'system').split('@')[0],
                  actor_role: 'staff',
                  branch_code: customer.branch_code,
                  narration: `Member "${customer.full_name}" (${customer.customer_id}) deleted and moved to Trash`,
                  old_values: customer,
                })
                toast.success('Member Deleted', `Member "${customer.full_name}" moved to Trash Can.`)
                router.push('/members')
              } catch (err: any) {
                alert(`Deletion failed: ${err.message || 'Unknown error'}`)
              }
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 text-xs font-semibold rounded-xl transition"
          >
            <Trash2 className="w-3.5 h-3.5" /> Delete Member
          </button>
          <Link
            href={`/loans/new?customer_id=${customer.customer_id}`}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl transition-all shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" /> + Sanction New Loan
          </Link>
        </div>
      </div>

      {/* Edit Member Modal */}
      {isEditing && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-3xl my-8 overflow-hidden tab-transition">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Edit Member Profile</h3>
                <p className="text-xs text-slate-400">Member ID: <span className="font-mono text-blue-600 font-bold">{customer.customer_id}</span></p>
              </div>
              <button onClick={() => setIsEditing(false)} className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200/50">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveMemberEdit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Full Name *</label>
                  <input type="text" required value={editFormData.full_name || ''} onChange={e => setEditFormData({ ...editFormData, full_name: e.target.value })} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs" />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Father / Husband Name *</label>
                  <input type="text" required value={editFormData.father_husband_name || ''} onChange={e => setEditFormData({ ...editFormData, father_husband_name: e.target.value })} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs" />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Mobile Number (10 digits) *</label>
                  <input type="text" required value={editFormData.mobile || ''} onChange={e => setEditFormData({ ...editFormData, mobile: e.target.value.replace(/\D/g, '').slice(0, 10) })} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs font-mono" />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Date of Birth *</label>
                  <input type="date" required value={editFormData.dob || ''} onChange={e => setEditFormData({ ...editFormData, dob: e.target.value })} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs" />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Gender *</label>
                  <select value={editFormData.gender || 'Female'} onChange={e => setEditFormData({ ...editFormData, gender: e.target.value })} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs">
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
                    className={`w-full px-3 py-2 border rounded-xl focus:outline-none focus:ring-2 text-xs font-mono uppercase ${panInvalid ? 'border-red-500 bg-red-50/50' : 'bg-slate-50 border-slate-200 focus:bg-white focus:ring-blue-500'}`}
                    placeholder="ABCDE1234F"
                  />
                  {panInvalid && <p className="text-[10px] text-red-600 mt-1">Invalid PAN format (5 letters, 4 digits, 1 letter)</p>}
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Aadhaar (Last 4 digits)</label>
                  <input type="text" value={editFormData.aadhar_last4 || ''} onChange={e => setEditFormData({ ...editFormData, aadhar_last4: e.target.value.replace(/\D/g, '').slice(0, 4) })} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs font-mono tracking-widest" />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Branch Name</label>
                  <input type="text" value={editFormData.branch_code || ''} onChange={e => setEditFormData({ ...editFormData, branch_code: e.target.value })} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs" />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Village / City</label>
                  <input type="text" value={editFormData.village_city || ''} onChange={e => setEditFormData({ ...editFormData, village_city: e.target.value })} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs" />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Pincode</label>
                  <input type="text" value={editFormData.pincode || ''} onChange={e => setEditFormData({ ...editFormData, pincode: e.target.value.replace(/\D/g, '').slice(0, 6) })} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs font-mono" />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">District</label>
                  <input type="text" value={editFormData.district || ''} onChange={e => setEditFormData({ ...editFormData, district: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs" />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">State</label>
                  <input type="text" value={editFormData.state || ''} onChange={e => setEditFormData({ ...editFormData, state: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs" />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Branch Manager Name</label>
                  <input type="text" value={editFormData.bm_name || ''} onChange={e => setEditFormData({ ...editFormData, bm_name: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs" />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Field Officer Name</label>
                  <input type="text" value={editFormData.fo_name || ''} onChange={e => setEditFormData({ ...editFormData, fo_name: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs" />
                </div>
              </div>
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Current Address</label>
                <textarea rows={2} value={editFormData.address_current || ''} onChange={e => setEditFormData({ ...editFormData, address_current: e.target.value })} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs" />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setIsEditing(false)} className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold rounded-xl text-xs">Cancel</button>
                <button type="submit" disabled={savingEdit} className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-xs disabled:opacity-50 text-xs">
                  {savingEdit ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Profile Header Card */}
      <div className="bg-white rounded-2xl p-6 shadow-xs border border-slate-100 space-y-4">
        <div className="flex flex-col md:flex-row gap-6 items-start">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 text-xl font-bold">
            {customer.full_name?.slice(0, 1).toUpperCase()}
          </div>
          <div className="flex-1 space-y-3">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-slate-800 tracking-tight">{customer.full_name}</h1>
                <span className="font-mono text-xs text-blue-600 font-bold px-2.5 py-0.5 bg-blue-50 rounded-full border border-blue-200">
                  {customer.customer_id}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">S/O, W/O: {customer.father_husband_name || '—'} · Registered {fdate(customer.created_at)}</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3 border-t border-slate-100 text-xs">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Contact & Mobile</span>
                <span className="font-mono font-bold text-slate-700 flex items-center gap-1 mt-0.5">
                  <Phone className="w-3.5 h-3.5 text-slate-400" /> {customer.mobile || '—'}
                </span>
              </div>

              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Identity (KYC)</span>
                <p className="font-mono font-bold text-slate-700 mt-0.5">
                  Aadhaar: <span className="text-slate-800 tracking-wider">•••• •••• {customer.aadhar_last4 || '—'}</span>
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="font-mono text-[11px] text-slate-700 font-semibold">
                    PAN: {showPAN ? (customer.pan_no || '—') : maskPAN(customer.pan_no)}
                  </span>
                  {customer.pan_no && (
                    <button
                      type="button"
                      onClick={() => setShowPAN(!showPAN)}
                      className="p-0.5 text-slate-400 hover:text-blue-600 transition"
                      title={showPAN ? "Hide PAN" : "Show PAN"}
                    >
                      {showPAN ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </div>
              </div>

              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Branch & Location</span>
                <p className="font-bold text-slate-700 mt-0.5">{customer.branch_code || 'Head Office'}</p>
                <p className="text-[11px] text-slate-400">{customer.village_city || '—'}, {customer.district || ''}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Navigation Switcher */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-1 text-xs">
        <button
          onClick={() => setActiveTab('profile')}
          className={`px-4 py-2 font-bold rounded-xl transition ${
            activeTab === 'profile'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
          }`}
        >
          Demographics & Profile
        </button>

        <button
          onClick={() => setActiveTab('loans')}
          className={`px-4 py-2 font-bold rounded-xl transition ${
            activeTab === 'loans'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
          }`}
        >
          Loan Facilities ({loans.length})
        </button>

        <button
          onClick={() => setActiveTab('audit')}
          className={`px-4 py-2 font-bold rounded-xl transition ${
            activeTab === 'audit'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
          }`}
        >
          Activity Audit History ({auditLogs.length})
        </button>
      </div>

      {/* Tab 1: Profile & Demographics */}
      {activeTab === 'profile' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 tab-transition">
          <div className="bg-white rounded-2xl p-6 shadow-xs border border-slate-100 space-y-4">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <User className="w-4 h-4 text-blue-500" /> Personal & Demographic Information
            </h3>
            <div className="divide-y divide-slate-100 text-xs">
              <div className="py-2.5 flex justify-between"><span className="text-slate-400">Gender</span><span className="font-semibold text-slate-700">{customer.gender || '—'}</span></div>
              <div className="py-2.5 flex justify-between"><span className="text-slate-400">Date of Birth</span><span className="font-semibold text-slate-700">{fdate(customer.dob)}</span></div>
              <div className="py-2.5 flex justify-between"><span className="text-slate-400">Mobile Number</span><span className="font-mono font-semibold text-slate-700">{customer.mobile || '—'}</span></div>
              <div className="py-2.5 flex justify-between"><span className="text-slate-400">Aadhaar (Last 4)</span><span className="font-mono font-bold text-slate-800 tracking-wider">•••• •••• {customer.aadhar_last4 || '—'}</span></div>
              <div className="py-2.5 flex justify-between items-center">
                <span className="text-slate-400">PAN Card</span>
                <span className="font-mono font-bold text-slate-800 flex items-center gap-1.5">
                  {showPAN ? (customer.pan_no || '—') : maskPAN(customer.pan_no)}
                  {customer.pan_no && (
                    <button
                      type="button"
                      onClick={() => setShowPAN(!showPAN)}
                      className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-blue-600 transition"
                      title={showPAN ? "Hide PAN" : "Show PAN"}
                    >
                      {showPAN ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-xs border border-slate-100 space-y-4">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-blue-500" /> Residential Location & Organizational Hierarchy
            </h3>
            <div className="divide-y divide-slate-100 text-xs">
              <div className="py-2 flex justify-between"><span className="text-slate-400">Father / Husband Name</span><span className="font-semibold text-slate-700">{customer.father_husband_name || '—'}</span></div>
              <div className="py-2 flex justify-between"><span className="text-slate-400">Village / City</span><span className="font-semibold text-slate-700">{customer.village_city || '—'}</span></div>
              <div className="py-2 flex justify-between"><span className="text-slate-400">Pincode</span><span className="font-mono font-semibold text-slate-700">{customer.pincode || '—'}</span></div>
              <div className="py-2 flex justify-between"><span className="text-slate-400">District / State</span><span className="font-semibold text-slate-700">{customer.district || '—'}, {customer.state || '—'}</span></div>
              <div className="py-2 flex justify-between"><span className="text-slate-400">Center Number / Cluster</span><span className="font-mono font-semibold text-slate-700">{customer.center_no || '—'} / {customer.cluster_no || '—'}</span></div>
              <div className="py-2 flex justify-between"><span className="text-slate-400">Branch Name</span><span className="font-bold text-slate-700">{customer.branch_code || 'Head Office'}</span></div>
              <div className="py-2 flex justify-between"><span className="text-slate-400">Field Officer (FO)</span><span className="font-semibold text-slate-700">{customer.fo_name || '—'}</span></div>
              <div className="py-2 flex justify-between"><span className="text-slate-400">Branch Manager (BM)</span><span className="font-semibold text-slate-700">{customer.bm_name || '—'}</span></div>
              <div className="py-2 flex justify-between"><span className="text-slate-400">Area Manager (AM)</span><span className="font-semibold text-slate-700">{customer.am_name || '—'}</span></div>
              <div className="py-2 flex justify-between"><span className="text-slate-400">Regional Manager (RM)</span><span className="font-semibold text-slate-700">{customer.rm_name || '—'}</span></div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Loan Facilities */}
      {activeTab === 'loans' && (
        <div className="bg-white rounded-2xl shadow-xs border border-slate-100 overflow-hidden tab-transition">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800">Associated Loan Accounts ({loans.length})</h3>
            <Link
              href={`/loans/new?customer_id=${customer.customer_id}`}
              className="text-xs font-bold text-blue-600 hover:underline"
            >
              + Sanction New Facility
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-400 uppercase tracking-wide text-[10px]">
                  <th className="text-left px-5 py-3 font-semibold">Account No.</th>
                  <th className="text-left px-5 py-3 font-semibold">Product</th>
                  <th className="text-right px-5 py-3 font-semibold">Sanction Amount</th>
                  <th className="text-right px-5 py-3 font-semibold">Outstanding</th>
                  <th className="text-center px-5 py-3 font-semibold">Status</th>
                  <th className="text-right px-5 py-3 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {loans.map(l => (
                  <tr key={l.loan_account_no} className="hover:bg-slate-50/60 transition">
                    <td className="px-5 py-3 font-mono text-blue-600 font-bold">
                      <Link href={`/loans/${l.loan_account_no}`} className="hover:underline">
                        {l.loan_account_no}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-slate-700 font-semibold">{l.product_type}</td>
                    <td className="px-5 py-3 text-right font-mono text-slate-700">{inr(l.loan_amount)}</td>
                    <td className="px-5 py-3 text-right font-mono font-bold text-amber-700">{inr(l.ledger_balance)}</td>
                    <td className="px-5 py-3 text-center">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${statusColor(l.status)}`}>
                        {l.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link
                        href={`/loans/${l.loan_account_no}`}
                        className="text-blue-600 hover:underline font-bold text-[11px]"
                      >
                        Loan Ledger →
                      </Link>
                    </td>
                  </tr>
                ))}
                {loans.length === 0 && (
                  <tr><td colSpan={6} className="px-5 py-8 text-center text-slate-400">No loan accounts created for this member yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Activity Audit History */}
      {activeTab === 'audit' && (
        <div className="bg-white rounded-2xl p-6 shadow-xs border border-slate-100 space-y-4 tab-transition">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <FileText className="w-4 h-4 text-purple-600" /> Immutable Activity Audit Log ({auditLogs.length})
            </h3>
            <span className="text-xs text-slate-400">Audit trail records for profile & loan actions</span>
          </div>

          <div className="space-y-3">
            {auditLogs.map(log => (
              <div key={log.log_id} className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 text-xs flex justify-between items-start gap-4">
                <div className="space-y-1">
                  <p className="font-bold text-slate-800">{log.narration}</p>
                  <div className="flex items-center gap-3 text-slate-400 text-[10.5px]">
                    <span>Event: <strong className="text-blue-600 font-mono font-bold">{log.event_type}</strong></span>
                    <span>Actor: <strong className="text-slate-600">{log.actor_email}</strong></span>
                    {log.branch_code && <span>Branch: {log.branch_code}</span>}
                  </div>
                </div>
                <span className="text-[10px] font-mono text-slate-400 whitespace-nowrap bg-white px-2 py-1 rounded border border-slate-200">
                  {fdate(log.timestamp)}
                </span>
              </div>
            ))}

            {auditLogs.length === 0 && (
              <div className="py-8 text-center text-slate-400 text-xs">
                No activity audit records logged yet. All profile creations, loan approvals, and KYC edits are recorded here.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
