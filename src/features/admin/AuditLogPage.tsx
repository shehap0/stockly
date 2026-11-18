import { useState } from 'react'
import { useAuditLogs } from './api'
import { describeError } from '@/lib/errors'

function shortJson(value: unknown): string {
  if (value === null || value === undefined) return '—'
  const text = JSON.stringify(value)
  return text.length > 120 ? `${text.slice(0, 120)}…` : text
}

export default function AuditLogPage() {
  const [action, setAction] = useState('')
  const [entity, setEntity] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [entityFilter, setEntityFilter] = useState('')
  const { data, isLoading, error } = useAuditLogs(actionFilter, entityFilter)

  return (
    <section>
      <h2>Audit log</h2>
      <p style={{ color: '#666' }}>Last 200 entries. Audit records are immutable.</p>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          setActionFilter(action)
          setEntityFilter(entity)
        }}
        style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}
      >
        <label>Action contains<br /><input value={action} onChange={(e) => setAction(e.target.value)} placeholder="PRODUCT_PRICE_CHANGE" /></label>
        <label>Entity contains<br /><input value={entity} onChange={(e) => setEntity(e.target.value)} placeholder="product" /></label>
        <button type="submit" style={{ alignSelf: 'end' }}>Filter</button>
        {(actionFilter || entityFilter) && (
          <button
            type="button"
            style={{ alignSelf: 'end' }}
            onClick={() => {
              setAction('')
              setEntity('')
              setActionFilter('')
              setEntityFilter('')
            }}
          >
            Clear
          </button>
        )}
      </form>

      {isLoading && <p>Loading audit log…</p>}
      {error && <p role="alert" style={{ color: 'crimson' }}>{describeError(error)}</p>}
      {data && data.length === 0 && <p>No matching entries.</p>}
      {data && data.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9em' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
              <th style={{ padding: 6 }}>When</th>
              <th style={{ padding: 6 }}>Action</th>
              <th style={{ padding: 6 }}>Entity</th>
              <th style={{ padding: 6 }}>By</th>
              <th style={{ padding: 6 }}>Old</th>
              <th style={{ padding: 6 }}>New</th>
            </tr>
          </thead>
          <tbody>
            {data.map((log) => (
              <tr key={log.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: 6, whiteSpace: 'nowrap' }}>{new Date(log.created_at).toLocaleString()}</td>
                <td style={{ padding: 6 }}>{log.action}</td>
                <td style={{ padding: 6 }}>{log.entity_type}{log.entity_id ? ` · ${log.entity_id.slice(0, 8)}` : ''}</td>
                <td style={{ padding: 6 }}>{log.user_id ? log.user_id.slice(0, 8) : '—'}</td>
                <td style={{ padding: 6 }} title={log.old_values ? JSON.stringify(log.old_values) : undefined}>{shortJson(log.old_values)}</td>
                <td style={{ padding: 6 }} title={log.new_values ? JSON.stringify(log.new_values) : undefined}>{shortJson(log.new_values)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
