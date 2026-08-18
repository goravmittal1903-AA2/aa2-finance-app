'use client'

import { useEffect, useState } from 'react'
import { getAll, putOne, delOne, supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import type { Loan } from '@/lib/types'
import { fdate } from '@/lib/utils'
import { Search, Upload, Trash2, Eye, CheckCircle, AlertCircle } from 'lucide-react'
import { confirmAction } from '@/lib/confirm'

interface DocumentRecord {
  doc_id: string
  loan_account_no: string
  customer_id: string
  member_name: string
  doc_type: string
  uploaded_date: string
  file_name: string
  file_size_kb: number
  mime_type: string
  file_path?: string
  file_data?: string // Legacy records only. New documents use private object storage.
  uploaded_by: string
}

const DOC_TYPES = [
  { value: 'AADHAAR_CARD', label: 'Aadhaar Card' },
  { value: 'PAN_CARD', label: 'PAN Card' },
  { value: 'SANCTION_LETTER', label: 'Sanction Letter' },
  { value: 'REPAYMENT_SCHEDULE', label: 'Repayment Schedule' },
  { value: 'CO_APPLICANT_KYC', label: 'Co-Applicant KYC' },
  { value: 'INCOME_PROOF', label: 'Income Proof' },
  { value: 'REVENUE_STAMP', label: 'Revenue Stamp' },
  { value: 'OTHER', label: 'Other Scanned Doc' }
]

export default function DocumentsPage() {
  const { user } = useAuth()
  const [docs, setDocs] = useState<DocumentRecord[]>([])
  const [loans, setLoans] = useState<Loan[]>([])
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('ALL')
  const [loading, setLoading] = useState(true)

  // Upload Form State
  const [selectedLoanAcc, setSelectedLoanAcc] = useState('')
  const [docType, setDocType] = useState('AADHAAR_CARD')
  const [uploading, setUploading] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    loadDocsAndLoans()
    const handler = () => loadDocsAndLoans()
    window.addEventListener('aa2_data_changed', handler)
    return () => window.removeEventListener('aa2_data_changed', handler)
  }, [])

  async function loadDocsAndLoans() {
    setLoading(true)
    try {
      const [d, l] = await Promise.all([
        getAll<DocumentRecord>('documents'),
        getAll<Loan>('loans')
      ])
      setDocs(d.sort((a,b) => (b.uploaded_date || '').localeCompare(a.uploaded_date || '')))
      setLoans(l.sort((a,b) => (b.loan_account_no || '').localeCompare(a.loan_account_no || '')))
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setErrorMsg('')
    setSuccessMsg('')

    const fileInput = (e.currentTarget.elements.namedItem('file') as HTMLInputElement)
    const file = fileInput?.files?.[0]
    if (!selectedLoanAcc || !file) {
      setErrorMsg('Please select a loan account and file to upload.')
      return
    }

    const loan = loans.find(l => l.loan_account_no === selectedLoanAcc)
    if (!loan) {
      setErrorMsg('Selected loan account was not found.')
      return
    }

    setUploading(true)

    try {
      if (file.size > 25 * 1024 * 1024) throw new Error('Files must be 25 MB or smaller.')

      const formData = new FormData()
      formData.append('file', file)
      formData.append('loanAccountNo', selectedLoanAcc)
      formData.append('docType', docType)

      const uploadRes = await fetch('/api/storage/upload', {
        method: 'POST',
        body: formData,
      })

      const uploadData = await uploadRes.json() as { ok?: boolean; path?: string; error?: string }
      if (!uploadRes.ok || !uploadData.path) {
        throw new Error(uploadData.error || 'File upload failed.')
      }

      const newDoc: DocumentRecord = {
        doc_id: `DOC-${Date.now()}`,
        loan_account_no: selectedLoanAcc,
        customer_id: loan.customer_id,
        member_name: loan.member_name_cache || loan.member_name,
        doc_type: docType,
        uploaded_date: new Date().toISOString().slice(0, 10),
        file_name: file.name,
        file_size_kb: Math.round(file.size / 1024),
        mime_type: file.type || 'application/octet-stream',
        file_path: uploadData.path,
        uploaded_by: user?.email || 'unknown',
      }
      await putOne('documents', newDoc, 'doc_id')
      await putOne('loan_documents', newDoc, 'doc_id')
      const { logAuditEvent } = await import('@/lib/audit')
      await logAuditEvent('CREATE', 'documents', newDoc.doc_id, `Uploaded document "${file.name}" (${docType}) for loan ${selectedLoanAcc}`, user?.email)

      setSuccessMsg('Document uploaded to Vault successfully.')
      fileInput.value = ''
      setSelectedLoanAcc('')
      await loadDocsAndLoans()
    } catch (err: unknown) {
      console.error(err)
      setErrorMsg(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  const handleView = async (doc: DocumentRecord) => {
    if (doc.file_path) {
      try {
        const response = await fetch(`/api/storage/signed-url?path=${encodeURIComponent(doc.file_path)}`)
        const result = await response.json() as { url?: string; error?: string }
        if (!response.ok || !result.url) throw new Error(result.error || 'Could not open document.')
        window.open(result.url, '_blank', 'noopener,noreferrer')
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Could not open document.')
      }
      return
    }
    if (!doc.file_data) {
      setErrorMsg('File path missing for this document record.')
      return
    }
    const dataUrl = `data:${doc.mime_type};base64,${doc.file_data}`
    const win = window.open('', '_blank')
    if (!win) return
    if (doc.mime_type.startsWith('image/')) {
      win.document.write(`<html><body style="margin:0;background:#000;display:flex;align-items:center;justify-content:center;height:100vh;"><img src="${dataUrl}" style="max-width:100%;max-height:100%;object-fit:contain;"></body></html>`)
    } else {
      win.document.write(`<html><body style="margin:0;"><embed src="${dataUrl}" type="application/pdf" width="100%" height="100%" style="height:100vh;"></body></html>`)
    }
  }

  const handleDelete = async (doc: DocumentRecord) => {
    const ok = await confirmAction({
      title: 'Confirm Delete',
      message: `Are you sure you want to delete "${doc.file_name || 'this document'}"?`,
      confirmText: 'Delete Document',
      variant: 'danger',
    })
    if (!ok) return

    try {
      if (doc.file_path) {
        const response = await fetch(`/api/storage/signed-url?path=${encodeURIComponent(doc.file_path)}`, { method: 'DELETE' })
        if (!response.ok) {
          const result = await response.json() as { error?: string }
          throw new Error(result.error || 'Could not remove the stored file.')
        }
      }
      const { moveToTrash } = await import('@/lib/trash')
      await moveToTrash('documents', doc.doc_id, doc, doc.file_name || doc.doc_id, user?.email || 'system')
      await loadDocsAndLoans()
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Deletion failed.')
    }
  }

  // Filter local docs
  const filtered = docs.filter(d => {
    const q = search.toLowerCase()
    const matchSearch = !q ||
      (d.customer_id || '').toLowerCase().includes(q) ||
      (d.member_name || '').toLowerCase().includes(q) ||
      (d.loan_account_no || '').toLowerCase().includes(q) ||
      (d.file_name || '').toLowerCase().includes(q)
    const matchType = typeFilter === 'ALL' || d.doc_type === typeFilter
    return matchSearch && matchType
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Document Vault</h1>
        <p className="text-slate-500 text-sm mt-0.5">Scanned KYCs, Excel sheets, sanction letters, and agreements.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Upload Box */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 space-y-4">
            <h2 className="text-sm font-bold text-slate-800 pb-2 border-b border-slate-100 flex items-center gap-2">
              <Upload className="w-4 h-4 text-blue-500" /> Upload Document
            </h2>

            {successMsg && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 p-3 rounded-xl text-xs flex items-center gap-2">
                <CheckCircle className="w-4 h-4 flex-shrink-0" /> {successMsg}
              </div>
            )}
            {errorMsg && (
              <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" /> {errorMsg}
              </div>
            )}

            <form onSubmit={handleUpload} className="space-y-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Select Loan Account *</label>
                <select
                  value={selectedLoanAcc}
                  onChange={e => setSelectedLoanAcc(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">-- Choose Loan Account --</option>
                  {loans.map(l => (
                    <option key={l.loan_account_no} value={l.loan_account_no}>
                      {l.loan_account_no} — {l.member_name_cache || l.member_name} ({l.customer_id})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Document Type</label>
                <select
                  value={docType}
                  onChange={e => setDocType(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {DOC_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Select File (PDF, Excel, Word, Image) *</label>
                <input
                  type="file"
                  name="file"
                  required
                  accept=".pdf,.jpg,.jpeg,.png,.webp,.xls,.xlsx,.csv,.doc,.docx,.txt,.zip"
                  className="w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
              </div>

              <button
                type="submit"
                disabled={uploading}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-semibold rounded-xl text-xs transition shadow-md shadow-blue-500/10"
              >
                {uploading ? 'Uploading…' : 'Upload File to Vault'}
              </button>
            </form>
          </div>
        </div>

        {/* Right Column: List of Files */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          {/* Filters Bar */}
          <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search documents by member, A/C, customer ID, or filename…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none"
              />
            </div>
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none"
            >
              <option value="ALL">All Types</option>
              {DOC_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-wide">
                  <th className="text-left px-5 py-3 font-semibold">Loan A/C</th>
                  <th className="text-left px-5 py-3 font-semibold">Member</th>
                  <th className="text-left px-5 py-3 font-semibold">Document Type</th>
                  <th className="text-left px-5 py-3 font-semibold">Uploaded Date</th>
                  <th className="text-right px-5 py-3 font-semibold">Size</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading && (
                  <tr><td colSpan={6} className="px-5 py-8 text-center text-slate-400">Loading documents…</td></tr>
                )}
                {!loading && filtered.length === 0 && (
                  <tr><td colSpan={6} className="px-5 py-8 text-center text-slate-400">No documents found</td></tr>
                )}
                {filtered.map(d => (
                  <tr key={d.doc_id} className="tbl-row">
                    <td className="px-5 py-3 font-mono text-[10px] text-blue-600 font-semibold">{d.loan_account_no}</td>
                    <td className="px-5 py-3">
                      <div className="font-semibold text-slate-800">{d.member_name}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{d.customer_id}</div>
                    </td>
                    <td className="px-5 py-3">
                      <span className="badge bg-slate-100 text-slate-600 text-[9px]">
                        {d.doc_type?.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-500">{fdate(d.uploaded_date)}</td>
                    <td className="px-5 py-3 text-right text-slate-500 font-mono">{d.file_size_kb || 0} KB</td>
                    <td className="px-5 py-3">
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => handleView(d)}
                          className="p-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg transition"
                          title="View Document"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(d)}
                          className="p-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition"
                          title="Delete Document"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  )
}
