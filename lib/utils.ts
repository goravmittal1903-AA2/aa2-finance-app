import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Format Indian Rupees
export function inr(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || isNaN(Number(amount))) return '₹0'
  return '₹' + Number(amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })
}

// Format date as DD MMM YYYY
export function fdate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

// Format datetime
export function fdatetime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Today as YYYY-MM-DD
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

// DPD bucket label
export function dpdBucket(dpd: number): string {
  if (dpd <= 0) return 'Current'
  if (dpd <= 30) return '1–30 DPD'
  if (dpd <= 60) return '31–60 DPD'
  if (dpd <= 90) return '61–90 DPD'
  if (dpd <= 180) return '90+ (NPA)'
  return '180+ (Write-off risk)'
}

// Generate unique ID
export function uid(prefix = ''): string {
  return prefix + Math.floor(Math.random() * 9_000_000_000 + 1_000_000_000).toString()
}

// Short username from email
export function username(email: string | null | undefined): string {
  if (!email) return '—'
  return email.split('@')[0]
}

// Loan status badge color
export function statusColor(status: string): string {
  const s = (status || '').toUpperCase()
  if (s === 'ACTIVE') return 'bg-emerald-100 text-emerald-700'
  if (s.startsWith('CLOS')) return 'bg-slate-100 text-slate-600'
  if (s === 'SANCTIONED') return 'bg-blue-100 text-blue-700'
  return 'bg-yellow-100 text-yellow-700'
}
