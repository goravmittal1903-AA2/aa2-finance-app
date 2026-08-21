'use client'

import Link from 'next/link'
import { ChevronRight, Home } from 'lucide-react'

export interface BreadcrumbItem {
  label: string
  href?: string
}

export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mb-4 flex-wrap">
      <Link href="/dashboard" className="hover:text-slate-800 dark:hover:text-slate-200 flex items-center gap-1 transition">
        <Home className="w-3.5 h-3.5 text-slate-400" />
        <span>Dashboard</span>
      </Link>
      {items.map((item, idx) => (
        <div key={idx} className="flex items-center gap-1.5">
          <ChevronRight className="w-3 h-3 text-slate-300 dark:text-slate-600 flex-shrink-0" />
          {item.href ? (
            <Link href={item.href} className="hover:text-slate-800 dark:hover:text-slate-200 transition font-medium">
              {item.label}
            </Link>
          ) : (
            <span className="font-semibold text-slate-800 dark:text-slate-200">{item.label}</span>
          )}
        </div>
      ))}
    </nav>
  )
}
