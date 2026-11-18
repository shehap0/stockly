import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { logWarn } from '@/lib/logger'

/**
 * Online-only architecture: when the connection drops we say so plainly and
 * pause writes (TanStack mutations use networkMode 'online'). On reconnect we
 * reconcile cached data from PostgreSQL instead of trusting missed events.
 */
export default function ConnectivityBanner() {
  const queryClient = useQueryClient()
  const [offline, setOffline] = useState(() => !navigator.onLine)
  const [reconnectedAt, setReconnectedAt] = useState<number | null>(null)

  useEffect(() => {
    const goOffline = () => {
      setOffline(true)
      logWarn('Browser went offline')
    }
    const goOnline = () => {
      setOffline(false)
      setReconnectedAt(Date.now())
      logWarn('Browser back online — reconciling from PostgreSQL')
      void queryClient.invalidateQueries()
    }
    window.addEventListener('offline', goOffline)
    window.addEventListener('online', goOnline)
    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online', goOnline)
    }
  }, [queryClient])

  useEffect(() => {
    if (!reconnectedAt) return
    const timer = window.setTimeout(() => setReconnectedAt(null), 4000)
    return () => window.clearTimeout(timer)
  }, [reconnectedAt])

  if (offline) {
    return (
      <div
        role="status"
        aria-live="assertive"
        style={{ background: '#b45309', color: 'white', padding: '6px 16px', fontSize: '0.9em' }}
      >
        You are offline. Actions are disabled and nothing new will be saved until the connection
        returns.
      </div>
    )
  }

  if (reconnectedAt) {
    return (
      <div
        role="status"
        aria-live="polite"
        style={{ background: '#166534', color: 'white', padding: '6px 16px', fontSize: '0.9em' }}
      >
        Back online — refreshing data from the server.
      </div>
    )
  }

  return null
}
