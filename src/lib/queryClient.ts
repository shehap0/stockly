import { QueryClient } from '@tanstack/react-query'
import { shouldRetry } from './errors'
import { logError } from './logger'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      retry: shouldRetry,
      // Reconcile from PostgreSQL after reconnects/focus — realtime is a hint,
      // never the source of truth.
      refetchOnReconnect: true,
      refetchOnWindowFocus: true,
      networkMode: 'online',
    },
    mutations: {
      retry: false,
      networkMode: 'online',
      onError: (error) => logError('Mutation failed', error),
    },
  },
})

queryClient.getQueryCache().subscribe((event) => {
  if (event.type === 'updated' && event.action.type === 'error') {
    logError('Query failed', event.action.error)
  }
})
