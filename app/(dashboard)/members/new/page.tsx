'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getAll, putOne } from '@/lib/supabase'
import { logAuditEvent } from '@/lib/audit'
import { toast } from '@/lib/toast'
import type { Customer } from '@/lib/types'
import {
  ArrowLeft, Save, AlertTriangle, Check, ArrowRight,
  UserCheck, Search, ShieldCheck, MapPin, Building, User, Edit3
} from 'lucide-react'
import { todayISO, calculateAgeInYearsMonths } from '@/lib/utils'
import { useAuth } from '@/lib/auth-context'
import { confirmAction } from '@/lib/confirm'
import { lookupPincode } from '@/lib/pincode'

const STEPS = [
  { id: 1, label: 'Lookup & Dedupe', desc: 'Pre-check' },
  { id: 2, label: 'Personal Info', desc: 'Basic Details' },
  { id: 3, label: 'Identity & KYC', desc: 'Aadhaar / PAN' },
  { id: 4, label: 'Address', desc: 'Location' },
  { id: 5, label: 'Branch & Review', desc: 'Assignment' },
]

interface MemberFormData {
  full_name: string
  father_husband_name: string
  gender: string
  dob: string
  mobile: string
  aadhar_last4: string
  pan_no: string
  village_city: string
  pincode: string
  district: string
  state: string
  branch_code: string
  bm_name: string
  fo_name: string
  am_name: string
  rm_name: string
  center_no: string
  cluster_no: string
  address_current: string
}

export default function NewMemberPage() {
  const DRAFT_KEY = 'aa2_draft_member'
  const { user } = useAuth()
  const router = useRouter()

  const [currentStep, setCurrentStep] = useState(1)
  const [formData, setFormData] = useState<MemberFormData>(() => {
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
      pan_no: '',
      village_city: '',
      pincode: '',
      district: '',
      state: 'UTTARAKHAND',
      branch_code: '',
      bm_name: '',
      fo_name: '',
      am_name: '',
      rm_name: '',
      center_no: '',
      cluster_no: '',
      address_current: '',
    }
  })

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [draftSavedMsg, setDraftSavedMsg] = useState('')
  
  // Quick Search / Dedupe State
  const [sfdcSearchQuery, setSfdcSearchQuery] = useState('')
  const [sfdcSearchResults, setSfdcSearchResults] = useState<Customer[]>([])
  const [sfdcSearching, setSfdcSearching] = useState(false)
  const [sfdcSearched, setSfdcSearched] = useState(false)

  const ageInfo = calculateAgeInYearsMonths(formData.dob)

  const handleSfdcSearch = async (query: string) => {
    setSfdcSearchQuery(query)
    const clean = query.trim().toUpperCase()
    if (!clean || clean.length < 3) {
      setSfdcSearchResults([])
      setSfdcSearched(false)
      return
    }
    setSfdcSearching(true)
    setSfdcSearched(true)
    try {
      const all = await getAll<Customer>('customers')
      const matches = all.filter(c => {
        const mob = c.mobile?.toUpperCase() || ''
        const aad = c.aadhar_last4?.toUpperCase() || ''
        const pan = (c.pan_no || '').toUpperCase()
        const id = (c.customer_id || '').toUpperCase()
        const name = (c.full_name || '').toUpperCase()
        return mob.includes(clean) || aad.includes(clean) || pan.includes(clean) || id.includes(clean) || name.includes(clean)
      })
      setSfdcSearchResults(matches.slice(0, 5))
    } catch (err) {
      console.error(err)
    } finally {
      setSfdcSearching(false)
    }
  }

  // Populate existing member to update details
  const handlePopulateExisting = (existing: Customer) => {
    setFormData({
      full_name: existing.full_name || '',
      father_husband_name: existing.father_husband_name || '',
      gender: existing.gender || 'Female',
      dob: existing.dob || '',
      mobile: existing.mobile || '',
      aadhar_last4: existing.aadhar_last4 || '',
      pan_no: existing.pan_no || '',
      village_city: existing.village_city || '',
      pincode: existing.pincode || '',
      district: existing.district || '',
      state: existing.state || 'UTTARAKHAND',
      branch_code: existing.branch_code || '',
      bm_name: existing.bm_name || '',
      fo_name: existing.fo_name || '',
      am_name: existing.am_name || '',
      rm_name: existing.rm_name || '',
      center_no: existing.center_no || '',
      cluster_no: existing.cluster_no || '',
      address_current: existing.address_current || '',
    })
    toast.success('Member Loaded', `Loaded details for ${existing.full_name} (${existing.customer_id}). You can now edit and save.`)
    setCurrentStep(2)
  }

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    let { name, value } = e.target

    if (name === 'mobile') {
      value = value.replace(/\D/g, '').slice(0, 10)
    } else if (name === 'aadhar_last4') {
      value = value.replace(/\D/g, '').slice(0, 4)
    } else if (name === 'pan_no') {
      value = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10)
    } else if (name === 'pincode') {
      value = value.replace(/\D/g, '').slice(0, 6)
      setFormData(prev => ({ ...prev, pincode: value }))

      if (value.length === 6) {
        const info = await lookupPincode(value)
        if (info) {
          setFormData(prev => ({
            ...prev,
            district: info.district || prev.district,
            state: info.state || prev.state,
          }))
        }
      }
      return
    }

    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSaveDraft = () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(formData))
    setDraftSavedMsg('Draft saved locally in your browser.')
    setTimeout(() => setDraftSavedMsg(''), 3000)
  }

  const handleClearDraft = async () => {
    const ok = await confirmAction({
      title: 'Clear Form',
      message: 'Are you sure you want to clear all entered form details?',
      confirmText: 'Yes, Clear Form',
      variant: 'danger'
    })
    if (!ok) return
    localStorage.removeItem(DRAFT_KEY)
    setFormData({
      full_name: '',
      father_husband_name: '',
      gender: 'Female',
      dob: '',
      mobile: '',
      aadhar_last4: '',
      pan_no: '',
      village_city: '',
      pincode: '',
      district: '',
      state: 'UTTARAKHAND',
      branch_code: '',
      bm_name: '',
      fo_name: '',
      am_name: '',
      rm_name: '',
      center_no: '',
      cluster_no: '',
      address_current: '',
    })
    setCurrentStep(1)
  }

  const validateStep = (step: number): boolean => {
    setError('')
    if (step === 2) {
      if (!formData.full_name.trim()) { setError('Full Name is required.'); return false }
      if (!formData.father_husband_name.trim()) { setError('Father / Husband Name is required.'); return false }
      if (!formData.dob) { setError('Date of Birth is required.'); return false }
      if (!formData.mobile || formData.mobile.length !== 10) { setError('Valid 10-digit mobile number is required.'); return false }
    }
    if (step === 3) {
      if (formData.pan_no && !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(formData.pan_no.trim())) {
        setError('Invalid PAN Card format (e.g. ABCDE1234F).')
        return false
      }
      if (formData.aadhar_last4 && formData.aadhar_last4.length !== 4) {
        setError('Aadhaar must be exactly the last 4 digits.')
        return false
      }
    }
    if (step === 4) {
      if (!formData.village_city.trim()) { setError('Village / City is required.'); return false }
      if (!formData.district.trim()) { setError('District is required.'); return false }
      if (!formData.state.trim()) { setError('State is required.'); return false }
    }
    return true
  }

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(5, prev + 1))
    }
  }

  const handlePrev = () => {
    setError('')
    setCurrentStep(prev => Math.max(1, prev - 1))
  }

  const generateCustomerNumber = async (): Promise<string> => {
    const existing = await getAll<Customer>('customers')
    const maxNum = existing.reduce((max, c) => {
      const match = (c.customer_id || '').match(/MEM(\d+)/i)
      if (match) {
        const val = parseInt(match[1], 10)
        return val > max ? val : max
      }
      return max
    }, 10000)
    return `MEM${maxNum + 1}`
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateStep(2) || !validateStep(3) || !validateStep(4)) return

    setLoading(true)
    setError('')

    try {
      const customerId = await generateCustomerNumber()
      const newCustomer: Customer = {
        customer_id: customerId,
        full_name: formData.full_name.trim(),
        father_husband_name: formData.father_husband_name.trim(),
        gender: formData.gender,
        dob: formData.dob,
        mobile: formData.mobile.trim(),
        aadhar_last4: formData.aadhar_last4.trim(),
        pan_no: formData.pan_no.trim() || undefined,
        village_city: formData.village_city.trim(),
        pincode: formData.pincode.trim() || undefined,
        district: formData.district.trim(),
        state: formData.state.trim(),
        branch_code: formData.branch_code.trim() || 'Head Office',
        bm_name: formData.bm_name.trim() || '',
        fo_name: formData.fo_name.trim() || '',
        am_name: formData.am_name.trim() || '',
        rm_name: formData.rm_name.trim() || '',
        center_no: formData.center_no.trim() || '',
        cluster_no: formData.cluster_no.trim() || '',
        address_current: formData.address_current.trim() || '',
        created_at: new Date().toISOString(),
        created_by: user?.email || 'system',
        updated_at: new Date().toISOString(),
        updated_by: user?.email || 'system',
      }

      await putOne('customers', newCustomer, 'customer_id')

      // Record immutable audit log on member creation
      await logAuditEvent({
        event_type: 'CREATE',
        entity_type: 'MEMBER',
        entity_id: customerId,
        actor_email: user?.email || 'system',
        actor_name: (user?.email || 'system').split('@')[0],
        actor_role: 'staff',
        branch_code: newCustomer.branch_code,
        narration: `New member registered: ${newCustomer.full_name} (${customerId}) with mobile ${newCustomer.mobile}`,
        new_values: newCustomer,
      })

      localStorage.removeItem(DRAFT_KEY)
      toast.success('Member Registered', `Member ${newCustomer.full_name} onboarded with ID ${customerId}.`)
      window.dispatchEvent(new Event('aa2_data_changed'))
      router.push(`/members/${customerId}`)
    } catch (err: any) {
      setError(err.message || 'Failed to save member.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <Link href="/members" className="flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-800 transition">
          <ArrowLeft className="w-4 h-4" /> Back to Members
        </Link>
        <span className="text-xs font-mono text-slate-400">AA2 Microfinance Borrower Onboarding</span>
      </div>

      {/* Stepper Progress Header */}
      <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-xs">
        <div className="grid grid-cols-5 gap-2">
          {STEPS.map((s) => {
            const isCompleted = currentStep > s.id
            const isActive = currentStep === s.id
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  if (s.id < currentStep || validateStep(currentStep)) {
                    setCurrentStep(s.id)
                  }
                }}
                className={`flex flex-col items-center text-center p-2 rounded-xl transition ${
                  isActive ? 'bg-blue-50 border border-blue-200' : ''
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold mb-1 transition ${
                    isCompleted
                      ? 'bg-emerald-600 text-white'
                      : isActive
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  {isCompleted ? <Check className="w-4 h-4" /> : s.id}
                </div>
                <span className={`text-[11px] font-bold block truncate max-w-full ${isActive ? 'text-blue-700' : isCompleted ? 'text-slate-700' : 'text-slate-400'}`}>
                  {s.label}
                </span>
                <span className="text-[9.5px] text-slate-400 hidden sm:block">{s.desc}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-xs font-semibold flex items-center gap-2 tab-transition">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Step Form Body with Tab Transition */}
      <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-xs">
        {/* STEP 1: Quick Member Lookup & Dedupe Check */}
        {currentStep === 1 && (
          <div className="space-y-5 tab-transition">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Search className="w-4 h-4 text-blue-600" /> Step 1: Quick Member Lookup (Deduplication Check)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Search existing database by Mobile, Aadhaar Last 4, PAN, Member ID, or Name before registration.
              </p>
            </div>

            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={sfdcSearchQuery}
                  onChange={e => handleSfdcSearch(e.target.value)}
                  placeholder="Enter 10-digit mobile, 4-digit Aadhaar, PAN card, or Member ID…"
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                />
              </div>

              {sfdcSearching && (
                <p className="text-xs text-slate-400 py-2">Searching database…</p>
              )}

              {sfdcSearched && sfdcSearchResults.length > 0 && (
                <div className="border border-amber-200 bg-amber-50/50 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-800">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <span>Existing matching member record(s) found!</span>
                  </div>
                  <div className="space-y-2">
                    {sfdcSearchResults.map(m => (
                      <div key={m.customer_id} className="bg-white p-3.5 rounded-xl border border-amber-200 flex flex-wrap items-center justify-between gap-3 text-xs">
                        <div>
                          <p className="font-bold text-slate-800">{m.full_name} <span className="font-mono text-blue-600 font-bold">({m.customer_id})</span></p>
                          <p className="text-slate-500 text-[11px] mt-0.5">Mobile: {m.mobile || '—'} · Aadhaar: {m.aadhar_last4 || '—'} · {m.village_city || '—'}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handlePopulateExisting(m)}
                            className="px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold rounded-lg text-xs border border-purple-200 flex items-center gap-1 transition"
                          >
                            <Edit3 className="w-3 h-3" /> Update Details
                          </button>
                          <Link href={`/members/${m.customer_id}`} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-xs transition">
                            View Profile
                          </Link>
                          <Link href={`/loans/new?customer_id=${m.customer_id}`} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg text-xs transition">
                            Sanction Loan
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {sfdcSearched && sfdcSearchResults.length === 0 && !sfdcSearching && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-xl text-xs flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>No duplicate member found for &quot;{sfdcSearchQuery}&quot;. You can safely proceed to new registration below.</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* STEP 2: Personal & Contact Information */}
        {currentStep === 2 && (
          <div className="space-y-5 tab-transition">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <User className="w-4 h-4 text-blue-600" /> Step 2: Personal & Contact Details
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">Enter the borrower&apos;s primary identity details.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Full Name (As per KYC) *</label>
                <input
                  type="text"
                  name="full_name"
                  value={formData.full_name}
                  onChange={handleChange}
                  placeholder="e.g. Sunita Devi"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Father / Husband Name *</label>
                <input
                  type="text"
                  name="father_husband_name"
                  value={formData.father_husband_name}
                  onChange={handleChange}
                  placeholder="e.g. Rajesh Kumar"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-semibold text-slate-700 block">Date of Birth *</label>
                  {ageInfo && (
                    <span className="text-[10.5px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      Age: {ageInfo.label} ({ageInfo.years} Yrs)
                    </span>
                  )}
                </div>
                <input
                  type="date"
                  name="dob"
                  value={formData.dob}
                  onChange={handleChange}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Gender *</label>
                <select
                  name="gender"
                  value={formData.gender}
                  onChange={handleChange}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Female">Female</option>
                  <option value="Male">Male</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <label className="font-semibold text-slate-700 block">Mobile Number (10 Digits) *</label>
                  {formData.mobile.length === 10 && (
                    <span className="text-[10px] text-emerald-600 font-bold">10 Digits Valid</span>
                  )}
                </div>
                <input
                  type="text"
                  name="mobile"
                  value={formData.mobile}
                  onChange={handleChange}
                  placeholder="9876543210"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                />
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: Identity & KYC Documents */}
        {currentStep === 3 && (
          <div className="space-y-5 tab-transition">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-600" /> Step 3: Identity & KYC Verification
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">Capture government identification numbers.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-semibold text-slate-700 block">Aadhaar (Last 4 Digits)</label>
                  {formData.aadhar_last4.length === 4 && (
                    <span className="text-[10px] text-emerald-600 font-bold">4 Digits Entered</span>
                  )}
                </div>
                <input
                  type="text"
                  name="aadhar_last4"
                  value={formData.aadhar_last4}
                  onChange={handleChange}
                  placeholder="e.g. 5678"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm tracking-widest"
                />
                <p className="text-[10px] text-slate-400 mt-1">Only the last 4 digits are recorded as per UIDAI guidelines.</p>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">PAN Card Number</label>
                <input
                  type="text"
                  name="pan_no"
                  value={formData.pan_no}
                  onChange={handleChange}
                  placeholder="e.g. ABCDE1234F"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm uppercase"
                />
                <p className="text-[10px] text-slate-400 mt-1">Format: 5 letters, 4 numbers, 1 letter.</p>
              </div>
            </div>
          </div>
        )}

        {/* STEP 4: Address & Residential Location */}
        {currentStep === 4 && (
          <div className="space-y-5 tab-transition">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-blue-600" /> Step 4: Residential Address & Location
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">Enter location details. Pincode auto-resolves District & State.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="md:col-span-2">
                <label className="font-semibold text-slate-700 block mb-1">Current Residential Address / Landmark</label>
                <textarea
                  rows={2}
                  name="address_current"
                  value={formData.address_current}
                  onChange={handleChange}
                  placeholder="House No., Street / Landmark…"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Village / City *</label>
                <input
                  type="text"
                  name="village_city"
                  value={formData.village_city}
                  onChange={handleChange}
                  placeholder="e.g. Gagalheri"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Pincode (6 Digits)</label>
                <input
                  type="text"
                  name="pincode"
                  value={formData.pincode}
                  onChange={handleChange}
                  placeholder="247001"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">District *</label>
                <input
                  type="text"
                  name="district"
                  value={formData.district}
                  onChange={handleChange}
                  placeholder="Saharanpur"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">State *</label>
                <input
                  type="text"
                  name="state"
                  value={formData.state}
                  onChange={handleChange}
                  placeholder="UTTARAKHAND"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
                />
              </div>
            </div>
          </div>
        )}

        {/* STEP 5: Branch Assignment & Final Review */}
        {currentStep === 5 && (
          <div className="space-y-5 tab-transition">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Building className="w-4 h-4 text-blue-600" /> Step 5: Branch Assignment & Final Review
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">Assign operating branch and verify all details before submitting.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Branch Name</label>
                <input
                  type="text"
                  name="branch_code"
                  value={formData.branch_code}
                  onChange={handleChange}
                  placeholder="e.g. Gagalheri"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Branch Manager (BM)</label>
                <input
                  type="text"
                  name="bm_name"
                  value={formData.bm_name}
                  onChange={handleChange}
                  placeholder="e.g. Amit Sharma"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Field Officer (FO)</label>
                <input
                  type="text"
                  name="fo_name"
                  value={formData.fo_name}
                  onChange={handleChange}
                  placeholder="e.g. Rohit Verma"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Area Manager (AM)</label>
                <input
                  type="text"
                  name="am_name"
                  value={formData.am_name}
                  onChange={handleChange}
                  placeholder="e.g. AM Name"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Regional Manager (RM)</label>
                <input
                  type="text"
                  name="rm_name"
                  value={formData.rm_name}
                  onChange={handleChange}
                  placeholder="e.g. RM Name"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Center Number</label>
                <input
                  type="text"
                  name="center_no"
                  value={formData.center_no}
                  onChange={handleChange}
                  placeholder="e.g. Center 12"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Cluster Number</label>
                <input
                  type="text"
                  name="cluster_no"
                  value={formData.cluster_no}
                  onChange={handleChange}
                  placeholder="e.g. Cluster 04"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                />
              </div>
            </div>

            {/* Comprehensive Review Card */}
            <div className="border border-slate-200 bg-slate-50/70 rounded-2xl p-5 space-y-3">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Member Dossier Summary</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="text-slate-400 text-[10.5px] block">Full Name</span>
                  <span className="font-bold text-slate-800">{formData.full_name || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10.5px] block">Father/Husband</span>
                  <span className="font-bold text-slate-800">{formData.father_husband_name || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10.5px] block">Mobile</span>
                  <span className="font-mono font-bold text-slate-800">{formData.mobile || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10.5px] block">DOB / Age</span>
                  <span className="font-bold text-slate-800">{formData.dob || '—'} ({ageInfo?.years || 0} Yrs)</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10.5px] block">Aadhaar (Last 4)</span>
                  <span className="font-mono font-bold text-slate-800 tracking-wider">•••• •••• {formData.aadhar_last4 || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10.5px] block">PAN</span>
                  <span className="font-mono font-bold text-slate-800">{formData.pan_no || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10.5px] block">Village / District</span>
                  <span className="font-bold text-slate-800">{formData.village_city || '—'}, {formData.district || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10.5px] block">Branch / FO</span>
                  <span className="font-bold text-slate-800">{formData.branch_code || 'Head Office'} / {formData.fo_name || '—'}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons & Draft Saving */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-6 border-t border-slate-100 mt-6">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleClearDraft}
              className="px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-xl transition"
            >
              Clear Form
            </button>
            <button
              type="button"
              onClick={handleSaveDraft}
              className="px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
            >
              Save Draft
            </button>
            {draftSavedMsg && (
              <span className="text-[11px] text-emerald-600 font-semibold">{draftSavedMsg}</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {currentStep > 1 && (
              <button
                type="button"
                onClick={handlePrev}
                className="px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold rounded-xl text-xs transition"
              >
                Back
              </button>
            )}

            {currentStep < 5 ? (
              <button
                type="button"
                onClick={handleNext}
                className="flex items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl text-xs transition shadow-sm"
              >
                Next Step <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading}
                className="flex items-center gap-2 px-6 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition shadow-md"
              >
                <Save className="w-4 h-4" />
                {loading ? 'Saving Member…' : 'Confirm & Onboard Member'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
