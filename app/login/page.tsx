'use client'

import { useState, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, LockKeyhole, Loader2 } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'

import microfinanceLogo from '@/public/brand/aa2-microfinance.png'
import foundationLogo from '@/public/brand/aa2-foundation.jpeg'
import bgBuildings from '@/public/brand/login-buildings.jpg'

async function api(path: string, body?: object) {
  const response = await fetch(path, {
    method: 'POST',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const result = await response.json().catch(() => ({})) as { error?: string; locked?: boolean }
  if (!response.ok) {
    const error = new Error(result.error || 'Something went wrong. Please try again.') as Error & { locked?: boolean }
    error.locked = result.locked
    throw error
  }
  return result
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-900 flex items-center justify-center text-white text-sm">Loading…</div>}>
      <LoginForm />
    </Suspense>
  )
}

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { refreshProfile } = useAuth()
  const router = useRouter()

  // ── Sign In ────────────────────────────────────────────────────────────────
  async function handleSignIn(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setLoading(true)
    const cleanEmail = email.trim().toLowerCase()
    try {
      // Direct browser sign in via Supabase client (instant)
      const { data, error: sbErr } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      })

      if (sbErr || !data.user) {
        throw new Error(sbErr?.message || 'Invalid login credentials. Please check your email and password.')
      }

      const profile = await refreshProfile(data.session)
      if (!profile) {
        throw new Error('Your application profile is inactive or not found. Contact an administrator.')
      }

      // Immediate redirect to dashboard
      window.location.assign('/dashboard')
    } catch (caught) {
      const failure = caught as Error
      setError(failure.message || 'Authentication failed.')
      setLoading(false)
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      {/* Background Image — Skyscraper Buildings Photo */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${bgBuildings.src})` }}
      />
      {/* Subtle overlay for optimal card readability */}
      <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-[2px]" />

      {/* Card */}
      <section className="relative w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-white/20">

        {/* Brand header — Both logos displayed clearly */}
        <div className="bg-white px-7 py-6 border-b border-slate-100">
          <div className="flex items-center justify-center gap-4 mb-3">
            <img
              src={microfinanceLogo.src}
              alt="AA2 Micro Finance"
              className="h-14 w-auto object-contain"
            />
            <div className="w-px h-10 bg-slate-200" />
            <img
              src={foundationLogo.src}
              alt="AA2 Foundation"
              className="h-14 w-28 rounded-lg object-contain"
            />
          </div>
          <div className="text-center">
            <h1 className="text-lg font-black text-slate-800 tracking-tight">AA2 MICRO FINANCE</h1>
            <p className="text-xs text-slate-400 font-medium mt-0.5">Loan Management System · Secure Portal</p>
          </div>
        </div>

        <div className="p-7 space-y-4">
          <form onSubmit={handleSignIn} className="space-y-4">
            <div className="flex items-center gap-2 text-slate-900">
              <LockKeyhole className="h-5 w-5 text-blue-700" />
              <h1 className="text-xl font-bold">Sign in</h1>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Work email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="name@aa2finance.com"
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-700 focus:ring-2 focus:ring-blue-200 text-sm"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete="current-password"
                  placeholder="••••••••••••"
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 pr-12 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-700 focus:ring-2 focus:ring-blue-200 text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(p => !p)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-slate-500 hover:text-blue-800"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {error && (
              <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
                {error}
              </p>
            )}

            <button
              disabled={loading}
              type="submit"
              className="w-full flex items-center justify-center gap-2 py-3.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold text-sm rounded-xl transition shadow-lg shadow-blue-500/20"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Signing in…</span>
                </>
              ) : (
                'Sign in'
              )}
            </button>
          </form>
        </div>

        {/* Footer Brand Copyright */}
        <div className="bg-slate-50 px-7 py-3.5 border-t border-slate-100 text-center">
          <p className="text-[11px] text-slate-600 font-semibold">
            © 2026 AA2 Finance. All rights reserved.
          </p>
          <p className="text-[10px] text-slate-400 font-medium mt-0.5">
            Powered by Gorav MF Solution
          </p>
        </div>
      </section>

      {/* Page Footer */}
      <footer className="absolute bottom-3 text-center text-[11px] text-white/90 font-semibold drop-shadow-md">
        © 2026 AA2 Finance · All Rights Reserved · Powered by Gorav MF Solution
      </footer>
    </main>
  )
}
