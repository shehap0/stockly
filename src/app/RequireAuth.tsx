import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import type { UserRole } from '@/lib/database.types'

export default function RequireAuth({ role }: { role?: UserRole }) {
  const { session, profile, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return <main style={{ padding: 40, fontFamily: 'system-ui' }}>Loading…</main>
  }
  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }
  if (profile === null) {
    return (
      <main style={{ padding: 40, fontFamily: 'system-ui' }}>
        Your account exists but has no profile. Contact the owner.
      </main>
    )
  }
  if (!profile.is_active) {
    return <main style={{ padding: 40, fontFamily: 'system-ui' }}>Your account is deactivated.</main>
  }
  if (role && profile.role !== role) {
    return <main style={{ padding: 40, fontFamily: 'system-ui' }}>Not authorized.</main>
  }
  return <Outlet />
}
