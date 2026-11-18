import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { requestPasswordReset, updatePassword } from './api'
import { useAuth } from './AuthContext'
import { describeError } from '@/lib/errors'

const requestSchema = z.object({
  email: z.string().email('Enter a valid email'),
})
const updateSchema = z
  .object({
    password: z.string().min(8, 'At least 8 characters'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: 'Passwords do not match',
    path: ['confirm'],
  })

type RequestForm = z.infer<typeof requestSchema>
type UpdateForm = z.infer<typeof updateSchema>

export default function ResetPasswordPage() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const requestForm = useForm<RequestForm>({ resolver: zodResolver(requestSchema) })
  const updateForm = useForm<UpdateForm>({ resolver: zodResolver(updateSchema) })

  // Password-recovery links land here with a session; the user can set a new password.
  if (session) {
    return (
      <main style={{ maxWidth: 380, margin: '80px auto', fontFamily: 'system-ui' }}>
        <h1>Set a new password</h1>
        <form onSubmit={updateForm.handleSubmit(async (v) => {
          setError(null)
          try {
            await updatePassword(v.password)
            setMessage('Password updated.')
            setTimeout(() => navigate('/', { replace: true }), 800)
          } catch (err) {
            setError(describeError(err))
          }
        })} noValidate>
          <div>
            <label htmlFor="password">New password</label>
            <input id="password" type="password" {...updateForm.register('password')} />
            {updateForm.formState.errors.password && (
              <span role="alert">{updateForm.formState.errors.password.message}</span>
            )}
          </div>
          <div>
            <label htmlFor="confirm">Confirm password</label>
            <input id="confirm" type="password" {...updateForm.register('confirm')} />
            {updateForm.formState.errors.confirm && (
              <span role="alert">{updateForm.formState.errors.confirm.message}</span>
            )}
          </div>
          {error && <p role="alert" style={{ color: 'crimson' }}>{error}</p>}
          {message && <p style={{ color: 'green' }}>{message}</p>}
          <button type="submit" disabled={updateForm.formState.isSubmitting}>
            Update password
          </button>
        </form>
      </main>
    )
  }

  return (
    <main style={{ maxWidth: 380, margin: '80px auto', fontFamily: 'system-ui' }}>
      <h1>Reset password</h1>
      <p>We will email you a password-reset link.</p>
      <form onSubmit={requestForm.handleSubmit(async (v) => {
        setError(null)
        try {
          await requestPasswordReset(v.email)
          setMessage('Reset link sent — check your email.')
        } catch (err) {
          setError(describeError(err))
        }
      })} noValidate>
        <div>
          <label htmlFor="email">Email</label>
          <input id="email" type="email" {...requestForm.register('email')} />
          {requestForm.formState.errors.email && (
            <span role="alert">{requestForm.formState.errors.email.message}</span>
          )}
        </div>
        {error && <p role="alert" style={{ color: 'crimson' }}>{error}</p>}
        {message && <p style={{ color: 'green' }}>{message}</p>}
        <button type="submit" disabled={requestForm.formState.isSubmitting}>
          Send reset link
        </button>
      </form>
    </main>
  )
}
