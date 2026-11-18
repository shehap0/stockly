import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { signIn } from './api'
import { describeError } from '@/lib/errors'
import { PreferenceControls } from '@/lib/preferences'

export default function LoginPage() {
  const navigate = useNavigate()
  const [serverError, setServerError] = useState<string | null>(null)
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setServerError(null)
    setIsSubmitting(true)
    try {
      await signIn(identifier, password)
      navigate('/', { replace: true })
    } catch (err) {
      setServerError(describeError(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="surface auth-panel">
      <div className="auth-preferences"><PreferenceControls /></div>
      <div className="brand-lockup" style={{ padding: '0 0 24px', color: 'var(--ink)' }}><span className="brand-mark">S</span><span className="brand-name">Stockly</span></div>
      <h1>Welcome back</h1>
      <p className="muted">Sign in with your email or phone number and password.</p>
      <form onSubmit={onSubmit}>
        <div style={{ marginBottom: 16 }}><label htmlFor="identifier">Email or phone number</label><input id="identifier" type="text" autoComplete="username" inputMode="text" placeholder="Email or +20 100 000 0000" value={identifier} onChange={(e) => setIdentifier(e.target.value)} required /></div>
        <div style={{ marginBottom: 16 }}><label htmlFor="password">Password</label><input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
        {serverError && <p className="error-state" role="alert">{serverError}</p>}
        <button className="primary" type="submit" disabled={isSubmitting || !identifier.trim() || !password} style={{ width: '100%' }}>{isSubmitting ? 'Signing in…' : 'Sign in'}</button>
      </form>
      <p><Link to="/reset-password">Forgot password?</Link></p>
      </section>
    </main>
  )
}
