import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { customerSchema, useCustomers, useCustomerMutations, type CustomerFormValues } from '@/features/sales/api'
import type { Customer } from '@/features/sales/api'
import { describeError } from '@/lib/errors'

export default function CustomersPage() {
  const { data: customers, isLoading, error } = useCustomers()
  const { create, update } = useCustomerMutations()
  const [editing, setEditing] = useState<Customer | null>(null)
  const [search, setSearch] = useState('')
  const [serverError, setServerError] = useState<string | null>(null)

  const form = useForm<CustomerFormValues>({
    resolver: zodResolver(customerSchema),
    defaultValues: { full_name: '', phone: '', notes: '' },
  })

  const filtered = (customers ?? []).filter((c) => {
    const term = search.trim().toLowerCase()
    if (!term) return true
    return `${c.name} ${c.phone ?? ''}`.toLowerCase().includes(term)
  })

  function startEdit(c: Customer | null) {
    setEditing(c)
    setServerError(null)
    form.reset({ full_name: c?.name ?? '', phone: c?.phone ?? '', notes: c?.notes ?? '' })
  }

  async function onSubmit(values: CustomerFormValues) {
    setServerError(null)
    try {
      if (editing) await update.mutateAsync({ id: editing.id, values })
      else await create.mutateAsync(values)
      startEdit(null)
    } catch (err) {
      setServerError(describeError(err))
    }
  }

  return (
    <section>
      <h2>Customers</h2>

      <div style={{ display: 'flex', gap: 8, margin: '12px 0', flexWrap: 'wrap' }}>
        <input
          placeholder="Search name or phone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: '1 1 220px' }}
        />
        <button onClick={() => startEdit(null)}>+ New customer</button>
      </div>

      <form
        onSubmit={form.handleSubmit(onSubmit)}
        style={{ padding: 12, border: '1px solid #ddd', marginBottom: 16, maxWidth: 520 }}
      >
        <h3 style={{ marginTop: 0 }}>{editing ? `Edit ${editing.name}` : 'New customer'}</h3>
        <div style={{ marginBottom: 8 }}>
          <label htmlFor="full_name">Name *</label>
          <input id="full_name" {...form.register('full_name')} style={{ width: '100%' }} />
          {form.formState.errors.full_name && (
            <span role="alert" style={{ color: 'crimson' }}>
              {form.formState.errors.full_name.message}
            </span>
          )}
        </div>
        <div style={{ marginBottom: 8 }}>
          <label htmlFor="phone">Phone</label>
          <input id="phone" {...form.register('phone')} style={{ width: '100%' }} />
          {form.formState.errors.phone && (
            <span role="alert" style={{ color: 'crimson' }}>
              {form.formState.errors.phone.message}
            </span>
          )}
        </div>
        <div style={{ marginBottom: 8 }}>
          <label htmlFor="notes">Notes</label>
          <input id="notes" {...form.register('notes')} style={{ width: '100%' }} />
        </div>
        {serverError && <p role="alert" style={{ color: 'crimson' }}>{serverError}</p>}
        <button type="submit" disabled={form.formState.isSubmitting}>
          {editing ? 'Save changes' : 'Create customer'}
        </button>{' '}
        {editing && <button type="button" onClick={() => startEdit(null)}>Cancel</button>}
      </form>

      {error && <p role="alert" style={{ color: 'crimson' }}>{describeError(error)}</p>}
      {isLoading && <p>Loading customers…</p>}
      {!isLoading && filtered.length === 0 && <p>No customers found.</p>}

      {filtered.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
              <th style={{ padding: 8 }}>Name</th>
              <th style={{ padding: 8 }}>Phone</th>
              <th style={{ padding: 8 }}>Notes</th>
              <th style={{ padding: 8 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: 8 }}>{c.name}</td>
                <td style={{ padding: 8 }}>{c.phone ?? '—'}</td>
                <td style={{ padding: 8 }}>{c.notes ?? '—'}</td>
                <td style={{ padding: 8 }}>
                  <button onClick={() => startEdit(c)}>Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
