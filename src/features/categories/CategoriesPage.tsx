import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useCategories, useCategoryMutations } from './api'
import { useAuth } from '@/features/auth/AuthContext'
import { describeError } from '@/lib/errors'

export default function CategoriesPage() {
  const { profile } = useAuth()
  const { data: categories } = useCategories()
  const { create, update, remove } = useCategoryMutations()
  const [newName, setNewName] = useState('')
  const [parentId, setParentId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  if (profile?.role !== 'OWNER') {
    return <p>Only the owner can manage categories.</p>
  }

  async function handleCreate() {
    setError(null)
    setMessage(null)
    try {
      await create.mutateAsync({
        name: newName.trim(),
        parent_category_id: parentId || null,
      })
      setNewName('')
      setParentId('')
      setMessage('Category created.')
    } catch (err) {
      setError(describeError(err))
    }
  }

  async function handleToggleActive(id: string, isActive: boolean) {
    setError(null)
    setMessage(null)
    try {
      await update.mutateAsync({ id, is_active: isActive })
      setMessage(isActive ? 'Category activated.' : 'Category deactivated.')
    } catch (err) {
      setError(describeError(err))
    }
  }

  async function handleDelete(id: string) {
    setError(null)
    setMessage(null)
    try {
      await remove.mutateAsync(id)
      setMessage('Category deleted.')
    } catch (err) {
      setError(describeError(err))
    }
  }

  return (
    <section>
      <p>
        <Link to="/admin">← Admin</Link>
      </p>
      <h2>Product categories</h2>

      <div className="surface category-create-form" style={{ display: 'flex', gap: 8, margin: '12px 0', flexWrap: 'wrap', padding: 16 }}>
        <input
          placeholder="New category name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <select className="category-parent-select" value={parentId} onChange={(e) => setParentId(e.target.value)}>
          <option value="">No parent (top-level)</option>
          {categories?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button onClick={handleCreate} disabled={!newName.trim() || create.isPending}>
          Add category
        </button>
      </div>

      {error && <p role="alert" style={{ color: 'crimson' }}>{error}</p>}
      {message && <p style={{ color: 'green' }}>{message}</p>}

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
            <th style={{ padding: 8 }}>Name</th>
            <th style={{ padding: 8 }}>Parent</th>
            <th style={{ padding: 8 }}>Status</th>
            <th style={{ padding: 8 }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {categories?.map((c) => (
            <tr key={c.id} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: 8 }}>{c.name}</td>
              <td style={{ padding: 8 }}>
                {categories.find((x) => x.id === c.parent_category_id)?.name ?? '—'}
              </td>
              <td style={{ padding: 8 }}>{c.is_active ? 'Active' : 'Inactive'}</td>
              <td style={{ padding: 8, display: 'flex', gap: 6 }}>
                <button className={c.is_active ? 'danger' : 'success-action'} onClick={() => handleToggleActive(c.id, !c.is_active)}>
                  {c.is_active ? 'Deactivate' : 'Activate'}
                </button>
                <button className="danger" onClick={() => handleDelete(c.id)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {categories?.length === 0 && <p>No categories yet.</p>}
    </section>
  )
}
