/** Client-side error logging. Swap `sink` for a remote collector when one exists. */
type Level = 'warn' | 'error'

const sink = (level: Level, message: string, context: unknown) => {
  const entry = { level, message, context, at: new Date().toISOString() }
  if (level === 'error') console.error('[stockly]', entry)
  else console.warn('[stockly]', entry)
}

export function logError(message: string, context?: unknown): void {
  sink('error', message, context)
}

export function logWarn(message: string, context?: unknown): void {
  sink('warn', message, context)
}

/** Installs global handlers so uncaught failures are never silent. */
export function installGlobalErrorLogging(): void {
  window.addEventListener('unhandledrejection', (event) => {
    logError('Unhandled promise rejection', event.reason)
  })
  window.addEventListener('error', (event) => {
    logError('Uncaught error', {
      message: event.message,
      source: event.filename,
      line: event.lineno,
    })
  })
}
