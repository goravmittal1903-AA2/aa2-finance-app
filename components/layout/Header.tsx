'use client'

import { useState, useRef, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight, Home, User, ShieldCheck, Building2, LogOut, ChevronDown, CheckCircle2 } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { cn } from '@/lib/utils'

const LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  members: 'Members',
  loans: 'Loans',
  collections: 'Collections',
  reports: 'Reports',
  grievances: 'Grievances',
  documents: 'Documents',
  investors: 'Investors',
  audit: 'Audit Log',
  settings: 'Settings',
  new: 'New',
  edit: 'Edit',
}

const ROLE_STYLE: Record<string, string> = {
  it: 'bg-red-500/10 text-red-600 border-red-200',
  admin: 'bg-amber-500/10 text-amber-600 border-amber-200',
  employee: 'bg-blue-500/10 text-blue-600 border-blue-200',
}

export function Header() {
  const pathname = usePathname()
  const segments = pathname.split('/').filter(Boolean)
  const { user, logout } = useAuth()
  const [profileOpen, setProfileOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setProfileOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const role = user?.role || 'employee'
  const displayName = user?.name || user?.email?.split('@')[0] || 'User'

  return (
    <header className="fixed top-0 left-60 right-0 h-[60px] bg-white border-b border-slate-200 flex items-center justify-between px-6 z-20 shadow-sm">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1.5 text-sm">
        <Link href="/dashboard" className="text-slate-400 hover:text-blue-600 transition-colors">
          <Home className="w-4 h-4" />
        </Link>
        {segments.map((seg, i) => {
          const href = '/' + segments.slice(0, i + 1).join('/')
          const isLast = i === segments.length - 1
          const label = LABELS[seg] || (seg.length > 12 ? seg.slice(0, 10) + '…' : seg)
          return (
            <span key={href} className="flex items-center gap-1.5">
              <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
              {isLast ? (
                <span className="font-semibold text-slate-800">{label}</span>
              ) : (
                <Link href={href} className={cn('text-slate-500 hover:text-blue-600 transition-colors capitalize')}>
                  {label}
                </Link>
              )}
            </span>
          )
        })}
      </nav>

      {/* Right side — Date & Profile Dropdown */}
      <div className="flex items-center gap-3">
        <span className="hidden sm:inline-block text-xs text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full font-medium">
          {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
        </span>

        {/* Logged-in Profile Badge */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setProfileOpen(!profileOpen)}
            className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-all text-left group"
            title={`Logged in as ${user?.email}`}
          >
            <div className="w-7 h-7 rounded-lg bg-blue-600 text-white font-bold text-xs flex items-center justify-center shadow-sm">
              {displayName.slice(0, 1).toUpperCase()}
            </div>
            <div className="hidden md:flex flex-col min-w-0">
              <span className="text-xs font-bold text-slate-800 leading-tight truncate max-w-[160px]">
                {user?.email || 'Logged In'}
              </span>
              <span className="text-[10px] text-slate-400 font-medium leading-tight capitalize">
                {role}
              </span>
            </div>
            <ChevronDown className={cn("w-3.5 h-3.5 text-slate-400 transition-transform duration-200", profileOpen && "rotate-180")} />
          </button>

          {/* Profile Dropdown Popup */}
          {profileOpen && (
            <div className="absolute right-0 mt-2 w-72 bg-white border border-slate-200 rounded-2xl shadow-xl py-3 px-4 z-50 space-y-3 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-start gap-3 pb-3 border-b border-slate-100">
                <div className="w-10 h-10 rounded-xl bg-blue-600 text-white font-bold text-base flex items-center justify-center shadow-md">
                  {displayName.slice(0, 1).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-bold text-slate-800 truncate">{user?.name || 'Logged-in User'}</h4>
                  <p className="text-xs text-blue-600 font-mono font-medium truncate mt-0.5">{user?.email}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full border capitalize', ROLE_STYLE[role] || 'bg-slate-100 text-slate-600 border-slate-200')}>
                      {role}
                    </span>
                    <span className="text-[10px] text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full font-medium flex items-center gap-1">
                      <CheckCircle2 className="w-2.5 h-2.5" /> Active Session
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between items-center py-1 text-slate-600">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-slate-400" /> Branch
                  </span>
                  <span className="font-semibold text-slate-700">{user?.branch || 'Head Office'}</span>
                </div>
                <div className="flex justify-between items-center py-1 text-slate-600">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-slate-400" /> Account Type
                  </span>
                  <span className="font-semibold text-slate-700 capitalize">{role} Account</span>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100">
                <button
                  onClick={() => {
                    setProfileOpen(false)
                    logout()
                  }}
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold rounded-xl border border-red-100 transition"
                >
                  <LogOut className="w-3.5 h-3.5" /> Sign Out from {user?.email?.split('@')[0]}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

