'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Eye, EyeOff, KeyRound, LockKeyhole } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'

import microfinanceLogo from '@/public/brand/aa2-microfinance.png'
import foundationLogo from '@/public/brand/aa2-foundation.jpeg'
import bgBuildings from '@/public/brand/login-buildings.jpg'

type Screen = 'sign-in' | 'forgot-password' | 'new-password' | 'reset-sent'

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
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [screen, setScreen] = useState<Screen>(() =>
    searchParams.get('screen') === 'new-password' ? 'new-password' : 'sign-in'
  )
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState(() => {
    const e = searchParams.get('error')
    if (e === 'invalid_reset_link') return 'The password reset link is invalid.'
    if (e === 'reset_link_expired') return 'The password reset link has expired. Request a new one.'
    return ''
  })
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [locked, setLocked] = useState(false)
  const { refreshProfile } = useAuth()
  const router = useRouter()

  function resetNotice() { setError(''); setMessage('') }
  function changeScreen(next: Screen) { resetNotice(); setScreen(next) }

  // ── Sign In ────────────────────────────────────────────────────────────────
  async function handleSignIn(event: React.FormEvent) {
    event.preventDefault()
    resetNotice()
    setLoading(true)
    try {
      await api('/api/auth/login/start', { email, password })
      const profile = await refreshProfile()
      if (!profile) throw new Error('Your application profile is inactive. Contact an administrator.')
      router.replace('/dashboard')
    } catch (caught) {
      const failure = caught as Error & { locked?: boolean }
      setLocked(Boolean(failure.locked))
      setError(failure.message)
    } finally {
      setLoading(false)
    }
  }

  // ── Forgot Password ────────────────────────────────────────────────────────
  async function handleForgotPassword(event: React.FormEvent) {
    event.preventDefault()
    resetNotice()
    setLoading(true)
    try {
      await api('/api/auth/recovery/start', { email })
      changeScreen('reset-sent')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not send the reset email.')
    } finally {
      setLoading(false)
    }
  }

  // ── New Password (after reset link click) ──────────────────────────────────
  async function handleNewPassword(event: React.FormEvent) {
    event.preventDefault()
    resetNotice()
    if (password !== confirmPassword) { setError('Passwords do not match.'); return }
    setLoading(true)
    try {
      await api('/api/auth/recovery/complete', { password })
      setPassword('')
      setConfirmPassword('')
      changeScreen('sign-in')
      setMessage('Password updated successfully. Sign in with your new password.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update password.')
    } finally {
      setLoading(false)
    }
  }

  // ── Shared UI helpers ──────────────────────────────────────────────────────
  const emailInput = (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-slate-700">Work email</label>
      <input
        type="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        required
        autoComplete="email"
        placeholder="name@aa2finance.com"
        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-700 focus:ring-2 focus:ring-blue-200"
      />
    </div>
  )

  function passwordField(value: string, onChange: (v: string) => void, label: string, autoComplete: string, minLen = 8) {
    return (
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">{label}</label>
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            value={value}
            onChange={e => onChange(e.target.value)}
            required
            minLength={minLen}
            autoComplete={autoComplete}
            placeholder="••••••••••••"
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 pr-12 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-700 focus:ring-2 focus:ring-blue-200"
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
    )
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

          {/* ── Sign In ── */}
          {screen === 'sign-in' && (
            <form onSubmit={handleSignIn} className="space-y-4">
              <div className="flex items-center gap-2 text-slate-900">
                <LockKeyhole className="h-5 w-5 text-blue-700" />
                <h1 className="text-xl font-bold">Sign in</h1>
              </div>

              {emailInput}
              {passwordField(password, setPassword, 'Password', 'current-password')}

              {error && <Notice error={error} />}
              {message && <Notice message={message} />}

              <button disabled={loading} className="primary">
                {loading ? 'Signing in…' : 'Sign in'}
              </button>

              <button
                type="button"
                onClick={() => changeScreen('forgot-password')}
                className="link"
              >
                Forgot password?
              </button>

              {locked && (
                <button
                  type="button"
                  onClick={() => changeScreen('forgot-password')}
                  className="secondary"
                >
                  Reset & unlock account
                </button>
              )}
            </form>
          )}

          {/* ── Forgot Password ── */}
          {screen === 'forgot-password' && (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div className="flex items-center gap-2 text-slate-900">
                <KeyRound className="h-5 w-5 text-blue-700" />
                <h1 className="text-xl font-bold">Reset password</h1>
              </div>
              <p className="text-sm text-slate-500">
                Enter your work email. We will send a password-reset link.
              </p>

              {emailInput}

              {error && <Notice error={error} />}
              {message && <Notice message={message} />}

              <button disabled={loading} className="primary">
                {loading ? 'Sending…' : 'Send reset link'}
              </button>
              <button type="button" onClick={() => changeScreen('sign-in')} className="link">
                Back to sign in
              </button>
            </form>
          )}

          {/* ── Reset link sent confirmation ── */}
          {screen === 'reset-sent' && (
            <div className="space-y-4 text-center">
              <div className="flex justify-center">
                <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center">
                  <KeyRound className="h-6 w-6 text-emerald-600" />
                </div>
              </div>
              <h1 className="text-xl font-bold text-slate-900">Check your email</h1>
              <p className="text-sm text-slate-500 leading-relaxed">
                A password-reset link has been sent to <strong>{email}</strong>.
                Click the link in that email to set a new password.
              </p>
              <button type="button" onClick={() => changeScreen('sign-in')} className="link">
                Back to sign in
              </button>
            </div>
          )}

          {/* ── New Password (after reset link) ── */}
          {screen === 'new-password' && (
            <form onSubmit={handleNewPassword} className="space-y-4">
              <div className="flex items-center gap-2 text-slate-900">
                <LockKeyhole className="h-5 w-5 text-blue-700" />
                <h1 className="text-xl font-bold">Create new password</h1>
              </div>
              <p className="text-sm text-slate-600">Use at least 12 characters.</p>

              {passwordField(password, setPassword, 'New password', 'new-password', 12)}
              {passwordField(confirmPassword, setConfirmPassword, 'Confirm new password', 'new-password', 12)}

              {error && <Notice error={error} />}
              {message && <Notice message={message} />}

              <button disabled={loading} className="primary">
                {loading ? 'Updating…' : 'Update password'}
              </button>
            </form>
          )}

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

function Notice({ error, message }: { error?: string; message?: string }) {
  return (
    <p className={`rounded-xl border p-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-blue-200 bg-blue-50 text-blue-800'}`}>
      {error || message}
    </p>
  )
}
