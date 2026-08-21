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

// Live Age Calculator from DOB string (returns Years & Months)
export function calculateAgeInYearsMonths(dobString: string | null | undefined): { years: number; months: number; label: string } | null {
  if (!dobString) return null
  const dob = new Date(dobString)
  if (isNaN(dob.getTime())) return null

  const today = new Date()
  let years = today.getFullYear() - dob.getFullYear()
  let months = today.getMonth() - dob.getMonth()

  if (today.getDate() < dob.getDate()) {
    months--
  }

  if (months < 0) {
    years--
    months += 12
  }

  if (years < 0) return null

  const label = `${years} Year${years !== 1 ? 's' : ''}, ${months} Month${months !== 1 ? 's' : ''}`
  return { years, months, label }
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

// Indian PAN card format validator (5 letters, 4 digits, 1 letter)
export function validatePAN(pan: string | null | undefined): boolean {
  if (!pan) return true // Empty is allowed unless required
  const clean = pan.trim().toUpperCase()
  return /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(clean)
}

// Mask PAN number (ABCDE****F)
export function maskPAN(pan: string | null | undefined): string {
  if (!pan || pan.trim().length < 10) return pan || '—'
  const clean = pan.trim()
  return `${clean.slice(0, 5)}****${clean.slice(-1)}`
}

// Mask Aadhaar number (**** **** 1234 or ****1234)
export function maskAadhaar(aadhaar: string | null | undefined): string {
  if (!aadhaar) return '—'
  const clean = aadhaar.trim()
  if (clean.length === 4) return `**** ${clean}`
  if (clean.length === 12) return `**** **** ${clean.slice(-4)}`
  return clean
}

// Export JSON/Array data to Excel file using xlsx
export async function exportToExcel(data: any[], fileName: string, sheetName = 'Sheet1') {
  if (!data || !data.length) return
  const XLSX = await import('xlsx')
  const worksheet = XLSX.utils.json_to_sheet(data)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)
  XLSX.writeFile(workbook, `${fileName}_${todayISO()}.xlsx`)
}


