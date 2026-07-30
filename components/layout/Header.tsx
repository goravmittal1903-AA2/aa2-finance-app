'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight, Home } from 'lucide-react'
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

export function Header() {
  const pathname = usePathname()
  const segments = pathname.split('/').filter(Boolean)

  return (
    <header className="fixed top-0 left-60 right-0 h-15 bg-white border-b border-slate-200 flex items-center px-6 z-20 shadow-sm"
      style={{ height: '60px' }}>
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

      {/* Right side */}
      <div className="ml-auto flex items-center gap-3">
        <span className="text-xs text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full font-medium">
          {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
        </span>
      </div>
    </header>
  )
}
