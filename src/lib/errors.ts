export type AppErrorKind =
  | 'offline'
  | 'auth'
  | 'permission'
  | 'validation'
  | 'conflict'
  | 'server'
  | 'unknown'

type ErrorShape = {
  message?: string
  code?: string
  status?: number
  error_description?: string
}

const NETWORK_MARKERS = [
  'failed to fetch',
  'networkerror',
  'network request failed',
  'load failed',
  'fetch failed',
  'err_internet_disconnected',
  'econnrefused',
  'timeout',
]

export function classifyError(error: unknown): AppErrorKind {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline'
  const e = (error ?? {}) as ErrorShape
  const message = (e.message ?? e.error_description ?? '').toLowerCase()

  if (e.code === 'PGRST301' || (e.status ?? 0) === 401) return 'auth'
  if (e.code === '42501' || (e.status ?? 0) === 403) return 'permission'
  if (e.code === '23514' || e.code?.startsWith('22')) return 'validation'
  if (e.code === '23505' || e.code === 'P0001' || /idempot|already|duplicate/.test(message)) {
    return 'conflict'
  }
  if (e.code) return 'validation'
  if (NETWORK_MARKERS.some((marker) => message.includes(marker))) return 'offline'
  return 'unknown'
}

/** Human-readable message that never claims success and never leaks internals. */
export function describeError(error: unknown): string {
  const kind = classifyError(error)
  const raw = (error as ErrorShape | null)?.message ?? ''

  switch (kind) {
    case 'offline':
      return 'Connection lost. Check your internet connection — nothing was saved. Try again when you are back online.'
    case 'auth':
      return 'Your session expired. Please sign in again.'
    case 'permission':
      return raw || 'You do not have permission to do that.'
    case 'validation':
      return raw || 'The data is not valid. Check the highlighted fields.'
    case 'conflict':
      return raw || 'This action conflicts with an existing record.'
    case 'server':
      return 'The server is having trouble right now. Nothing was changed — please retry.'
    default:
      return raw || 'Something went wrong. Please retry.'
  }
}

/** Deterministic (non-network) failures should not be retried. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  const kind = classifyError(error)
  if (kind === 'offline' || kind === 'server' || kind === 'unknown') return failureCount < 2
  return false
}
