'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getAll, putOne } from '@/lib/supabase'
import { toast } from '@/lib/toast'
import type { Customer } from '@/lib/types'
import { ArrowLeft, Save, AlertTriangle } from 'lucide-react'
import { todayISO } from '@/lib/utils'
import { useAuth } from '@/lib/auth-context'

export default function NewMemberPage() {
  const DRAFT_KEY = 'aa2_draft_member'
  const { user } = useAuth()
  const [formData, setFormData] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(DRAFT_KEY)
      if (saved) {
        try { return JSON.parse(saved) } catch {}
      }
    }
    return {
      full_name: '',
      father_husband_name: '',
      gender: 'Female',
      dob: '',
      mobile: '',
      aadhar_last4: '',
      village_city: '',
      district: '',
      state: '',
      branch_code: '',
      bm_name: '',
      fo_name: '',
      address_current: '',
    }
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [draftSavedMsg, setDraftSavedMsg] = useState('')
  const [duplicateWarning, setDuplicateWarning] = useState<Customer | null>(null)
  const router = useRouter()

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData((prev: Record<string, string>) => {
      const updated = { ...prev, [name]: value }
      if (typeof window !== 'undefined') localStorage.setItem(DRAFT_KEY, JSON.stringify(updated))
      return updated
    })
  }

  const handleSaveDraft = () => {
    if (typeof window !== 'undefined') localStorage.setItem(DRAFT_KEY, JSON.stringify(formData))
    setDraftSavedMsg('Draft saved successfully! You can resume filling this form anytime.')
    setTimeout(() => setDraftSavedMsg(''), 4000)
  }

  const handleClearDraft = () => {
    if (window.confirm('Clear draft form and reset all fields?')) {
      if (typeof window !== 'undefined') localStorage.removeItem(DRAFT_KEY)
      setFormData({
        full_name: '', father_husband_name: '', gender: 'Female', dob: '',
        mobile: '', aadhar_last4: '', village_city: '', district: '', state: 'UTTARAKHAND',
        branch_code: '', bm_name: '', fo_name: '', address_current: ''
      })
      setDraftSavedMsg('')
    }
  }

  async function generateNewMemberId(): Promise<string> {
    const list = await getAll<Customer>('customers')
    let maxNum = 0
    for (const c of list) {
      const id = c.customer_id
      if (id && id.startsWith('MEM')) {
        const numPart = id.substring(3)
        if (/^\d{5}$/.test(numPart)) {
          const val = parseInt(numPart, 10)
          if (val > maxNum) maxNum = val
        }
      }
    }
    const nextNum = maxNum > 0 ? maxNum + 1 : 10001
    return 'MEM' + String(nextNum).padStart(5, '0')
  }

  async function checkDuplicates(): Promise<{ match: Customer; field: string } | null> {
    const allCust = await getAll<Customer>('customers')
    for (const c of allCust) {
      if (formData.mobile && c.mobile?.trim() === formData.mobile.trim()) {
        return { match: c, field: 'mobile' }
      }
      if (formData.aadhar_last4 && c.aadhar_last4?.trim() === formData.aadhar_last4.trim()) {
        return { match: c, field: 'aadhar' }
      }
    }
    return null
  }

  async function handleSave(overrideDuplicate = false) {
    setError('')
    setLoading(true)

    try {
      if (!formData.mobile && !formData.aadhar_last4) {
        toast.error('Missing Contact Information', 'Please enter either Mobile number or Aadhaar Number.')
        setError('Please enter either Mobile number or Aadhaar Number.')
        setLoading(false)
        return
      }

      if (!overrideDuplicate) {
        const dup = await checkDuplicates()
        if (dup) {
          setDuplicateWarning(dup.match)
          const fieldName = dup.field === 'mobile' ? 'Mobile Number' : 'Aadhaar Number'
          toast.warning(
            `Duplicate ${fieldName} Detected`,
            `Member "${dup.match.full_name}" (${dup.match.customer_id}) is already registered with this ${fieldName}.`
          )
          setLoading(false)
          return
        }
      }

      const newId = await generateNewMemberId()
      const now = new Date().toISOString()
      const newCustomer: Customer = {
        ...formData,
        customer_id: newId,
        created_at: now,
        created_by: user?.email || 'system', // active logged-in user
        updated_at: now,
        updated_by: user?.email || 'system',
      }

      await putOne('customers', newCustomer, 'customer_id')
      if (typeof window !== 'undefined') localStorage.removeItem(DRAFT_KEY)
      router.push(`/members/${newId}`)
    } catch (err) {
      console.error(err)
      setError('Failed to onboard member. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Top Bar */}
      <div className="flex items-center gap-4">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Member Onboarding</h1>
          <p className="text-slate-500 text-sm mt-0.5">Sanction master profile record for new members.</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}

      {/* Duplicate Warning Dialog */}
      {duplicateWarning && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 p-5 rounded-2xl space-y-4 shadow-sm">
          <div className="flex gap-2.5 items-start">
            <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-bold text-sm">Duplicate Member Profile Detected</h3>
              <p className="text-xs text-amber-700 mt-1 leading-relaxed">
                Another member profile already exists with this mobile number or Aadhaar details.
              </p>
              <div className="mt-3 bg-amber-100/50 p-3 rounded-lg border border-amber-200/50 text-xs font-medium space-y-1">
                <div>Name: {duplicateWarning.full_name}</div>
                <div>Member ID: <span className="mono">{duplicateWarning.customer_id}</span></div>
                <div>Mobile: {duplicateWarning.mobile || '—'} | Aadhaar (last 4): {duplicateWarning.aadhar_last4 || '—'}</div>
                <div>Branch: {duplicateWarning.branch_code || '—'}</div>
              </div>
            </div>
          </div>
          <div className="flex gap-3 justify-end">
            <button onClick={() => setDuplicateWarning(null)} className="px-4 py-2 border border-slate-200 text-slate-700 bg-white rounded-lg text-xs font-semibold hover:bg-slate-50 transition">
              Cancel & Modify
            </button>
            <button onClick={() => handleSave(true)} className="px-4 py-2 bg-amber-600 text-white rounded-lg text-xs font-semibold hover:bg-amber-700 transition">
              Ignore & Force Save
            </button>
          </div>
        </div>
      )}

      {/* Form Container */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
        <form onSubmit={e => { e.preventDefault(); handleSave() }} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Full Name */}
            <div className="md:col-span-2 space-y-1.5">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Full Name *</label>
              <input
                type="text"
                name="full_name"
                value={formData.full_name}
                onChange={handleChange}
                required
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="Enter member's full name"
              />
            </div>

            {/* Father / Husband Name */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Father / Husband Name</label>
              <input
                type="text"
                name="father_husband_name"
                value={formData.father_husband_name}
                onChange={handleChange}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="Enter father or husband name"
              />
            </div>

            {/* Gender */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Gender</label>
              <select
                name="gender"
                value={formData.gender}
                onChange={handleChange}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                <option value="Female">Female</option>
                <option value="Male">Male</option>
                <option value="Other">Other</option>
              </select>
            </div>

            {/* DOB */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Date of Birth</label>
              <input
                type="date"
                name="dob"
                value={formData.dob}
                onChange={handleChange}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>

            {/* Mobile */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Mobile Number</label>
              <input
                type="text"
                name="mobile"
                value={formData.mobile}
                onChange={handleChange}
                maxLength={10}
                pattern="[0-9]{10}"
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="10-digit mobile"
              />
            </div>

            {/* Aadhaar Last 4 */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Aadhaar (last 4 digits)</label>
              <input
                type="text"
                name="aadhar_last4"
                value={formData.aadhar_last4}
                onChange={handleChange}
                maxLength={4}
                pattern="[0-9]{4}"
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="e.g. 1234"
              />
            </div>

            {/* Village / City */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Village / City</label>
              <input
                type="text"
                name="village_city"
                value={formData.village_city}
                onChange={handleChange}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="Village or City name"
              />
            </div>

            {/* District */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">District</label>
              <input
                type="text"
                name="district"
                value={formData.district}
                onChange={handleChange}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="District name"
              />
            </div>

            {/* State */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">State</label>
              <input
                type="text"
                name="state"
                value={formData.state}
                onChange={handleChange}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="State name"
              />
            </div>

            {/* Branch Code */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Branch Code (4 Digits)</label>
              <input
                type="text"
                name="branch_code"
                value={formData.branch_code}
                onChange={handleChange}
                maxLength={4}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 font-mono"
                placeholder="1001"
              />
            </div>

            {/* BM Name */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Branch Manager (BM)</label>
              <input
                type="text"
                name="bm_name"
                value={formData.bm_name}
                onChange={handleChange}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="BM full name"
              />
            </div>

            {/* FO Name */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Field Officer (FO)</label>
              <input
                type="text"
                name="fo_name"
                value={formData.fo_name}
                onChange={handleChange}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="FO full name"
              />
            </div>

            {/* Current Address */}
            <div className="md:col-span-2 space-y-1.5">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Full Address</label>
              <textarea
                name="address_current"
                value={formData.address_current}
                onChange={handleChange}
                rows={2}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="Enter complete house address"
              />
            </div>
          </div>

          {draftSavedMsg && (
            <div className="bg-purple-50 border border-purple-200 text-purple-700 px-4 py-2.5 rounded-xl text-xs font-semibold">
              ✨ {draftSavedMsg}
            </div>
          )}

          <div className="flex flex-wrap gap-3 pt-4 border-t border-slate-100 justify-between items-center">
            <button
              type="button"
              onClick={handleClearDraft}
              className="px-4 py-2.5 border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 font-semibold rounded-xl text-xs transition"
            >
              Clear Form / Delete Draft
            </button>
            
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleSaveDraft}
                className="px-4 py-2.5 border border-purple-200 text-purple-700 bg-purple-50 hover:bg-purple-100 font-semibold rounded-xl text-xs transition"
              >
                💾 Save Draft
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-semibold rounded-xl text-sm transition-all shadow-md"
              >
                <Save className="w-4 h-4" /> {loading ? 'Saving Member…' : 'Save & Onboard Member'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
