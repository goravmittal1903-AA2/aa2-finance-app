'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, Users, CreditCard, Receipt, BarChart3,
  MessageSquare, FolderOpen, Settings, LogOut, Landmark,
  ClipboardList, Building2, ChevronRight, ShieldCheck,
  Package, DatabaseBackup, Trash2
} from 'lucide-react'

// ─── Nav item definitions ────────────────────────────────────────────────────
// allowedRoles: which roles can see this item. Empty array = everyone.
const navItems = [
  { href: '/dashboard',    label: 'Dashboard',       icon: LayoutDashboard, allowedRoles: [] },
  { href: '/members',      label: 'Members',         icon: Users,           allowedRoles: [] },
  { href: '/loans',        label: 'Loans',           icon: CreditCard,      allowedRoles: [] },
  { href: '/collections',  label: 'Collections',     icon: Receipt,         allowedRoles: [] },
  { href: '/reports',      label: 'MIS & Reports',   icon: BarChart3,       allowedRoles: [] },
  // Admin + IT only
  { href: '/products',     label: 'Loan Products',   icon: Package,         allowedRoles: ['admin', 'it'] },
  { href: '/grievances',   label: 'Grievances',      icon: MessageSquare,   allowedRoles: ['admin', 'it'] },
  { href: '/documents',    label: 'Documents',       icon: FolderOpen,      allowedRoles: ['admin', 'it'] },
  { href: '/investors',    label: 'Financials',      icon: Landmark,        allowedRoles: ['admin', 'it'] },
  { href: '/audit',        label: 'Audit Log',       icon: ClipboardList,   allowedRoles: ['admin', 'it'] },
  // IT only
  { href: '/trash',        label: 'Trash / Recovery', icon: Trash2,          allowedRoles: ['it'] },
  { href: '/data-tools',   label: 'Data Management', icon: DatabaseBackup,  allowedRoles: ['it'] },
  { href: '/settings',     label: 'Settings',        icon: Settings,        allowedRoles: ['it'] },
]

// Role badge colors
const ROLE_STYLE: Record<string, string> = {
  it:       'bg-red-500/20 text-red-300',
  admin:    'bg-amber-500/20 text-amber-300',
  employee: 'bg-blue-500/20 text-blue-300',
}

const ROLE_LABEL: Record<string, string> = {
  it:       'IT',
  admin:    'Admin',
  employee: 'Employee',
}

export function Sidebar() {
  const pathname = usePathname()
  const { user, logout } = useAuth()
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const role = user?.role || ''

  const visibleItems = navItems.filter(item =>
    item.allowedRoles.length === 0 || item.allowedRoles.includes(role)
  )

  return (
    <aside className="fixed left-0 top-0 h-screen w-60 bg-slate-900 flex flex-col z-30 shadow-xl">
      {/* Brand Header — Links directly to /dashboard */}
      <Link
        href="/dashboard"
        className="flex flex-col gap-2 px-4 py-4 border-b border-slate-700/50 bg-slate-950/40 hover:bg-slate-800/80 transition-colors group"
      >
        <div className="flex items-center justify-between gap-1.5 bg-white p-1.5 rounded-xl shadow-md group-hover:ring-2 group-hover:ring-blue-400 transition">
          <img
            src="/brand/aa2-microfinance.png"
            alt="AA2 Micro Finance"
            className="h-8 w-auto object-contain"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
          <div className="w-px h-6 bg-slate-200" />
          <img
            src="/brand/aa2-foundation.jpeg"
            alt="AA2 Foundation"
            className="h-8 w-16 object-contain rounded"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
        </div>
        <div className="flex items-center justify-between px-0.5">
          <span className="text-white font-bold text-xs tracking-wide">AA2 FINANCE</span>
          <span className="text-blue-400 text-[10px] font-semibold bg-blue-500/10 px-1.5 py-0.5 rounded">MFI Platform</span>
        </div>
      </Link>

      {/* User badge */}
      <div className="mx-3 mt-3 px-3 py-2.5 bg-slate-800 rounded-xl border border-slate-700/50">
        <div className="flex items-center gap-2.5">
          <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shadow-inner', ROLE_STYLE[role] || 'bg-blue-500/20 text-blue-300')}>
            {(user?.name || user?.email || 'U').slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-white text-xs font-bold truncate leading-snug">{user?.email || user?.name}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <ShieldCheck className="w-3 h-3 text-blue-400" />
              <p className="text-slate-400 text-[11px] font-medium leading-none capitalize">{user?.name || (ROLE_LABEL[role] || role)} ({ROLE_LABEL[role] || role})</p>
            </div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {visibleItems.map(item => {
          const Icon = item.icon
          const active = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group',
                active
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1">{item.label}</span>
              {active && <ChevronRight className="w-3 h-3 opacity-60" />}
            </Link>
          )
        })}
      </nav>

      {/* Branch info + Logout */}
      <div className="px-3 pb-4 space-y-1 border-t border-slate-700/50 pt-3">
        {user?.branch && user.branch !== 'ALL' && (
          <div className="flex items-center gap-2 px-3 py-2 text-slate-500 text-xs">
            <Building2 className="w-3.5 h-3.5" />
            <span>{user.branch}</span>
          </div>
        )}
        <button
          onClick={() => setShowLogoutConfirm(true)}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all duration-150"
        >
          <LogOut className="w-4 h-4" />
          <span>Sign Out</span>
        </button>

        <div className="pt-2 border-t border-slate-800 text-center space-y-0.5">
          <p className="text-[10px] text-slate-400 font-semibold">© 2026 AA2 Finance. All rights reserved.</p>
          <p className="text-[9px] text-slate-500 font-medium">Powered by Gorav MF Solution</p>
        </div>
      </div>

      {/* Sign Out Confirmation Modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-700 text-white w-full max-w-sm p-6 rounded-3xl shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-red-500/20 border border-red-500/30 flex items-center justify-center text-red-400">
                <LogOut className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-white">Confirm Sign Out</h3>
                <p className="text-xs text-slate-400">Are you sure you want to sign out?</p>
              </div>
            </div>
            <p className="text-xs text-slate-300 bg-slate-950/60 p-3 rounded-xl border border-slate-800">
              Any unsaved changes in active forms will be lost. You will need to sign in again to access the system.
            </p>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs rounded-xl transition"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowLogoutConfirm(false)
                  logout()
                }}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white font-bold text-xs rounded-xl transition shadow-lg shadow-red-500/20"
              >
                Yes, Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}
