'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Users, CreditCard, Receipt, BarChart3 } from 'lucide-react'
import { cn } from '@/lib/utils'

const mobileTabs = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/collections', label: 'Collections', icon: Receipt },
  { href: '/loans', label: 'Loans', icon: CreditCard },
  { href: '/members', label: 'Members', icon: Users },
  { href: '/reports', label: 'Reports', icon: BarChart3 },
]

export function MobileNav() {
  const pathname = usePathname()

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 z-40 flex items-center justify-around px-2 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
      {mobileTabs.map((tab) => {
        const Icon = tab.icon
        const isActive = pathname === tab.href || (tab.href !== '/dashboard' && pathname.startsWith(tab.href + '/'))
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "flex flex-col items-center justify-center w-14 h-12 rounded-xl transition-all",
              isActive
                ? "text-blue-600 dark:text-blue-400 font-semibold scale-105"
                : "text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            )}
          >
            <div className={cn(
              "p-1 rounded-lg transition-colors",
              isActive ? "bg-blue-50 dark:bg-blue-950/60" : ""
            )}>
              <Icon className="w-5 h-5" />
            </div>
            <span className="text-[10px] mt-0.5 tracking-tight">{tab.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
