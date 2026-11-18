import { useState } from 'react'
import { useAuth } from '@/features/auth/AuthContext'
import type { Branch } from '@/lib/database.types'
import { describeError } from '@/lib/errors'
import { useAllBranches, useBranchMutations } from './api'

function BranchRow({ branch }: { branch: Branch }) {
  const { update } = useBranchMutations()
  const [name, setName] = useState(branch.name)
  const [address, setAddress] = useState(branch.address ?? '')
  const [phone, setPhone] = useState(branch.phone ?? '')
  const [isActive, setIsActive] = useState(branch.is_active)
  const [error, setError] = useState<string | null>(null)

  const dirty =
    name !== branch.name ||
    address !== (branch.address ?? '') ||
    phone !== (branch.phone ?? '') ||
    isActive !== branch.is_active

  async function save() {
    setError(null)
    try {
      await update.mutateAsync({ id: branch.id, name, address, phone, isActive })
    } catch (err) {
      setError(describeError(err))
    }
  }

  return (
    <tr>
      <td><code>{branch.short_code}</code></td>
      <td>
        <label className="sr-only" htmlFor={`branch-name-${branch.id}`}>Branch name</label>
        <input id={`branch-name-${branch.id}`} value={name} onChange={(e) => setName(e.target.value)} />
      </td>
      <td>
        <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Address" />
      </td>
      <td>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" />
      </td>
      <td>
        <label>
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> active
        </label>
      </td>
      <td>
        <button className={dirty ? 'primary' : undefined} onClick={save} disabled={!dirty || update.isPending}>{update.isPending ? 'Saving…' : 'Save name and details'}</button>
        {error && <div style={{ color: 'crimson', fontSize: '0.85em' }}>{error}</div>}
      </td>
    </tr>
  )
}

export default function BranchesPage() {
  const { profile } = useAuth()
  const { data: branches, isLoading, error } = useAllBranches()
  const { create } = useBranchMutations()

  const [shortCode, setShortCode] = useState('')
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState<string | null>(null)

  async function onCreate(e: React.FormEvent) {
    e.preventDefault()
    setMessage(null)
    try {
      await create.mutateAsync({
        companyId: profile!.company_id,
        shortCode: shortCode.trim().toUpperCase(),
        name,
        address,
        phone,
      })
      setMessage(`Branch ${shortCode.toUpperCase()} created.`)
      setShortCode('')
      setName('')
      setAddress('')
      setPhone('')
    } catch (err) {
      setMessage(describeError(err))
    }
  }

  if (isLoading) return <div className="surface empty-state" aria-busy="true">Loading branches…</div>
  if (error) return <p className="error-state" role="alert">{describeError(error)}</p>

  return (
    <section>
      <div className="page-heading"><div><h1>Branches</h1><p>Rename current locations or add a branch when you expand.</p></div><span className="status-pill">{branches?.filter((b) => b.is_active).length ?? 0} active</span></div>

      <div className="surface" style={{ padding: 20, marginBottom: 22 }}>
      <h2>Add a branch</h2>
      <p className="muted">The short code appears in sale numbers and stays fixed after creation.</p>
      <form onSubmit={onCreate} className="form-grid">
        <label>Short code<input value={shortCode} onChange={(e) => setShortCode(e.target.value)} required maxLength={10} /></label>
        <label>Branch name<input value={name} onChange={(e) => setName(e.target.value)} required /></label>
        <label>Address<input value={address} onChange={(e) => setAddress(e.target.value)} /></label>
        <label>Phone<input value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
        <button className="primary" type="submit" disabled={create.isPending}>{create.isPending ? 'Creating…' : 'Create branch'}</button>
        {message && <span className="muted" role="status">{message}</span>}
      </form>
      </div>

      <div className="surface table-wrap"><table>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
            <th style={{ padding: 6 }}>Code</th>
            <th style={{ padding: 6 }}>Name</th>
            <th style={{ padding: 6 }}>Address</th>
            <th style={{ padding: 6 }}>Phone</th>
            <th style={{ padding: 6 }}>Status</th>
            <th style={{ padding: 6 }} />
          </tr>
        </thead>
        <tbody>
          {branches?.map((b) => <BranchRow key={b.id} branch={b} />)}
        </tbody>
      </table></div>
    </section>
  )
}
