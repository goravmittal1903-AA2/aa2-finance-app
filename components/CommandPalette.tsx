'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Search, User, FileText, X, ArrowRight, ShieldCheck, PieChart, Layers } from 'lucide-react'
import { getAll } from '@/lib/supabase'
import type { Customer, Loan } from '@/lib/types'

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loans, setLoans] = useState<Loan[]>([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  // Global Ctrl+K / Cmd+K keydown listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(prev => !prev)
      } else if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Auto focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
      if (customers.length === 0) {
        setLoading(true)
        Promise.all([
          getAll<Customer>('customers'),
          getAll<Loan>('loans'),
        ]).then(([cList, lList]) => {
          setCustomers(cList || [])
          setLoans(lList || [])
        }).finally(() => setLoading(false))
      }
    } else {
      setQuery('')
    }
  }, [open])

  if (!open) return null

  const q = query.toLowerCase().trim()

  const matchedMembers = q
    ? customers.filter(c =>
        (c.full_name || '').toLowerCase().includes(q) ||
        (c.customer_id || '').toLowerCase().includes(q) ||
        (c.mobile || '').includes(q) ||
        (c.pan_no || '').toLowerCase().includes(q)
      ).slice(0, 5)
    : []

  const matchedLoans = q
    ? loans.filter(l =>
        (l.loan_account_no || '').toLowerCase().includes(q) ||
        (l.member_name_cache || l.member_name || '').toLowerCase().includes(q) ||
        (l.customer_id || '').toLowerCase().includes(q)
      ).slice(0, 5)
    : []

  const quickNavLinks = [
    { label: 'Sanction New Loan', href: '/loans/new', icon: FileText, color: 'text-blue-500' },
    { label: 'Add New Member', href: '/members/new', icon: User, color: 'text-emerald-500' },
    { label: 'Collections Sheet', href: '/collections', icon: Layers, color: 'text-purple-500' },
    { label: 'MIS & Financial Reports', href: '/reports', icon: PieChart, color: 'text-amber-500' },
    { label: 'Grievance Redressal', href: '/grievances', icon: ShieldCheck, color: 'text-red-500' },
  ]

  const handleNavigate = (path: string) => {
    setOpen(false)
    router.push(path)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 bg-slate-950/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col transition-all">
        
        {/* Search Header Input */}
        <div className="relative flex items-center px-4 py-3.5 border-b border-slate-100 dark:border-slate-800">
          <Search className="w-5 h-5 text-slate-400 mr-3 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Quick Search: Type Member Name, Loan A/C, Mobile, PAN or Page..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full bg-transparent text-sm sm:text-base text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none"
          />
          <button onClick={() => setOpen(false)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results Body */}
        <div className="max-h-[60vh] overflow-y-auto p-3 space-y-4">
          {loading && (
            <div className="py-8 text-center text-xs text-slate-400">Searching records...</div>
          )}

          {!loading && !q && (
            <div>
              <p className="px-3 py-1.5 text-[10px] font-black text-slate-400 uppercase tracking-wider">Quick Navigation</p>
              <div className="space-y-1">
                {quickNavLinks.map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleNavigate(item.href)}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition text-left text-xs font-semibold text-slate-700 dark:text-slate-200"
                  >
                    <div className="flex items-center gap-2.5">
                      <item.icon className={`w-4 h-4 ${item.color}`} />
                      <span>{item.label}</span>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {!loading && q && (
            <>
              {/* Member Matches */}
              {matchedMembers.length > 0 && (
                <div>
                  <p className="px-3 py-1 text-[10px] font-black text-slate-400 uppercase tracking-wider">Members ({matchedMembers.length})</p>
                  <div className="space-y-1 mt-1">
                    {matchedMembers.map(m => (
                      <button
                        key={m.customer_id}
                        onClick={() => handleNavigate(`/members/${m.customer_id}`)}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-blue-50 dark:hover:bg-slate-800 transition text-left"
                      >
                        <div>
                          <div className="text-xs font-bold text-slate-800 dark:text-slate-100">{m.full_name}</div>
                          <div className="text-[10px] text-slate-400 font-mono">ID: {m.customer_id} · Mobile: {m.mobile || '—'}</div>
                        </div>
                        <span className="text-[10px] bg-blue-100 dark:bg-blue-900/40 text-blue-600 font-bold px-2 py-0.5 rounded-full">Member</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Loan Matches */}
              {matchedLoans.length > 0 && (
                <div>
                  <p className="px-3 py-1 text-[10px] font-black text-slate-400 uppercase tracking-wider">Loans ({matchedLoans.length})</p>
                  <div className="space-y-1 mt-1">
                    {matchedLoans.map(l => (
                      <button
                        key={l.loan_account_no}
                        onClick={() => handleNavigate(`/loans/${l.loan_account_no}`)}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-emerald-50 dark:hover:bg-slate-800 transition text-left"
                      >
                        <div>
                          <div className="text-xs font-bold text-slate-800 dark:text-slate-100">A/C: {l.loan_account_no}</div>
                          <div className="text-[10px] text-slate-400">{l.member_name_cache || l.member_name} · Status: {l.status}</div>
                        </div>
                        <span className="text-[10px] bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 font-bold px-2 py-0.5 rounded-full">Loan</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {matchedMembers.length === 0 && matchedLoans.length === 0 && (
                <div className="py-8 text-center text-xs text-slate-400">No matching members or loans found for "{query}"</div>
              )}
            </>
          )}
        </div>

        {/* Footer Hint */}
        <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-between text-[10px] text-slate-400">
          <span>Tip: Press <kbd className="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded font-mono font-bold">Ctrl + K</kbd> to open anytime</span>
          <span>Press <kbd className="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded font-mono font-bold">Esc</kbd> to close</span>
        </div>
      </div>
    </div>
  )
}
