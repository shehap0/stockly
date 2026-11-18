import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import { formatMoney } from '@/lib/money'
import { useSaleDetail, useVoidSale } from './api'
import { describeError } from '@/lib/errors'

export default function SaleDetailPage() {
  const { saleId = '' } = useParams<{ saleId: string }>()
  const { profile } = useAuth()
  const { data, isLoading, error } = useSaleDetail(saleId)
  const voidSale = useVoidSale()
  const [reason, setReason] = useState('')
  const [showVoid, setShowVoid] = useState(false)
  const [voidError, setVoidError] = useState<string | null>(null)

  if (isLoading) return <p>Loading sale…</p>
  if (error) return <p role="alert" style={{ color: 'crimson' }}>{describeError(error)}</p>
  if (!data) return <p>Sale not found or you do not have access to it.</p>

  const { sale, items } = data
  const canVoid = sale.status === 'COMPLETED' && profile?.role === 'OWNER'

  async function handleVoid() {
    setVoidError(null)
    if (!reason.trim()) {
      setVoidError('A reason is required to void a sale')
      return
    }
    try {
      await voidSale.mutateAsync({ saleId: sale.id, reason: reason.trim() })
      setShowVoid(false)
    } catch (err) {
      setVoidError(describeError(err))
    }
  }

  return (
    <section style={{ maxWidth: 760 }}>
      <p>
        <Link to="/sales">← Sales</Link>
      </p>
      <h2>
        Sale {sale.sale_number}{' '}
        <span style={{ color: sale.status === 'VOIDED' ? 'crimson' : 'green', fontSize: '0.7em' }}>
          {sale.status}
        </span>
      </h2>
      <p style={{ color: '#666' }}>
        {new Date(sale.created_at).toLocaleString()} · {sale.payment_method}
      </p>
      {(sale as unknown as { branches?: { name: string } }).branches && (
        <p>Branch: {(sale as unknown as { branches: { name: string } }).branches.name}</p>
      )}
      {(sale as unknown as { customers?: { name: string; phone: string | null } }).customers && (
        <p>
          Customer: {(sale as unknown as { customers: { name: string } }).customers.name}
          {(sale as unknown as { customers: { phone: string | null } }).customers.phone
            ? ` · ${(sale as unknown as { customers: { phone: string | null } }).customers.phone}`
            : ''}
        </p>
      )}
      {sale.status === 'VOIDED' && sale.void_reason && (
        <p style={{ color: 'crimson' }}>Voided: {sale.void_reason}</p>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12 }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
            <th style={{ padding: 6 }}>Item</th>
            <th style={{ padding: 6 }}>Unit price</th>
            <th style={{ padding: 6 }}>Qty</th>
            <th style={{ padding: 6 }}>Line total</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: 6 }}>{item.product_name_snapshot}</td>
              <td style={{ padding: 6 }}>{formatMoney(item.unit_selling_price)}</td>
              <td style={{ padding: 6 }}>{item.quantity}</td>
              <td style={{ padding: 6 }}>{formatMoney(item.line_total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <table style={{ marginTop: 12, width: '100%', maxWidth: 360, marginLeft: 'auto' }}>
        <tbody>
          <tr>
            <td>Subtotal</td>
            <td style={{ textAlign: 'right' }}>{formatMoney(sale.subtotal)}</td>
          </tr>
          <tr>
            <td>
              Discount
              {sale.discount_type === 'PERCENT' ? ` (${sale.discount_value}%)` : ''}
            </td>
            <td style={{ textAlign: 'right' }}>
              {Number(sale.discount_amount) > 0 ? `− ${formatMoney(sale.discount_amount)}` : '—'}
            </td>
          </tr>
          <tr style={{ fontWeight: 700, fontSize: '1.1em' }}>
            <td>Total</td>
            <td style={{ textAlign: 'right' }}>{formatMoney(sale.total_amount)}</td>
          </tr>
        </tbody>
      </table>

      {canVoid && !showVoid && (
        <button onClick={() => setShowVoid(true)} style={{ marginTop: 16 }}>
          Void this sale
        </button>
      )}

      {showVoid && (
        <div style={{ marginTop: 16, padding: 12, border: '1px solid #f0c0c0', background: '#fff5f5' }}>
          <p>
            Voiding restores the sold quantities to stock. The sale stays visible with a
            VOIDED status. This cannot be undone.
          </p>
          <input
            placeholder="Reason (required)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            style={{ width: '60%', marginRight: 8 }}
          />
          <button onClick={handleVoid} disabled={voidSale.isPending}>
            {voidSale.isPending ? 'Voiding…' : 'Confirm void'}
          </button>{' '}
          <button
            onClick={() => {
              setShowVoid(false)
              setVoidError(null)
            }}
          >
            Cancel
          </button>
          {voidError && <p role="alert" style={{ color: 'crimson' }}>{voidError}</p>}
        </div>
      )}
    </section>
  )
}
