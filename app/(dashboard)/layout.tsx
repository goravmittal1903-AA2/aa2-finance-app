'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { Sidebar } from '@/components/layout/Sidebar'
import { Header } from '@/components/layout/Header'
import { InactivityGuard } from '@/components/auth/InactivityGuard'
import { CommandPalette } from '@/components/CommandPalette'
import { AICopilot } from '@/components/ai/AICopilot'
import { MobileNav } from '@/components/layout/MobileNav'
import { cn } from '@/lib/utils'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()
  const router = useRouter()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login')
    }
  }, [user, isLoading, router])

  useEffect(() => {
    const isCollapsed = localStorage.getItem('sidebar_collapsed') === 'true'
    setSidebarCollapsed(isCollapsed)
  }, [])

  const toggleSidebar = () => {
    const next = !sidebarCollapsed
    setSidebarCollapsed(next)
    localStorage.setItem('sidebar_collapsed', String(next))
  }

  if (isLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center animate-pulse shadow-lg shadow-blue-500/30">
            <span className="text-white font-black text-base">AA2</span>
          </div>
          <p className="text-slate-400 text-xs font-medium">Loading AA2 Platform…</p>
        </div>
      </div>
    )
  }

  return (
    <InactivityGuard>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
        {/* Desktop Sidebar (hidden on mobile) */}
        <div className="hidden md:block">
          <Sidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
        </div>
        <Header collapsed={sidebarCollapsed} />
        <CommandPalette />
        <main className={cn(
          "pt-[60px] pb-20 md:pb-6 min-h-screen transition-all duration-200",
          "ml-0 md:ml-60",
          sidebarCollapsed && "md:ml-16"
        )}>
          <div className="p-4 md:p-6 max-w-7xl mx-auto">
            {children}
          </div>
        </main>
        {/* Mobile Bottom Navigation */}
        <MobileNav />
        <AICopilot />
      </div>
    </InactivityGuard>
  )
}

