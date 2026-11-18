import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import { useBranches } from '@/features/branches/api'
import { formatMoney } from '@/lib/money'
import { useSalesList } from './api'
import { describeError } from '@/lib/errors'

type SortKey = 'sale_number' | 'created_at' | 'branch_name' | 'customer_name' | 'item_count' | 'total_amount' | 'payment_method' | 'status'
type SortDirection = 'asc' | 'desc'

export default function SalesPage() {
  const { profile } = useAuth()
  const { data: branches } = useBranches()
  const isOwner = profile?.role === 'OWNER'
  const [branchId, setBranchId] = useState('')
  const [status, setStatus] = useState<'ALL' | 'COMPLETED' | 'VOIDED'>('ALL')
  const [sortKey, setSortKey] = useState<SortKey>('created_at')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  const { data: sales, isLoading, error } = useSalesList(isOwner ? branchId || null : null)

  const filtered = [...(sales ?? [])]
    .filter((s) => status === 'ALL' || s.status === status)
    .sort((a, b) => {
      const first = a[sortKey]
      const second = b[sortKey]
      const comparison = sortKey === 'item_count' || sortKey === 'total_amount'
        ? Number(first) - Number(second)
        : String(first ?? '').localeCompare(String(second ?? ''), undefined, { numeric: true, sensitivity: 'base' })
      return sortDirection === 'asc' ? comparison : -comparison
    })

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDirection((current) => current === 'asc' ? 'desc' : 'asc')
    else {
      setSortKey(key)
      setSortDirection(key === 'created_at' ? 'desc' : 'asc')
    }
  }

  function sortHeader(key: SortKey, label: string) {
    const active = sortKey === key
    return (
      <th aria-sort={active ? sortDirection === 'asc' ? 'ascending' : 'descending' : 'none'}>
        <button className="table-sort" type="button" onClick={() => toggleSort(key)}>
          {label}{active ? (sortDirection === 'asc' ? ' ↑' : ' ↓') : ''}
        </button>
      </th>
    )
  }

  return (
    <section>
      <div className="page-heading"><div><h1>Sales history</h1><p>Review and sort completed and voided transactions.</p></div></div>

      <div className="surface toolbar" style={{ marginBottom: 16 }}>
        {isOwner && (
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">All branches</option>
            {branches?.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        )}
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="ALL">All statuses</option>
          <option value="COMPLETED">Completed</option>
          <option value="VOIDED">Voided</option>
        </select>
      </div>

      {error && <p className="error-state" role="alert">{describeError(error)}</p>}
      {isLoading && <div className="surface empty-state" aria-busy="true">Loading sales…</div>}
      {!isLoading && filtered.length === 0 && <div className="surface empty-state">No sales match these filters.</div>}

      {filtered.length > 0 && (
        <div className="surface table-wrap"><table>
          <thead>
            <tr>
              {sortHeader('sale_number', 'Sale #')}
              {sortHeader('created_at', 'When')}
              {sortHeader('branch_name', 'Branch')}
              {sortHeader('customer_name', 'Customer')}
              {sortHeader('item_count', 'Items')}
              {sortHeader('total_amount', 'Total')}
              {sortHeader('payment_method', 'Payment')}
              {sortHeader('status', 'Status')}
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.id}>
                <td><Link to={`/sales/${s.id}`}>{s.sale_number}</Link></td><td>{new Date(s.created_at).toLocaleString()}</td><td>{s.branch_name}</td><td>{s.customer_name ?? 'Walk-in'}</td><td>{s.item_count}</td><td>{formatMoney(s.total_amount)}</td><td>{s.payment_method}</td>
                <td><span className={`status-pill ${s.status === 'VOIDED' ? 'warning' : 'success'}`}>{s.status === 'VOIDED' ? 'Voided' : 'Completed'}</span></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </section>
  )
}
