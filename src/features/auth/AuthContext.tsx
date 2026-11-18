import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/lib/database.types'
import { getCurrentProfile } from './api'

type AuthState = {
  session: Session | null
  profile: Profile | null
  loading: boolean
}

type AuthContextValue = AuthState & {
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      const {
        data: { session: current },
      } = await supabase.auth.getSession()
      if (cancelled) return
      setSession(current)
      if (current) {
        try {
          setProfile(await getCurrentProfile())
        } catch {
          setProfile(null)
        }
      }
      setLoading(false)
    }

    void bootstrap()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      if (!nextSession) {
        setProfile(null)
        return
      }

      // Supabase auth callbacks run synchronously inside its auth lock. Defer
      // profile I/O so a refresh token update cannot deadlock another auth call.
      queueMicrotask(() => {
        if (cancelled) return
        void getCurrentProfile()
          .then((nextProfile) => {
            if (!cancelled) setProfile(nextProfile)
          })
          .catch(() => {
            if (!cancelled) setProfile(null)
          })
      })
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  const value: AuthContextValue = {
    session,
    profile,
    loading,
    refreshProfile: async () => {
      const p = await getCurrentProfile()
      setProfile(p)
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
