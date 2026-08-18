'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { Clock, LogOut, RefreshCw, Loader2 } from 'lucide-react'
import { toast } from '@/lib/toast'

const INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000 // 10 minutes inactivity
const COUNTDOWN_SECONDS = 30

export function InactivityGuard({ children }: { children: React.ReactNode }) {
  const [showModal, setShowModal] = useState(false)
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const { logout, user } = useAuth()
  const router = useRouter()

  const lastActivityRef = useRef<number>(Date.now())
  const checkTimerRef = useRef<NodeJS.Timeout | null>(null)

  const resetActivity = useCallback(() => {
    lastActivityRef.current = Date.now()
  }, [])

  const handleLogout = useCallback(async () => {
    setIsSigningOut(true)
    setShowModal(false)
    try {
      await logout()
      router.replace('/login?error=session_expired')
    } catch {
      window.location.href = '/login'
    }
  }, [logout, router])

  const handleStayLoggedIn = () => {
    resetActivity()
    setShowModal(false)
    setCountdown(COUNTDOWN_SECONDS)
    toast.success('Session Extended', 'Your active session has been renewed.')
  }

  // 1. Activity Listener & Inactivity Checker Interval
  useEffect(() => {
    if (!user) return

    const events = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll']
    const handleUserEvent = () => resetActivity()

    events.forEach(event => window.addEventListener(event, handleUserEvent, { passive: true }))

    checkTimerRef.current = setInterval(() => {
      const now = Date.now()
      const inactiveFor = now - lastActivityRef.current

      if (inactiveFor >= INACTIVITY_TIMEOUT_MS && !showModal && !isSigningOut) {
        setCountdown(COUNTDOWN_SECONDS)
        setShowModal(true)
      }
    }, 3000)

    return () => {
      events.forEach(event => window.removeEventListener(event, handleUserEvent))
      if (checkTimerRef.current) clearInterval(checkTimerRef.current)
    }
  }, [user, showModal, isSigningOut, resetActivity])

  // 2. Separate Countdown Interval (Ticks smoothly 30 -> 0 every 1000ms when showModal is true)
  useEffect(() => {
    if (!showModal) return

    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer)
          handleLogout()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [showModal, handleLogout])

  return (
    <>
      {children}

      {/* Full Screen Signing Out Overlay */}
      {isSigningOut && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-slate-950/90 backdrop-blur-md text-white space-y-4 animate-in fade-in">
          <div className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center shadow-xl shadow-blue-500/30 animate-bounce">
            <span className="text-white font-black text-lg">AA2</span>
          </div>
          <div className="flex items-center gap-2 text-slate-300 text-sm font-semibold">
            <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
            <span>Signing out of AA2 Finance… Please wait</span>
          </div>
        </div>
      )}

      {/* Sticky Session Expiry Warning Modal */}
      {showModal && !isSigningOut && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in">
          <div className="bg-slate-900 border border-slate-700 text-white w-full max-w-md p-6 rounded-3xl shadow-2xl space-y-5 relative">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
                <Clock className="w-6 h-6 text-amber-400 animate-pulse" />
              </div>
              <div>
                <h3 className="font-bold text-base text-white">Session Timeout Warning</h3>
                <p className="text-xs text-slate-400">No user movement detected for 10 minutes</p>
              </div>
            </div>

            <div className="bg-slate-950/70 rounded-2xl p-5 border border-slate-800 text-center space-y-2">
              <p className="text-xs text-slate-300">Your session will automatically expire in:</p>
              <div className="font-mono font-black text-4xl text-amber-400 tracking-wider">
                00:{String(countdown).padStart(2, '0')}
              </div>
              <p className="text-[11px] text-slate-400">Click &quot;Stay Logged In&quot; to extend your session.</p>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={handleLogout}
                className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs rounded-xl transition"
              >
                <LogOut className="w-4 h-4" /> Log Out Now
              </button>
              <button
                onClick={handleStayLoggedIn}
                className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl transition shadow-lg shadow-blue-500/20"
              >
                <RefreshCw className="w-4 h-4" /> Stay Logged In
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
