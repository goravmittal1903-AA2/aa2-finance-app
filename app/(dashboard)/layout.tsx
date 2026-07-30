'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { Sidebar } from '@/components/layout/Sidebar'
import { Header } from '@/components/layout/Header'
import { InactivityGuard } from '@/components/auth/InactivityGuard'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login')
    }
  }, [user, isLoading, router])

  if (isLoading) {
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

  if (!user) return null

  return (
    <InactivityGuard>
      <div className="min-h-screen bg-slate-50">
        <Sidebar />
        <Header />
        <main className="ml-60 pt-[60px] min-h-screen">
          <div className="p-6">
            {children}
          </div>
        </main>
      </div>
    </InactivityGuard>
  )
}
