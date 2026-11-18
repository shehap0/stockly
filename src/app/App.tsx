import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router-dom'
import { AuthProvider } from '@/features/auth/AuthContext'
import ErrorBoundary from './ErrorBoundary'
import ConnectivityBanner from './ConnectivityBanner'
import { queryClient } from '@/lib/queryClient'
import { router } from './router'
import { LocalizedContent } from '@/lib/preferences'

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ConnectivityBanner />
        <AuthProvider>
          <LocalizedContent><RouterProvider router={router} /></LocalizedContent>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}
