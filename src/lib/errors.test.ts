import { describe, it, expect } from 'vitest'
import { classifyError, describeError, shouldRetry } from './errors'

describe('error classification', () => {
  it('detects network failures as offline', () => {
    expect(classifyError(new TypeError('Failed to fetch'))).toBe('offline')
    expect(classifyError(new Error('NetworkError when attempting to fetch resource.'))).toBe('offline')
  })

  it('maps Postgres/auth codes', () => {
    expect(classifyError({ code: '42501', message: 'denied' })).toBe('permission')
    expect(classifyError({ code: 'PGRST301', message: 'jwt expired' })).toBe('auth')
    expect(classifyError({ code: '23514', message: 'check failed' })).toBe('validation')
    expect(classifyError({ code: '23505', message: 'duplicate key' })).toBe('conflict')
  })

  it('never claims success for connection failures', () => {
    const text = describeError(new TypeError('Failed to fetch'))
    expect(text).toMatch(/nothing was saved|connection/i)
  })

  it('retries only transient errors, with a bounded count', () => {
    const offline = new TypeError('Failed to fetch')
    expect(shouldRetry(0, offline)).toBe(true)
    expect(shouldRetry(2, offline)).toBe(false)
    expect(shouldRetry(0, { code: '42501', message: 'denied' })).toBe(false)
  })
})
