import { Component, type ErrorInfo, type ReactNode } from 'react'
import { logError } from '@/lib/logger'

type Props = { children: ReactNode }
type State = { error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    logError('React render error', { error, componentStack: info.componentStack })
  }

  override render() {
    if (this.state.error) {
      return (
        <main style={{ padding: 40, fontFamily: 'system-ui' }}>
          <h1>Something went wrong</h1>
          <p>Your data is safe. Reload the page to continue.</p>
          <button onClick={() => window.location.reload()}>Reload</button>
        </main>
      )
    }
    return this.props.children
  }
}
