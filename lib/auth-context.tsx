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

  const refreshProfile = useCallback(async (nextSession?: Session | null) => {
    const activeSession = nextSession === undefined
      ? (await supabase.auth.getSession()).data.session
      : nextSession

    setSession(activeSession)
    if (!activeSession?.user) {
      setUser(null)
      return null
    }

    const { data, error } = await supabase
      .from('user_profiles')
      .select('id, email, display_name, role, branch_code')
      .eq('id', activeSession.user.id)
      .maybeSingle()

    if (error || !data) {
      setUser(null)
      return null
    }

    const profile = toSessionUser(data as Parameters<typeof toSessionUser>[0])
    setUser(profile)
    return profile
  }, [])

  useEffect(() => {
    let alive = true

    const initialise = async () => {
      const timeout = new Promise(resolve => setTimeout(resolve, 2500))
      try {
        await Promise.race([refreshProfile(), timeout])
      } catch (err) {
        console.warn('Auth init timeout/error:', err)
      } finally {
        if (alive) setIsLoading(false)
      }
    }

    void initialise()
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void refreshProfile(nextSession)
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
