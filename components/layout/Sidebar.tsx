'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { cn } from '@/lib/utils'
import { confirmAction } from '@/lib/confirm'
import {
  LayoutDashboard, Users, CreditCard, Receipt, BarChart3,
  MessageSquare, FolderOpen, Settings, LogOut, Landmark,
  ClipboardList, Building2, ChevronRight, ShieldCheck,
  Package, DatabaseBackup, Trash2, PanelLeftClose, PanelLeftOpen
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
  { href: '/grievances',   label: 'Grievances',      icon: MessageSquare,   allowedRoles: [] },
  { href: '/documents',    label: 'Documents',       icon: FolderOpen,      allowedRoles: [] },
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

export function Sidebar({ collapsed = false, onToggle }: { collapsed?: boolean; onToggle?: () => void }) {
  const pathname = usePathname()
  const { user, logout } = useAuth()
  const role = user?.role || ''

  const visibleItems = navItems.filter(item =>
    item.allowedRoles.length === 0 || item.allowedRoles.includes(role)
  )

  return (
    <aside className={cn("fixed left-0 top-0 h-screen bg-slate-900 flex flex-col z-30 shadow-xl transition-all duration-200", collapsed ? "w-16" : "w-60")}>
      {/* Brand Header — Links directly to /dashboard */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-slate-700/50 bg-slate-950/40">
        <Link href="/dashboard" className="flex items-center gap-2 overflow-hidden">
          <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center flex-shrink-0 text-white font-black text-xs shadow-md">
            AA2
          </div>
          {!collapsed && (
            <div className="flex flex-col min-w-0">
              <span className="text-white font-bold text-xs tracking-wide truncate">AA2 FINANCE</span>
              <span className="text-blue-400 text-[9px] font-semibold">MFI Platform</span>
            </div>
          )}
        </Link>
        <button
          onClick={onToggle}
          className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition"
          title={collapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
        </button>
      </div>

      {/* User badge */}
      {!collapsed && (
        <div className="mx-3 mt-3 px-3 py-2 bg-slate-800 rounded-xl border border-slate-700/50">
          <div className="flex items-center gap-2.5">
            <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs shadow-inner flex-shrink-0', ROLE_STYLE[role] || 'bg-blue-500/20 text-blue-300')}>
              {(user?.name || user?.email || 'U').slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-white text-xs font-bold truncate leading-snug">{user?.email || user?.name}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <ShieldCheck className="w-3 h-3 text-blue-400" />
                <p className="text-slate-400 text-[10px] font-medium leading-none capitalize">{user?.name || (ROLE_LABEL[role] || role)}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
        {visibleItems.map(item => {
          const Icon = item.icon
          const active = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group',
                active
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800',
                collapsed && 'justify-center px-2'
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
              {!collapsed && active && <ChevronRight className="w-3 h-3 opacity-60" />}
            </Link>
          )
        })}
      </nav>

      {/* Logout */}
      <div className="px-2 pb-4 space-y-1 border-t border-slate-700/50 pt-3">
        <button
          onClick={async () => {
            const ok = await confirmAction({
              title: 'Confirm Sign Out',
              message: `Are you sure you want to sign out from ${user?.email || 'your account'}? Any unsaved work will be lost.`,
              confirmText: 'Yes, Sign Out',
              variant: 'danger',
            })
            if (ok) await logout()
          }}
          title={collapsed ? "Sign Out" : undefined}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all duration-150",
            collapsed && "justify-center px-2"
          )}
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {!collapsed && <span>Sign Out</span>}
        </button>
      </div>
    </aside>
  )
}
