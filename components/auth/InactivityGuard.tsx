'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { Clock, ShieldAlert, LogOut, RefreshCw } from 'lucide-react'
import { toast } from '@/lib/toast'

const INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000 // 10 minutes
const COUNTDOWN_SECONDS = 30

export function InactivityGuard({ children }: { children: React.ReactNode }) {
  const [showModal, setShowModal] = useState(false)
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS)
  const { logout, user } = useAuth()
  const router = useRouter()

  const lastActivityRef = useRef<number>(Date.now())
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null)
  const checkTimerRef = useRef<NodeJS.Timeout | null>(null)

  const resetActivity = () => {
    lastActivityRef.current = Date.now()
    if (showModal) {
      // User interacted while modal was open
    }
  }

  const handleStayLoggedIn = () => {
    lastActivityRef.current = Date.now()
    setShowModal(false)
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current)
    toast.success('Session Extended', 'Your active session has been renewed.')
  }

  const handleLogout = async () => {
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current)
    if (checkTimerRef.current) clearInterval(checkTimerRef.current)
    setShowModal(false)
    await logout()
    router.replace('/login?error=session_expired')
  }

  useEffect(() => {
    if (!user) return

    const events = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll']
    const handleUserEvent = () => resetActivity()

    events.forEach(event => window.addEventListener(event, handleUserEvent))

    checkTimerRef.current = setInterval(() => {
      const now = Date.now()
      const inactiveFor = now - lastActivityRef.current

      if (inactiveFor >= INACTIVITY_TIMEOUT_MS && !showModal) {
        setShowModal(true)
        setCountdown(COUNTDOWN_SECONDS)

        countdownTimerRef.current = setInterval(() => {
          setCountdown(prev => {
            if (prev <= 1) {
              if (countdownTimerRef.current) clearInterval(countdownTimerRef.current)
              handleLogout()
              return 0
            }
            return prev - 1
          })
        }, 1000)
      }
    }, 5000)

    return () => {
      events.forEach(event => window.removeEventListener(event, handleUserEvent))
      if (checkTimerRef.current) clearInterval(checkTimerRef.current)
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current)
    }
  }, [user, showModal])

  return (
    <>
      {children}

      {/* Sticky Session Expiry Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in">
          <div className="bg-slate-900 border border-slate-700 text-white w-full max-w-md p-6 rounded-3xl shadow-2xl space-y-5 relative">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
                <Clock className="w-6 h-6 text-amber-400 animate-pulse" />
              </div>
              <div>
                <h3 className="font-bold text-base text-white">Session Timeout Warning</h3>
                <p className="text-xs text-slate-400">No activity detected for 10 minutes</p>
              </div>
            </div>

            <div className="bg-slate-950/60 rounded-2xl p-5 border border-slate-800 text-center space-y-2">
              <p className="text-xs text-slate-300">Your session will automatically expire in:</p>
              <div className="font-mono font-black text-4xl text-amber-400 tracking-wider">
                00:{String(countdown).padStart(2, '0')}
              </div>
              <p className="text-[11px] text-slate-400">Click &quot;Stay Logged In&quot; to continue your work.</p>
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
