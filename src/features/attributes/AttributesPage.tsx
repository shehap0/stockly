import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  useAttributeDefinitions,
  useAttributeDefMutations,
  attributeDefSchema,
  type AttributeDefValues,
  type AttributeDataType,
} from './api'
import { useAuth } from '@/features/auth/AuthContext'
import { describeError } from '@/lib/errors'

const DATA_TYPES: AttributeDataType[] = ['TEXT', 'NUMBER', 'BOOLEAN', 'DROPDOWN', 'DATE']

export default function AttributesPage() {
  const { profile } = useAuth()
  const { data: defs } = useAttributeDefinitions()
  const { create, update, deactivate } = useAttributeDefMutations()
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  if (profile?.role !== 'OWNER') {
    return <p>Only the owner can manage product attributes.</p>
  }

  return (
    <section>
      <p>
        <Link to="/admin">← Admin</Link>
      </p>
      <h2>Product attributes</h2>
      <p style={{ color: '#666' }}>
        Custom per-product fields. Deactivating a definition freezes existing values —
        products keep them read-only; only reactivation unblocks changes.
      </p>

      {error && <p role="alert" style={{ color: 'crimson' }}>{error}</p>}
      {message && <p style={{ color: 'green' }}>{message}</p>}

      <AttributeForm
        key={editingId ?? 'new'}
        editing={
          editingId
            ? defs?.find((d) => d.id === editingId) ?? null
            : null
        }
        onCancel={() => setEditingId(null)}
        onSubmit={async (values: AttributeDefValues) => {
          setError(null)
          setMessage(null)
          try {
            if (editingId) {
              await update.mutateAsync({ id: editingId, values })
              setMessage('Attribute updated.')
            } else {
              await create.mutateAsync(values)
              setMessage('Attribute created.')
            }
            setEditingId(null)
          } catch (err) {
            setError(describeError(err))
          }
        }}
      />

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
            <th style={{ padding: 8 }}>Name</th>
            <th style={{ padding: 8 }}>Type</th>
            <th style={{ padding: 8 }}>Required</th>
            <th style={{ padding: 8 }}>Options</th>
            <th style={{ padding: 8 }}>Order</th>
            <th style={{ padding: 8 }}>Status</th>
            <th style={{ padding: 8 }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {defs?.map((d) => (
            <tr key={d.id} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: 8 }}>{d.name}</td>
              <td style={{ padding: 8 }}>{d.data_type}</td>
              <td style={{ padding: 8 }}>{d.is_required ? 'Yes' : 'No'}</td>
              <td style={{ padding: 8 }}>{(d.options ?? []).join(', ') || '—'}</td>
              <td style={{ padding: 8 }}>{d.display_order}</td>
              <td style={{ padding: 8 }}>{d.is_active ? 'Active' : 'Inactive'}</td>
              <td style={{ padding: 8, display: 'flex', gap: 6 }}>
                <button onClick={() => setEditingId(d.id)}>Edit</button>
                <button
                  onClick={async () => {
                    setError(null)
                    setMessage(null)
                    try {
                      await deactivate.mutateAsync({ id: d.id, isActive: !d.is_active })
                      setMessage(d.is_active ? 'Attribute deactivated.' : 'Attribute activated.')
                    } catch (err) {
                      setError(describeError(err))
                    }
                  }}
                >
                  {d.is_active ? 'Deactivate' : 'Activate'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {defs?.length === 0 && <p>No attribute definitions yet.</p>}
    </section>
  )
}

function AttributeForm({
  editing,
  onSubmit,
  onCancel,
}: {
  editing: { name: string; data_type: AttributeDataType; is_required: boolean; is_active: boolean; options: string[] | null; display_order: number } | null
  onSubmit: (values: AttributeDefValues) => Promise<void>
  onCancel: () => void
}) {
  const [name, setName] = useState(editing?.name ?? '')
  const [dataType, setDataType] = useState<AttributeDataType>(editing?.data_type ?? 'TEXT')
  const [isRequired, setIsRequired] = useState(editing?.is_required ?? false)
  const [isActive, setIsActive] = useState(editing?.is_active ?? true)
  const [displayOrder, setDisplayOrder] = useState(String(editing?.display_order ?? 0))
  const [optionsText, setOptionsText] = useState((editing?.options ?? []).join(', '))
  const [validationError, setValidationError] = useState<string | null>(null)

  async function handleSubmit() {
    setValidationError(null)
    const options =
      dataType === 'DROPDOWN'
        ? optionsText.split(',').map((s) => s.trim()).filter(Boolean)
        : []
    const parsed = attributeDefSchema.safeParse({
      name,
      data_type: dataType,
      is_required: isRequired,
      is_active: isActive,
      options,
      display_order: displayOrder,
    })
    if (!parsed.success) {
      setValidationError(parsed.error.issues[0]?.message ?? 'Invalid values')
      return
    }
    if (dataType === 'DROPDOWN' && options.length === 0) {
      setValidationError('Dropdown attributes need at least one option')
      return
    }
    await onSubmit(parsed.data)
  }

  return (
    <fieldset style={{ margin: '12px 0', padding: 12 }}>
      <legend>{editing ? 'Edit attribute' : 'New attribute'}</legend>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <input
          placeholder="Attribute name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <select
          value={dataType}
          onChange={(e) => setDataType(e.target.value as AttributeDataType)}
          disabled={Boolean(editing)}
          title={editing ? 'Type cannot change after creation' : undefined}
        >
          {DATA_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <input
          type="number"
          placeholder="Display order"
          value={displayOrder}
          onChange={(e) => setDisplayOrder(e.target.value)}
          style={{ width: 120 }}
        />
        {dataType === 'DROPDOWN' && (
          <input
            placeholder="Options (comma-separated)"
            value={optionsText}
            onChange={(e) => setOptionsText(e.target.value)}
            style={{ flex: '1 1 200px' }}
          />
        )}
      </div>
      <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={isRequired} onChange={(e) => setIsRequired(e.target.checked)} />
          Required
        </label>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Active
        </label>
      </div>
      {validationError && <p role="alert" style={{ color: 'crimson' }}>{validationError}</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={handleSubmit}>{editing ? 'Save' : 'Create'}</button>
        {editing && <button onClick={onCancel}>Cancel</button>}
      </div>
    </fieldset>
  )
}
