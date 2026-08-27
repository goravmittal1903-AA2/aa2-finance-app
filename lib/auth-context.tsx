'use client'

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { SessionUser } from '@/lib/types'

interface AuthContextType {
  user: SessionUser | null
  session: Session | null
  isLoading: boolean
  refreshProfile: (session?: Session | null) => Promise<SessionUser | null>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

function toSessionUser(profile: {
  id: string
  email: string
  display_name: string
  role: SessionUser['role']
  branch_code: string | null
}) {
  return {
    id: profile.id,
    email: profile.email,
    name: profile.display_name,
    role: profile.role,
    branch: profile.branch_code || 'ALL',
  } satisfies SessionUser
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const refreshProfile = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', { cache: 'no-store' })
      if (!res.ok) {
        setUser(null)
        setSession(null)
        return null
      }
      const data = await res.json()
      if (data.user) {
        setUser(data.user)
        setSession(data.session)
        return data.user
      } else {
        setUser(null)
        setSession(null)
        return null
      }
    } catch {
      setUser(null)
      setSession(null)
      return null
    }
  }, [])

  useEffect(() => {
    let alive = true

    const initialise = async () => {
      try {
        await refreshProfile()
      } catch (err) {
        console.warn('Auth init error:', err)
      } finally {
        if (alive) setIsLoading(false)
      }
    }

    void initialise()
    const { data: listener } = supabase.auth.onAuthStateChange((_event) => {
      void refreshProfile()
    })

    return () => {
      alive = false
      listener.subscription.unsubscribe()
    }
  }, [refreshProfile])

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    await supabase.auth.signOut()
    setSession(null)
    setUser(null)
    window.location.assign('/login')
  }, [])

  return (
    <AuthContext.Provider value={{ user, session, isLoading, refreshProfile, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

// ─── Client-side presentation helper ────────────────────────────────────────
// Database RLS and server routes remain the source of truth for authorization.
//
// Role capabilities:
//   it       → full system access (all pages + user management)
//   admin    → employee pages + Financials (investors, audit log, settings read)
//   employee → dashboard, members, loans, collections, reports only

export function can(role: string | undefined, action: string): boolean {
  if (role === 'it') return true

  const perms: Record<string, string[]> = {
    admin: [
      'view', 'create', 'edit', 'collect',
      'reports', 'members', 'loans', 'grievances',
      'documents', 'financials', 'investors', 'audit',
    ],
    employee: [
      'view', 'create', 'edit', 'collect',
      'reports', 'members', 'loans', 'collections',
    ],
  }

  return (perms[role || ''] || []).includes(action)
}
