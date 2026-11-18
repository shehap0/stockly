import { useState } from 'react'
import { useBranches } from '@/features/branches/api'
import { useAuth } from '@/features/auth/AuthContext'
import { roleLabel } from '@/lib/money'
import type { Enums, Profile } from '@/lib/database.types'
import { useDeleteUser, useInviteUser, useUpdateUser, useUpdateUserPhone, useUsers } from './api'
import { describeError } from '@/lib/errors'

const ROLES: Enums['user_role'][] = ['OWNER', 'BRANCH_EMPLOYEE']

function InviteForm() {
  const { data: branches } = useBranches()
  const invite = useInviteUser()
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<Enums['user_role']>('BRANCH_EMPLOYEE')
  const [branchId, setBranchId] = useState('')
  const [message, setMessage] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setMessage(null)
    try {
      await invite.mutateAsync({
        email,
        phone,
        fullName,
        role,
        branchId: role === 'OWNER' ? null : branchId || null,
      })
      setMessage(`Email invitation sent to ${email}. Phone sign-in is ready for ${phone}.`)
      setEmail('')
      setPhone('')
      setFullName('')
    } catch (err) {
      setMessage((err as Error).message)
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end' }}>
      <label>Email<br /><input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
      <label>Phone number<br /><input type="tel" autoComplete="tel" inputMode="tel" placeholder="+20 100 000 0000" value={phone} onChange={(e) => setPhone(e.target.value)} required /></label>
      <label>Full name<br /><input value={fullName} onChange={(e) => setFullName(e.target.value)} required /></label>
      <label>
        Role<br />
        <select value={role} onChange={(e) => setRole(e.target.value as Enums['user_role'])}>
          {ROLES.map((r) => (
            <option key={r} value={r}>{roleLabel(r)}</option>
          ))}
        </select>
      </label>
      {role !== 'OWNER' && (
        <label>
          Branch<br />
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)} required>
            <option value="">Select…</option>
            {branches?.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </label>
      )}
      <button type="submit" disabled={invite.isPending}>
        {invite.isPending ? 'Sending invite…' : 'Add staff and send invite'}
      </button>
      {message && <span style={{ flexBasis: '100%' }}>{message}</span>}
    </form>
  )
}

function UserRow({ user, selfId }: { user: Profile; selfId: string }) {
  const { data: branches } = useBranches()
  const update = useUpdateUser()
  const updatePhone = useUpdateUserPhone()
  const deleteUser = useDeleteUser()
  const [phone, setPhone] = useState(user.phone ?? '')
  const [role, setRole] = useState<Enums['user_role']>(user.role)
  const [branchId, setBranchId] = useState(user.branch_id ?? '')
  const [isActive, setIsActive] = useState(user.is_active)
  const [error, setError] = useState<string | null>(null)

  const isSelf = user.id === selfId
  const dirty =
    role !== user.role || (role === 'OWNER' ? null : branchId || null) !== user.branch_id || isActive !== user.is_active

  async function save() {
    setError(null)
    try {
      await update.mutateAsync({ id: user.id, role, branchId: branchId || null, isActive })
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function savePhone() {
    setError(null)
    try {
      const updated = await updatePhone.mutateAsync({ profileId: user.id, phone })
      setPhone(updated.phone)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function removeUser() {
    if (!window.confirm(`Delete ${user.full_name}? This permanently removes their account and access.`)) return
    setError(null)
    try {
      await deleteUser.mutateAsync(user.id)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <tr style={{ borderBottom: '1px solid #eee' }}>
      <td style={{ padding: 6 }}>
        {user.full_name}
        {isSelf && <span style={{ color: '#999' }}> (you)</span>}
      </td>
      <td style={{ padding: 6 }}><div style={{ display: 'flex', gap: 6, minWidth: 230 }}><input type="tel" aria-label={`Phone number for ${user.full_name}`} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+20 100 000 0000" /><button onClick={savePhone} disabled={phone === (user.phone ?? '') || updatePhone.isPending}>{updatePhone.isPending ? 'Saving…' : 'Save'}</button></div></td>
      <td style={{ padding: 6 }}>
        <select
          value={role}
          disabled={isSelf}
          onChange={(e) => {
            const next = e.target.value as Enums['user_role']
            setRole(next)
            if (next === 'OWNER') setBranchId('')
          }}
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>{roleLabel(r)}</option>
          ))}
        </select>
      </td>
      <td style={{ padding: 6 }}>
        {role === 'OWNER' ? (
          <span style={{ color: '#666' }}>Company-wide</span>
        ) : (
          <select value={branchId} disabled={isSelf} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">—</option>
            {branches?.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        )}
      </td>
      <td style={{ padding: 6 }}>
        <label>
          <input
            type="checkbox"
            checked={isActive}
            disabled={isSelf}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          {' '}active
        </label>
      </td>
      <td style={{ padding: 6 }}>
        <button onClick={save} disabled={!dirty || update.isPending || isSelf}>
          Save
        </button>
        <button className="danger" onClick={removeUser} disabled={isSelf || deleteUser.isPending}>
          {deleteUser.isPending ? 'Deleting…' : 'Delete'}
        </button>
        {error && <div style={{ color: 'crimson', fontSize: '0.85em' }}>{error}</div>}
      </td>
    </tr>
  )
}

export default function UsersPage() {
  const { profile } = useAuth()
  const { data: users, isLoading, error } = useUsers()

  if (isLoading) return <p>Loading users…</p>
  if (error) return <p role="alert" style={{ color: 'crimson' }}>{describeError(error)}</p>

  return (
    <section>
      <h2>Users</h2>
      <p style={{ color: '#666' }}>
        Invite staff by email so they can set a password. They can then sign in with their email or phone number. Deactivated users keep their data but lose access.
      </p>

      <h3>Invite user</h3>
      <InviteForm />

      <h3 style={{ marginTop: 24 }}>Team</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
            <th style={{ padding: 6 }}>Name</th>
            <th style={{ padding: 6 }}>Phone</th>
            <th style={{ padding: 6 }}>Role</th>
            <th style={{ padding: 6 }}>Branch</th>
            <th style={{ padding: 6 }}>Status</th>
            <th style={{ padding: 6 }} />
          </tr>
        </thead>
        <tbody>
          {users?.map((u) => (
            <UserRow key={u.id} user={u} selfId={profile!.id} />
          ))}
        </tbody>
      </table>
    </section>
  )
}
