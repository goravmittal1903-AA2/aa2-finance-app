'use client'

import { useEffect, useState } from 'react'
import { getAll, putOne, delOne } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import type { Product } from '@/lib/types'
import { inr } from '@/lib/utils'
import { Plus, Edit2, Trash2, ToggleLeft, ToggleRight, CheckCircle, AlertCircle, Package, X, Save } from 'lucide-react'
import { confirmAction } from '@/lib/confirm'

const EMPTY_PRODUCT: Omit<Product, 'product_id' | 'created_at' | 'updated_at'> = {
  name: '',
  description: '',
  min_loan: 5000,
  max_loan: 100000,
  interest_rate: 24,
  file_charge_pct: 1,
  min_tenure: 4,
  max_tenure: 52,
  frequency: 'Weekly',
  repayment_mode: 'Cash',
  active: true,
}

export default function ProductsPage() {
  const { user } = useAuth()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ ...EMPTY_PRODUCT })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    loadProducts()
    const handler = () => loadProducts()
    window.addEventListener('aa2_data_changed', handler)
    return () => window.removeEventListener('aa2_data_changed', handler)
  }, [])

  async function loadProducts() {
    setLoading(true)
    try {
      const data = await getAll<Product>('products')
      setProducts(data.sort((a, b) => a.name.localeCompare(b.name)))
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load products.')
    } finally {
      setLoading(false)
    }
  }

  function openCreate() {
    setForm({ ...EMPTY_PRODUCT })
    setEditId(null)
    setShowModal(true)
  }

  function openEdit(p: Product) {
    setForm({
      name: p.name, description: p.description || '',
      min_loan: p.min_loan, max_loan: p.max_loan,
      interest_rate: p.interest_rate, file_charge_pct: p.file_charge_pct,
      min_tenure: p.min_tenure, max_tenure: p.max_tenure,
      frequency: p.frequency, repayment_mode: p.repayment_mode, active: p.active,
    })
    setEditId(p.product_id)
    setShowModal(true)
  }

  async function handleSave() {
    if (!form.name.trim()) { setErrorMessage('Product name is required.'); return }
    setSaving(true); setMessage(''); setErrorMessage('')
    try {
      const now = new Date().toISOString()
      if (editId) {
        await putOne('products', { product_id: editId, ...form, updated_at: now }, 'product_id')
        setMessage('Product updated successfully.')
      } else {
        const pid = 'PROD-' + Date.now()
        await putOne('products', { product_id: pid, ...form, created_at: now, updated_at: now }, 'product_id')
        setMessage('Product created successfully.')
      }
      setShowModal(false)
      await loadProducts()
    } catch (err: any) {
      setErrorMessage(err.message || 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(p: Product) {
    try {
      await putOne('products', { ...p, active: !p.active, updated_at: new Date().toISOString() }, 'product_id')
      setMessage(`${p.name} ${!p.active ? 'activated' : 'deactivated'}.`)
      await loadProducts()
    } catch (err: any) { setErrorMessage(err.message || 'Failed.') }
  }

  async function handleDelete(p: Product) {
    const ok = await confirmAction({
      title: 'Confirm Delete',
      message: `Move product "${p.name}" to Trash Can?`,
      confirmText: 'Move to Trash',
      variant: 'danger',
    })
    if (!ok) return
    try {
      const { moveToTrash } = await import('@/lib/trash')
      await moveToTrash('products', p.product_id, p, p.name, user?.email || 'system')
      setMessage(`${p.name} moved to Trash.`)
      await loadProducts()
    } catch (err: any) { setErrorMessage(err.message || 'Delete failed.') }
  }

  const setField = (key: string, val: string | number | boolean) => setForm(f => ({ ...f, [key]: val }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Loan Products</h1>
          <p className="text-slate-500 text-sm mt-0.5">Manage product master — interest rates, tenure, charges, and frequency.</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow-md shadow-blue-500/20 transition">
          <Plus className="w-4 h-4" /> Add Product
        </button>
      </div>

      {message && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-xl text-sm flex items-center gap-2"><CheckCircle className="w-4 h-4" /> {message}</div>}
      {errorMessage && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-center gap-2"><AlertCircle className="w-4 h-4" /> {errorMessage}</div>}

      {loading && <div className="text-center py-16 text-slate-400">Loading products…</div>}

      {!loading && products.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center">
          <Package className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-600 font-semibold">No loan products configured</p>
          <p className="text-sm text-slate-400 mt-1">Create your first product to start offering loans.</p>
          <button onClick={openCreate} className="mt-4 px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl">Add First Product</button>
        </div>
      )}

      {!loading && products.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {products.map(p => (
            <div key={p.product_id} className={`bg-white rounded-2xl border shadow-sm p-5 space-y-3 transition ${p.active ? 'border-slate-100' : 'border-slate-200 opacity-60'}`}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-800">{p.name}</span>
                    <span className={`badge text-[9px] ${p.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {p.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  {p.description && <p className="text-[11px] text-slate-400 mt-0.5">{p.description}</p>}
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => toggleActive(p)} title={p.active ? 'Deactivate' : 'Activate'} className="p-1.5 hover:bg-slate-100 rounded-lg transition">
                    {p.active ? <ToggleRight className="w-4 h-4 text-emerald-600" /> : <ToggleLeft className="w-4 h-4 text-slate-400" />}
                  </button>
                  <button onClick={() => openEdit(p)} className="p-1.5 hover:bg-blue-50 text-blue-600 rounded-lg transition"><Edit2 className="w-3.5 h-3.5" /></button>
                  <button onClick={() => handleDelete(p)} className="p-1.5 hover:bg-red-50 text-red-500 rounded-lg transition"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="bg-slate-50 rounded-xl px-3 py-2">
                  <div className="text-slate-400 font-medium">Loan Range</div>
                  <div className="font-bold text-slate-700 mt-0.5">{inr(p.min_loan)} – {inr(p.max_loan)}</div>
                </div>
                <div className="bg-slate-50 rounded-xl px-3 py-2">
                  <div className="text-slate-400 font-medium">Interest Rate (p.a.)</div>
                  <div className="font-bold text-slate-700 mt-0.5">{p.interest_rate}%</div>
                </div>
                <div className="bg-slate-50 rounded-xl px-3 py-2">
                  <div className="text-slate-400 font-medium">File Charge</div>
                  <div className="font-bold text-slate-700 mt-0.5">{p.file_charge_pct}%</div>
                </div>
                <div className="bg-slate-50 rounded-xl px-3 py-2">
                  <div className="text-slate-400 font-medium">Tenure</div>
                  <div className="font-bold text-slate-700 mt-0.5">{p.min_tenure} – {p.max_tenure} installments</div>
                </div>
                <div className="bg-slate-50 rounded-xl px-3 py-2">
                  <div className="text-slate-400 font-medium">Frequency</div>
                  <div className="font-bold text-slate-700 mt-0.5">{p.frequency}</div>
                </div>
                <div className="bg-slate-50 rounded-xl px-3 py-2">
                  <div className="text-slate-400 font-medium">Repayment Mode</div>
                  <div className="font-bold text-slate-700 mt-0.5">{p.repayment_mode}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-800">{editId ? 'Edit Product' : 'Create New Product'}</h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="field-label">Product Name *</label>
                <input value={form.name} onChange={e => setField('name', e.target.value)} className="field-input" placeholder="e.g. Weekly Income Loan" />
              </div>
              <div>
                <label className="field-label">Description</label>
                <textarea value={form.description} onChange={e => setField('description', e.target.value)} className="field-input min-h-[60px]" placeholder="Short description of this product" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="field-label">Min Loan Amount (₹)</label>
                  <input type="number" value={form.min_loan} onChange={e => setField('min_loan', Number(e.target.value))} className="field-input" />
                </div>
                <div>
                  <label className="field-label">Max Loan Amount (₹)</label>
                  <input type="number" value={form.max_loan} onChange={e => setField('max_loan', Number(e.target.value))} className="field-input" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="field-label">Interest Rate % (p.a.)</label>
                  <input type="number" step="0.1" value={form.interest_rate} onChange={e => setField('interest_rate', Number(e.target.value))} className="field-input" />
                </div>
                <div>
                  <label className="field-label">File Charge % of Loan</label>
                  <input type="number" step="0.1" value={form.file_charge_pct} onChange={e => setField('file_charge_pct', Number(e.target.value))} className="field-input" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="field-label">Min Tenure (installments)</label>
                  <input type="number" value={form.min_tenure} onChange={e => setField('min_tenure', Number(e.target.value))} className="field-input" />
                </div>
                <div>
                  <label className="field-label">Max Tenure (installments)</label>
                  <input type="number" value={form.max_tenure} onChange={e => setField('max_tenure', Number(e.target.value))} className="field-input" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="field-label">Frequency</label>
                  <select value={form.frequency} onChange={e => setField('frequency', e.target.value)} className="field-input">
                    <option>Weekly</option><option>Bi-Monthly</option><option>Monthly</option><option>Quarterly</option>
                  </select>
                </div>
                <div>
                  <label className="field-label">Repayment Mode</label>
                  <select value={form.repayment_mode} onChange={e => setField('repayment_mode', e.target.value)} className="field-input">
                    <option>Cash</option><option>UPI</option><option>NACH</option><option>Cheque</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <input type="checkbox" id="prod-active" checked={form.active} onChange={e => setField('active', e.target.checked)} className="w-4 h-4" />
                <label htmlFor="prod-active" className="text-sm text-slate-700 font-medium">Active (visible for new loan creation)</label>
              </div>
              {errorMessage && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-xs">{errorMessage}</div>}
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl">
                <Save className="w-3.5 h-3.5" /> {saving ? 'Saving…' : 'Save Product'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
