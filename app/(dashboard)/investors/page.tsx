'use client'

import { useEffect, useState } from 'react'
import { getAll, putOne, invalidateCache } from '@/lib/supabase'
import { inr, fdate, todayISO } from '@/lib/utils'
import { toast } from '@/lib/toast'
import type { Loan } from '@/lib/types'
import {
  Landmark, Users, PlusCircle, Receipt, Trash2, ShieldCheck, CreditCard,
  Building2, Wallet, FileSpreadsheet, TrendingUp, TrendingDown, RefreshCw,
  Edit2, Printer, Download, X, AlertCircle, CheckCircle2
} from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { confirmAction } from '@/lib/confirm'

interface Investor {
  id: string
  name: string
  pan_card?: string
  type: string
  instrument: string
  amount: number
  date: string
  return_pct: number
  status: 'Active' | 'Closed'
}

interface Borrowing {
  id: string
  lender_name: string
  sanction_amount: number
  outstanding_principal: number
  interest_rate: number
  start_date: string
  maturity_date: string
  status: 'Active' | 'Closed'
}

interface CashAccount {
  id: string
  name: string
  account_type: 'Cash' | 'Bank'
  bank_name?: string
  account_number?: string
  balance: number
}

interface Expense {
  id: string
  category: string
  amount: number
  payee: string
  date: string
  payment_mode: string
  remarks?: string
}

interface FixedAsset {
  id: string
  asset_name: string
  category: string
  purchase_date: string
  purchase_cost: number
  depreciation_rate: number
  current_value: number
}

type Tab = 'investors' | 'borrowings' | 'cashbank' | 'expenses' | 'assets' | 'statements'

export default function FinancialsPage() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState<Tab>('investors')
  const [loading, setLoading] = useState(true)

  // Data States
  const [investors, setInvestors] = useState<Investor[]>([])
  const [borrowings, setBorrowings] = useState<Borrowing[]>([])
  const [cashAccounts, setCashAccounts] = useState<CashAccount[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [fixedAssets, setFixedAssets] = useState<FixedAsset[]>([])
  const [allLoans, setAllLoans] = useState<Loan[]>([])

  // Form States
  const [invForm, setInvForm] = useState({ name: '', pan_card: '', type: 'Equity Shareholder', instrument: 'Equity Shares', amount: '', date: todayISO(), return_pct: '12' })
  const [borForm, setBorForm] = useState({ lender_name: '', sanction_amount: '', interest_rate: '10.5', start_date: todayISO(), maturity_date: todayISO() })
  const [cashForm, setCashForm] = useState({ name: '', account_type: 'Bank' as const, bank_name: '', account_number: '', initial_balance: '' })
  const [expForm, setExpForm] = useState({ category: 'Rent', amount: '', payee: '', date: todayISO(), payment_mode: 'Bank Transfer', remarks: '' })
  const [assetForm, setAssetForm] = useState({ asset_name: '', category: 'Office Equipment', purchase_date: todayISO(), purchase_cost: '', depreciation_rate: '15' })

  // Edit State
  const [editingInvId, setEditingInvId] = useState<string | null>(null)
  const [editingRecord, setEditingRecord] = useState<{ store: string; item: any } | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    loadAllFinancialData(true)
    const handleDataChange = () => loadAllFinancialData(true)
    window.addEventListener('aa2_data_changed', handleDataChange)
    return () => window.removeEventListener('aa2_data_changed', handleDataChange)
  }, [])

  async function loadAllFinancialData(force = false) {
    setLoading(true)
    try {
      if (force) {
        invalidateCache()
      }
      const [invs, bors, cashAccs, exps, assets, loans] = await Promise.all([
        getAll<Investor>('investors', force),
        getAll<Borrowing>('borrowings', force),
        getAll<CashAccount>('cash_accounts', force),
        getAll<Expense>('expenses', force),
        getAll<FixedAsset>('fixed_assets', force),
        getAll<Loan>('loans', force),
      ])

      setInvestors(invs)
      setBorrowings(bors)
      setCashAccounts(cashAccs)
      setExpenses(exps)
      setFixedAssets(assets)
      setAllLoans(loans)
    } catch (err) {
      console.error('Failed to load financial data:', err)
    } finally {
      setLoading(false)
    }
  }

  // Soft Delete to Trash Can
  const handleDeleteRecord = async (store: string, id: string, record: any, label: string) => {
    const ok = await confirmAction({
      title: 'Confirm Soft Delete',
      message: `Are you sure you want to delete ${label}? It will be safely moved to the Trash Can with a complete audit trail.`,
      confirmText: 'Move to Trash',
      variant: 'danger',
    })
    if (!ok) return
    try {
      const { moveToTrash } = await import('@/lib/trash')
      await moveToTrash(store, id, record, label, user?.email || 'system')
      toast.success('Record Deleted', `${label} has been deleted successfully.`)
      await loadAllFinancialData(true)
    } catch (err: any) {
      toast.error('Deletion Failed', err.message || 'Could not delete record.')
    }
  }

  const handleStartEditInvestor = (inv: Investor) => {
    setEditingInvId(inv.id)
    setInvForm({
      name: inv.name || '',
      pan_card: inv.pan_card || '',
      type: inv.type || 'Equity Shareholder',
      instrument: inv.instrument || 'Equity Shares',
      amount: String(inv.amount || ''),
      date: inv.date || todayISO(),
      return_pct: String(inv.return_pct ?? 12),
    })
  }

  const handleCancelEditInvestor = () => {
    setEditingInvId(null)
    setInvForm({ name: '', pan_card: '', type: 'Equity Shareholder', instrument: 'Equity Shares', amount: '', date: todayISO(), return_pct: '12' })
  }

  // Handlers
  const handleAddInvestor = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!invForm.name || !invForm.amount) return
    setSubmitting(true)
    try {
      const isEdit = Boolean(editingInvId)
      const targetId = editingInvId || ('INV-' + Date.now().toString().slice(-6))

      const invData: Investor = {
        id: targetId,
        name: invForm.name,
        pan_card: invForm.pan_card.toUpperCase().trim(),
        type: invForm.type,
        instrument: invForm.instrument,
        amount: Number(invForm.amount),
        date: invForm.date,
        return_pct: Number(invForm.return_pct) || 0,
        status: 'Active'
      }
      await putOne('investors', invData, 'id')
      toast.success(isEdit ? 'Investor Updated' : 'Investor Added', `Investor "${invData.name}" ${isEdit ? 'updated' : 'registered'} successfully.`)
      handleCancelEditInvestor()
      await loadAllFinancialData(true)
    } catch (err: any) {
      toast.error('Save Failed', err.message || 'Could not save investor.')
    } finally { setSubmitting(false) }
  }

  const handleAddBorrowing = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!borForm.lender_name || !borForm.sanction_amount) return
    setSubmitting(true)
    try {
      const newBor: Borrowing = {
        id: 'BOR-' + Date.now().toString().slice(-6),
        lender_name: borForm.lender_name,
        sanction_amount: Number(borForm.sanction_amount),
        outstanding_principal: Number(borForm.sanction_amount),
        interest_rate: Number(borForm.interest_rate) || 0,
        start_date: borForm.start_date,
        maturity_date: borForm.maturity_date,
        status: 'Active'
      }
      await putOne('borrowings', newBor, 'id')
      toast.success('Borrowing Recorded', `Lender "${newBor.lender_name}" added successfully.`)
      setBorForm({ lender_name: '', sanction_amount: '', interest_rate: '10.5', start_date: todayISO(), maturity_date: todayISO() })
      await loadAllFinancialData(true)
    } catch (err: any) {
      toast.error('Add Failed', err.message || 'Could not add borrowing.')
    } finally { setSubmitting(false) }
  }

  const handleAddCashAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!cashForm.name || !cashForm.initial_balance) return
    setSubmitting(true)
    try {
      const newAcc: CashAccount = {
        id: 'ACC-' + Date.now().toString().slice(-6),
        name: cashForm.name,
        account_type: cashForm.account_type,
        bank_name: cashForm.bank_name,
        account_number: cashForm.account_number,
        balance: Number(cashForm.initial_balance) || 0,
      }
      await putOne('cash_accounts', newAcc, 'id')
      toast.success('Account Created', `Account "${newAcc.name}" created successfully.`)
      setCashForm({ name: '', account_type: 'Bank', bank_name: '', account_number: '', initial_balance: '' })
      await loadAllFinancialData(true)
    } catch (err: any) {
      toast.error('Add Failed', err.message || 'Could not add account.')
    } finally { setSubmitting(false) }
  }

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!expForm.amount) return
    setSubmitting(true)
    try {
      const newExp: Expense = {
        id: 'EXP-' + Date.now().toString().slice(-6),
        category: expForm.category,
        amount: Number(expForm.amount),
        payee: expForm.payee,
        date: expForm.date,
        payment_mode: expForm.payment_mode,
        remarks: expForm.remarks
      }
      await putOne('expenses', newExp, 'id')
      toast.success('Expense Recorded', `Expense of ${inr(newExp.amount)} recorded.`)
      setExpForm({ category: 'Rent', amount: '', payee: '', date: todayISO(), payment_mode: 'Bank Transfer', remarks: '' })
      await loadAllFinancialData(true)
    } catch (err: any) {
      toast.error('Add Failed', err.message || 'Could not record expense.')
    } finally { setSubmitting(false) }
  }

  const handleAddFixedAsset = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!assetForm.asset_name || !assetForm.purchase_cost) return
    setSubmitting(true)
    try {
      const cost = Number(assetForm.purchase_cost)
      const newAsset: FixedAsset = {
        id: 'AST-' + Date.now().toString().slice(-6),
        asset_name: assetForm.asset_name,
        category: assetForm.category,
        purchase_date: assetForm.purchase_date,
        purchase_cost: cost,
        depreciation_rate: Number(assetForm.depreciation_rate) || 0,
        current_value: cost,
      }
      await putOne('fixed_assets', newAsset, 'id')
      toast.success('Fixed Asset Registered', `Asset "${newAsset.asset_name}" added.`)
      setAssetForm({ asset_name: '', category: 'Office Equipment', purchase_date: todayISO(), purchase_cost: '', depreciation_rate: '15' })
      await loadAllFinancialData(true)
    } catch (err: any) {
      toast.error('Add Failed', err.message || 'Could not register asset.')
    } finally { setSubmitting(false) }
  }

  const handleUpdateRecord = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingRecord) return
    setSubmitting(true)
    try {
      await putOne(editingRecord.store, editingRecord.item, 'id')
      toast.success('Record Updated', 'Changes saved successfully.')
      setEditingRecord(null)
      await loadAllFinancialData(true)
    } catch (err: any) {
      toast.error('Update Failed', err.message || 'Could not update record.')
    } finally { setSubmitting(false) }
  }

  // ─── FINANCIAL CALCULATIONS ENGINE ───
  // 1. Total Interest Collected across all loans
  const totalInterestIncome = allLoans.reduce((sum, l) => {
    const totalLoan = Number(l.total_loan || 0)
    const totalInterest = Number(l.total_interest || 0)
    const collected = Number(l.total_collected || 0)
    if (totalLoan <= 0 || totalInterest <= 0) return sum
    const ratio = Math.min(1, collected / totalLoan)
    return sum + (totalInterest * ratio)
  }, 0)

  // 2. Processing Fee / File Charge Income
  const totalFileChargeIncome = allLoans.reduce((sum, l) => sum + Number(l.file_charge || 0), 0)

  // 3. Gross Revenue
  const grossFinancialRevenue = totalInterestIncome + totalFileChargeIncome

  // 4. Operating Expenses
  const operatingExpenses = expenses.reduce((s, e) => s + Number(e.amount || 0), 0)

  // 5. Financial Borrowing Cost (Debt Interest Expense)
  const borrowingInterestExpense = borrowings.reduce((s, b) => {
    const principal = Number(b.outstanding_principal || 0)
    const rate = Number(b.interest_rate || 0)
    return s + (principal * (rate / 100))
  }, 0)

  // 6. NPA Provisioning (90+ DPD Loans)
  const npaProvisioning = allLoans
    .filter(l => l.npa_flag || Number(l.dpd || 0) >= 90)
    .reduce((s, l) => s + Number(l.ledger_balance || 0), 0)

  // 7. Total Expenses & Net Profit
  const totalExpensesAll = operatingExpenses + borrowingInterestExpense + npaProvisioning
  const netProfit = grossFinancialRevenue - totalExpensesAll

  // 8. Balance Sheet Assets & Liabilities
  const activeLoanPortfolioAsset = allLoans
    .filter(l => l.status === 'ACTIVE')
    .reduce((s, l) => s + Number(l.ledger_balance || 0), 0)

  const cashAndBankAssets = cashAccounts.reduce((s, c) => s + Number(c.balance || 0), 0)
  const fixedAssetsNet = fixedAssets.reduce((s, a) => s + Number(a.current_value || a.purchase_cost || 0), 0)
  const totalAssets = activeLoanPortfolioAsset + cashAndBankAssets + fixedAssetsNet

  const investorEquityCapital = investors.reduce((s, i) => s + Number(i.amount || 0), 0)
  const institutionalBorrowings = borrowings.reduce((s, b) => s + Number(b.outstanding_principal || 0), 0)
  const totalCapitalLiabilities = investorEquityCapital + institutionalBorrowings + netProfit

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Bar */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Financial Management & Statements</h1>
          <p className="text-slate-500 text-sm mt-0.5">Capital, Institutional Debt, Operating Expenses, Fixed Assets, P&L, and Balance Sheet.</p>
        </div>
        <button onClick={() => loadAllFinancialData(true)} className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition shadow-sm">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh Live Data
        </button>
      </div>

      {/* Top Metrics Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Investor Capital</span>
          <span className="text-xl font-bold text-blue-600 block mt-1">{inr(investorEquityCapital)}</span>
          <span className="text-[10px] text-slate-400 font-medium">{investors.length} Investors</span>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Debt & Borrowings</span>
          <span className="text-xl font-bold text-purple-600 block mt-1">{inr(institutionalBorrowings)}</span>
          <span className="text-[10px] text-slate-400 font-medium">{borrowings.length} Lenders</span>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Operating Expenses</span>
          <span className="text-xl font-bold text-red-600 block mt-1">{inr(operatingExpenses)}</span>
          <span className="text-[10px] text-slate-400 font-medium">{expenses.length} Records</span>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Fixed Assets Value</span>
          <span className="text-xl font-bold text-amber-600 block mt-1">{inr(fixedAssetsNet)}</span>
          <span className="text-[10px] text-slate-400 font-medium">{fixedAssets.length} Assets</span>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 col-span-2 lg:col-span-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Cash & Bank Accounts</span>
          <span className="text-xl font-bold text-emerald-600 block mt-1">{inr(cashAndBankAssets)}</span>
          <span className="text-[10px] text-slate-400 font-medium">{cashAccounts.length} Accounts</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 overflow-x-auto gap-1">
        {([
          { id: 'investors', label: `Investor Capital (${investors.length})`, icon: Users },
          { id: 'borrowings', label: `Debt & Borrowings (${borrowings.length})`, icon: Landmark },
          { id: 'cashbank', label: `Cash & Bank (${cashAccounts.length})`, icon: Wallet },
          { id: 'expenses', label: `Operating Expenses (${expenses.length})`, icon: Receipt },
          { id: 'assets', label: `Fixed Assets (${fixedAssets.length})`, icon: Building2 },
          { id: 'statements', label: 'P&L & Balance Sheet', icon: FileSpreadsheet },
        ] as { id: Tab; label: string; icon: any }[]).map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`px-4 py-3 text-xs font-bold border-b-2 flex items-center gap-2 transition whitespace-nowrap ${activeTab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            <t.icon className="w-3.5 h-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB 1: INVESTORS ── */}
      {activeTab === 'investors' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Add / Edit Form */}
          <div className="lg:col-span-1 bg-white p-5 rounded-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                {editingInvId ? <Edit2 className="w-4 h-4 text-blue-600" /> : <PlusCircle className="w-4 h-4 text-blue-600" />}
                {editingInvId ? 'Edit Investor Details' : 'Register Investor / Capital'}
              </h3>
              {editingInvId && (
                <button type="button" onClick={handleCancelEditInvestor} className="text-[10px] text-slate-500 hover:text-slate-800 font-semibold underline">
                  Cancel Edit
                </button>
              )}
            </div>

            {editingInvId && (
              <div className="bg-blue-50 text-blue-700 text-[11px] p-2.5 rounded-xl font-medium flex justify-between items-center border border-blue-100">
                <span>Editing Record: <strong className="font-mono">{editingInvId}</strong></span>
                <button type="button" onClick={handleCancelEditInvestor} className="text-[10px] font-bold text-blue-800 hover:underline">Clear</button>
              </div>
            )}

            <form onSubmit={handleAddInvestor} className="space-y-3">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Investor / Entity Name *</label>
                <input type="text" required value={invForm.name} onChange={e => setInvForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Ramesh Kumar / Alpha Capital" className="w-full px-3 py-2 bg-slate-50 border rounded-lg text-xs" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">PAN Card Number (Optional)</label>
                <input type="text" value={invForm.pan_card} onChange={e => setInvForm(p => ({ ...p, pan_card: e.target.value }))} maxLength={10} placeholder="ABCDE1234F" className="w-full px-3 py-2 bg-slate-50 border rounded-lg text-xs font-mono uppercase" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Investor Type</label>
                <select value={invForm.type} onChange={e => setInvForm(p => ({ ...p, type: e.target.value }))} className="w-full px-3 py-2 bg-slate-50 border rounded-lg text-xs">
                  <option>Equity Shareholder</option>
                  <option>Preference Shareholder</option>
                  <option>Promoter / Founder</option>
                  <option>Angel Investor / HNIs</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Capital Amount (₹) *</label>
                <input type="number" required value={invForm.amount} onChange={e => setInvForm(p => ({ ...p, amount: e.target.value }))} placeholder="1000000" className="w-full px-3 py-2 bg-slate-50 border rounded-lg text-xs font-bold" />
              </div>
              <div className="flex gap-2 pt-1">
                {editingInvId && (
                  <button type="button" onClick={handleCancelEditInvestor} className="py-2.5 px-3 bg-slate-100 text-slate-700 font-bold text-xs rounded-xl hover:bg-slate-200 transition">
                    Cancel
                  </button>
                )}
                <button disabled={submitting} className="flex-1 py-2.5 bg-blue-600 text-white font-bold text-xs rounded-xl hover:bg-blue-500 transition shadow-sm">
                  {submitting ? 'Saving...' : editingInvId ? 'Update Investor' : 'Add Investor'}
                </button>
              </div>
            </form>
          </div>

          {/* Table */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 overflow-hidden p-5 space-y-3">
            <h3 className="text-sm font-bold text-slate-800">Investor Register</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="bg-slate-50 text-slate-500 text-[10px] uppercase">
                  <th className="p-2 text-left">ID / Name</th>
                  <th className="p-2 text-left">PAN Card</th>
                  <th className="p-2 text-left">Type</th>
                  <th className="p-2 text-right">Capital (₹)</th>
                  <th className="p-2 text-center">Action</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {investors.map(inv => (
                    <tr key={inv.id} className={`hover:bg-slate-50/50 ${editingInvId === inv.id ? 'bg-blue-50/40' : ''}`}>
                      <td className="p-2">
                        <button onClick={() => handleStartEditInvestor(inv)} className="font-bold text-blue-600 hover:underline block text-left" title="Click to Edit">
                          {inv.name}
                        </button>
                        <span className="text-[9px] font-mono text-slate-400">{inv.id}</span>
                      </td>
                      <td className="p-2 font-mono text-slate-600 text-[11px]">{inv.pan_card || '—'}</td>
                      <td className="p-2 text-slate-600">{inv.type}</td>
                      <td className="p-2 text-right font-bold text-slate-800">{inr(inv.amount)}</td>
                      <td className="p-2 text-center">
                        <div className="flex justify-center gap-1">
                          <button onClick={() => handleStartEditInvestor(inv)} className="p-1 text-blue-600 hover:bg-blue-50 rounded" title="Edit Investor Record"><Edit2 className="w-3.5 h-3.5" /></button>
                          <button onClick={() => handleDeleteRecord('investors', inv.id, inv, `Investor "${inv.name}"`)} className="p-1 text-red-600 hover:bg-red-50 rounded" title="Delete Investor"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {investors.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-slate-400">No investors registered yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: DEBT & BORROWINGS ── */}
      {activeTab === 'borrowings' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 bg-white p-5 rounded-2xl border border-slate-100 space-y-4">
            <h3 className="text-sm font-bold text-slate-800 border-b pb-2">Record Debt / Institutional Borrowing</h3>
            <form onSubmit={handleAddBorrowing} className="space-y-3">
              <div><label className="text-[10px] font-bold text-slate-400 uppercase">Lender / Financial Institution Name *</label><input type="text" required value={borForm.lender_name} onChange={e => setBorForm(p => ({ ...p, lender_name: e.target.value }))} placeholder="e.g. NABARD / SIDBI / Bank" className="w-full px-3 py-2 bg-slate-50 border rounded-lg text-xs" /></div>
              <div><label className="text-[10px] font-bold text-slate-400 uppercase">Sanction Amount (₹) *</label><input type="number" required value={borForm.sanction_amount} onChange={e => setBorForm(p => ({ ...p, sanction_amount: e.target.value }))} className="w-full px-3 py-2 bg-slate-50 border rounded-lg text-xs font-bold" /></div>
              <div><label className="text-[10px] font-bold text-slate-400 uppercase">Interest Rate (% p.a.)</label><input type="number" step="0.1" value={borForm.interest_rate} onChange={e => setBorForm(p => ({ ...p, interest_rate: e.target.value }))} className="w-full px-3 py-2 bg-slate-50 border rounded-lg text-xs" /></div>
              <button disabled={submitting} className="w-full py-2.5 bg-blue-600 text-white font-bold text-xs rounded-xl hover:bg-blue-500 transition">{submitting ? 'Saving...' : 'Add Borrowing'}</button>
            </form>
          </div>
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 overflow-hidden p-5 space-y-3">
            <h3 className="text-sm font-bold text-slate-800">Debt & Borrowings Register</h3>
            <table className="w-full text-xs">
              <thead><tr className="bg-slate-50 text-slate-500 text-[10px] uppercase"><th className="p-2 text-left">Lender</th><th className="p-2 text-right">Sanctioned (₹)</th><th className="p-2 text-right">Outstanding (₹)</th><th className="p-2 text-center">Action</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {borrowings.map(b => (
                  <tr key={b.id} className="hover:bg-slate-50/50">
                    <td className="p-2 font-bold text-slate-800">{b.lender_name}<span className="block text-[9px] font-mono text-slate-400">{b.id}</span></td>
                    <td className="p-2 text-right font-medium">{inr(b.sanction_amount)}</td>
                    <td className="p-2 text-right font-bold text-purple-600">{inr(b.outstanding_principal)}</td>
                    <td className="p-2 text-center">
                      <button onClick={() => handleDeleteRecord('borrowings', b.id, b, `Borrowing "${b.lender_name}"`)} className="p-1 text-red-600 hover:bg-red-50 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                    </td>
                  </tr>
                ))}
                {borrowings.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-slate-400">No borrowings recorded.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB: CASH & BANK ACCOUNTS ── */}
      {activeTab === 'cashbank' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 bg-white p-5 rounded-2xl border border-slate-100 space-y-4">
            <h3 className="text-sm font-bold text-slate-800 border-b pb-2">Add Cash / Bank Account</h3>
            <form onSubmit={handleAddCashAccount} className="space-y-3">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Account Name *</label>
                <input type="text" required value={cashForm.name} onChange={e => setCashForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. HDFC Main Operating A/C" className="w-full px-3 py-2 bg-slate-50 border rounded-lg text-xs" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Account Type</label>
                <select value={cashForm.account_type} onChange={e => setCashForm(p => ({ ...p, account_type: e.target.value as any }))} className="w-full px-3 py-2 bg-slate-50 border rounded-lg text-xs">
                  <option value="Bank">Bank Account</option>
                  <option value="Cash">Branch Cash Vault</option>
                </select>
              </div>
              {cashForm.account_type === 'Bank' && (
                <>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Bank Name</label>
                    <input type="text" value={cashForm.bank_name} onChange={e => setCashForm(p => ({ ...p, bank_name: e.target.value }))} placeholder="HDFC Bank" className="w-full px-3 py-2 bg-slate-50 border rounded-lg text-xs" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Account Number</label>
                    <input type="text" value={cashForm.account_number} onChange={e => setCashForm(p => ({ ...p, account_number: e.target.value }))} placeholder="501002345678" className="w-full px-3 py-2 bg-slate-50 border rounded-lg text-xs font-mono" />
                  </div>
                </>
              )}
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Initial Balance (₹) *</label>
                <input type="number" required value={cashForm.initial_balance} onChange={e => setCashForm(p => ({ ...p, initial_balance: e.target.value }))} placeholder="500000" className="w-full px-3 py-2 bg-slate-50 border rounded-lg text-xs font-bold" />
              </div>
              <button disabled={submitting} className="w-full py-2.5 bg-blue-600 text-white font-bold text-xs rounded-xl hover:bg-blue-500 transition">{submitting ? 'Saving...' : 'Add Account'}</button>
            </form>
          </div>
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 overflow-hidden p-5 space-y-3">
            <h3 className="text-sm font-bold text-slate-800">Cash & Bank Accounts Register</h3>
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-[10px] uppercase">
                  <th className="p-2 text-left">Account Name</th>
                  <th className="p-2 text-left">Type / Bank</th>
                  <th className="p-2 text-right">Balance (₹)</th>
                  <th className="p-2 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cashAccounts.map(c => (
                  <tr key={c.id} className="hover:bg-slate-50/50">
                    <td className="p-2 font-bold text-slate-800">{c.name}<span className="block text-[9px] font-mono text-slate-400">{c.account_number || c.id}</span></td>
                    <td className="p-2 text-slate-600">{c.account_type} {c.bank_name ? `(${c.bank_name})` : ''}</td>
                    <td className="p-2 text-right font-bold text-emerald-600">{inr(c.balance)}</td>
                    <td className="p-2 text-center">
                      <button onClick={() => handleDeleteRecord('cash_accounts', c.id, c, `Account "${c.name}"`)} className="p-1 text-red-600 hover:bg-red-50 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                    </td>
                  </tr>
                ))}
                {cashAccounts.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-slate-400">No cash or bank accounts registered.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB 3: OPERATING EXPENSES ── */}
      {activeTab === 'expenses' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 bg-white p-5 rounded-2xl border border-slate-100 space-y-4">
            <h3 className="text-sm font-bold text-slate-800 border-b pb-2">Record Operating Expense</h3>
            <form onSubmit={handleAddExpense} className="space-y-3">
              <div><label className="text-[10px] font-bold text-slate-400 uppercase">Category</label>
                <select value={expForm.category} onChange={e => setExpForm(p => ({ ...p, category: e.target.value }))} className="w-full px-3 py-2 bg-slate-50 border rounded-lg text-xs">
                  <option>Rent</option><option>Salaries & Wages</option><option>Utilities</option><option>Travel & Conveyance</option><option>Printing & Stationery</option><option>Professional & Audit Fees</option><option>Other</option>
                </select>
              </div>
              <div><label className="text-[10px] font-bold text-slate-400 uppercase">Amount (₹) *</label><input type="number" required value={expForm.amount} onChange={e => setExpForm(p => ({ ...p, amount: e.target.value }))} className="w-full px-3 py-2 bg-slate-50 border rounded-lg text-xs font-bold" /></div>
              <div><label className="text-[10px] font-bold text-slate-400 uppercase">Payee / Vendor</label><input type="text" value={expForm.payee} onChange={e => setExpForm(p => ({ ...p, payee: e.target.value }))} className="w-full px-3 py-2 bg-slate-50 border rounded-lg text-xs" /></div>
              <button disabled={submitting} className="w-full py-2.5 bg-blue-600 text-white font-bold text-xs rounded-xl hover:bg-blue-500 transition">{submitting ? 'Saving...' : 'Record Expense'}</button>
            </form>
          </div>
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 overflow-hidden p-5 space-y-3">
            <h3 className="text-sm font-bold text-slate-800">Operating Expenses Ledger</h3>
            <table className="w-full text-xs">
              <thead><tr className="bg-slate-50 text-slate-500 text-[10px] uppercase"><th className="p-2 text-left">Date</th><th className="p-2 text-left">Category</th><th className="p-2 text-left">Payee</th><th className="p-2 text-right">Amount</th><th className="p-2 text-center">Action</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {expenses.map(e => (
                  <tr key={e.id} className="hover:bg-slate-50/50">
                    <td className="p-2">{e.date}</td>
                    <td className="p-2 font-bold">{e.category}</td>
                    <td className="p-2">{e.payee || '—'}</td>
                    <td className="p-2 text-right font-bold text-red-600">{inr(e.amount)}</td>
                    <td className="p-2 text-center">
                      <button onClick={() => handleDeleteRecord('expenses', e.id, e, `Expense "${e.category}"`)} className="p-1 text-red-600 hover:bg-red-50 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                    </td>
                  </tr>
                ))}
                {expenses.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-slate-400">No operating expenses recorded.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB 4: FIXED ASSETS ── */}
      {activeTab === 'assets' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 bg-white p-5 rounded-2xl border border-slate-100 space-y-4">
            <h3 className="text-sm font-bold text-slate-800 border-b pb-2">Add Fixed Asset</h3>
            <form onSubmit={handleAddFixedAsset} className="space-y-3">
              <div><label className="text-[10px] font-bold text-slate-400 uppercase">Asset Name *</label><input type="text" required value={assetForm.asset_name} onChange={e => setAssetForm(p => ({ ...p, asset_name: e.target.value }))} placeholder="e.g. Office Computers" className="w-full px-3 py-2 bg-slate-50 border rounded-lg text-xs" /></div>
              <div><label className="text-[10px] font-bold text-slate-400 uppercase">Purchase Cost (₹) *</label><input type="number" required value={assetForm.purchase_cost} onChange={e => setAssetForm(p => ({ ...p, purchase_cost: e.target.value }))} className="w-full px-3 py-2 bg-slate-50 border rounded-lg text-xs font-bold" /></div>
              <button disabled={submitting} className="w-full py-2.5 bg-blue-600 text-white font-bold text-xs rounded-xl hover:bg-blue-500 transition">{submitting ? 'Saving...' : 'Add Asset'}</button>
            </form>
          </div>
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 overflow-hidden p-5 space-y-3">
            <h3 className="text-sm font-bold text-slate-800">Fixed Assets Register</h3>
            <table className="w-full text-xs">
              <thead><tr className="bg-slate-50 text-slate-500 text-[10px] uppercase"><th className="p-2 text-left">Asset</th><th className="p-2 text-left">Category</th><th className="p-2 text-right">Cost</th><th className="p-2 text-center">Action</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {fixedAssets.map(a => (
                  <tr key={a.id} className="hover:bg-slate-50/50">
                    <td className="p-2 font-bold">{a.asset_name}</td>
                    <td className="p-2">{a.category}</td>
                    <td className="p-2 text-right font-bold text-slate-800">{inr(a.purchase_cost)}</td>
                    <td className="p-2 text-center">
                      <button onClick={() => handleDeleteRecord('fixed_assets', a.id, a, `Asset "${a.asset_name}"`)} className="p-1 text-red-600 hover:bg-red-50 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                    </td>
                  </tr>
                ))}
                {fixedAssets.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-slate-400">No fixed assets registered.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB 5: REALTIME P&L AND BALANCE SHEET ── */}
      {activeTab === 'statements' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Profit & Loss Statement */}
            <div className="bg-white p-6 rounded-2xl border border-slate-100 space-y-4 shadow-sm">
              <div className="flex items-center justify-between border-b pb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Profit & Loss Statement (P&L)</h3>
                  <p className="text-[11px] text-slate-400">Calculated from Live Loan Portfolio & Expense Ledger</p>
                </div>
                <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Live Realtime
                </span>
              </div>
              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between py-1.5 border-b">
                  <span className="text-slate-600 font-medium">Earned Interest Income</span>
                  <span className="font-bold text-emerald-600">{inr(totalInterestIncome)}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b">
                  <span className="text-slate-600 font-medium">Loan Processing & File Charges</span>
                  <span className="font-bold text-emerald-600">{inr(totalFileChargeIncome)}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b bg-slate-50/70 px-2 rounded font-bold text-slate-800">
                  <span>Gross Operating Revenue</span>
                  <span>{inr(grossFinancialRevenue)}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b">
                  <span className="text-slate-600 font-medium">Less: Operating Expenses</span>
                  <span className="font-bold text-red-600">-{inr(operatingExpenses)}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b">
                  <span className="text-slate-600 font-medium">Less: Debt Interest Expense</span>
                  <span className="font-bold text-red-600">-{inr(borrowingInterestExpense)}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b">
                  <span className="text-slate-600 font-medium">Less: NPA Bad Debt Provisioning</span>
                  <span className="font-bold text-red-600">-{inr(npaProvisioning)}</span>
                </div>
                <div className="flex justify-between py-2 text-sm font-bold border-t-2 border-slate-300 pt-3">
                  <span>Net Profit / (Surplus)</span>
                  <span className={netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}>{inr(netProfit)}</span>
                </div>
              </div>
            </div>

            {/* Balance Sheet Summary */}
            <div className="bg-white p-6 rounded-2xl border border-slate-100 space-y-4 shadow-sm">
              <div className="flex items-center justify-between border-b pb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Balance Sheet Summary</h3>
                  <p className="text-[11px] text-slate-400">Statement of Financial Position</p>
                </div>
                <span className="text-[10px] font-bold bg-purple-50 text-purple-700 px-2 py-0.5 rounded flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Live Balanced
                </span>
              </div>
              <div className="space-y-2 text-xs">
                <div className="font-bold text-slate-800 uppercase text-[10px] tracking-wider text-blue-600">Assets</div>
                <div className="flex justify-between py-1 border-b">
                  <span className="text-slate-600">Gross Loan Portfolio (Active Advances)</span>
                  <span className="font-bold">{inr(activeLoanPortfolioAsset)}</span>
                </div>
                <div className="flex justify-between py-1 border-b">
                  <span className="text-slate-600">Cash & Bank Balances</span>
                  <span className="font-bold">{inr(cashAndBankAssets)}</span>
                </div>
                <div className="flex justify-between py-1 border-b">
                  <span className="text-slate-600">Fixed Assets (Net Value)</span>
                  <span className="font-bold">{inr(fixedAssetsNet)}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b bg-blue-50/60 px-2 rounded font-bold text-blue-900">
                  <span>Total Assets</span>
                  <span>{inr(totalAssets)}</span>
                </div>

                <div className="font-bold text-slate-800 uppercase text-[10px] tracking-wider text-purple-600 pt-3">Capital & Liabilities</div>
                <div className="flex justify-between py-1 border-b">
                  <span className="text-slate-600">Investor Equity Capital</span>
                  <span className="font-bold">{inr(investorEquityCapital)}</span>
                </div>
                <div className="flex justify-between py-1 border-b">
                  <span className="text-slate-600">Institutional Debt & Borrowings</span>
                  <span className="font-bold">{inr(institutionalBorrowings)}</span>
                </div>
                <div className="flex justify-between py-1 border-b">
                  <span className="text-slate-600">Cumulative Operational Surplus (P&L)</span>
                  <span className={`font-bold ${netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{inr(netProfit)}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b bg-purple-50/60 px-2 rounded font-bold text-purple-900">
                  <span>Total Equity & Liabilities</span>
                  <span>{inr(totalCapitalLiabilities)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-sm text-slate-800">Edit Financial Record</h3>
              <button onClick={() => setEditingRecord(null)} className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleUpdateRecord} className="space-y-3">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Name / Label</label>
                <input type="text" value={editingRecord.item.name || editingRecord.item.lender_name || editingRecord.item.category || editingRecord.item.asset_name || ''} onChange={e => {
                  const val = e.target.value
                  setEditingRecord(prev => prev ? {
                    ...prev,
                    item: { ...prev.item, name: val, lender_name: val, category: val, asset_name: val }
                  } : null)
                }} className="w-full px-3 py-2 bg-slate-50 border rounded-lg text-xs" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Amount (₹)</label>
                <input type="number" value={editingRecord.item.amount || editingRecord.item.sanction_amount || editingRecord.item.purchase_cost || editingRecord.item.balance || ''} onChange={e => {
                  const val = Number(e.target.value) || 0
                  setEditingRecord(prev => prev ? {
                    ...prev,
                    item: { ...prev.item, amount: val, sanction_amount: val, outstanding_principal: val, purchase_cost: val, current_value: val, balance: val }
                  } : null)
                }} className="w-full px-3 py-2 bg-slate-50 border rounded-lg text-xs font-bold" />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setEditingRecord(null)} className="flex-1 py-2 bg-slate-100 text-slate-700 font-semibold text-xs rounded-xl">Cancel</button>
                <button type="submit" disabled={submitting} className="flex-1 py-2 bg-blue-600 text-white font-bold text-xs rounded-xl shadow-md">{submitting ? 'Saving...' : 'Save Changes'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
