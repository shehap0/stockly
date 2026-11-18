import { useState } from 'react'
import { useAuth } from '@/features/auth/AuthContext'
import { useBranches } from '@/features/branches/api'
import { useStockOverview, isLowStock } from '@/features/inventory/api'
import { formatMoney } from '@/lib/money'
import { useReportData, startOfMonthISO, todayISO } from './api'
import { describeError } from '@/lib/errors'

export default function ReportsPage() {
  const { profile } = useAuth()
  const { data: branches } = useBranches()
  const isOwner = profile?.role === 'OWNER'

  const [fromDate, setFromDate] = useState(startOfMonthISO())
  const [toDate, setToDate] = useState(todayISO())
  const [branchId, setBranchId] = useState('')
  const effectiveBranch = isOwner ? branchId || null : profile?.branch_id ?? null

  const { data, isLoading, error } = useReportData(fromDate, toDate, effectiveBranch)
  const { data: stock } = useStockOverview()

  const branchName = (id: string) => branches?.find((b) => b.id === id)?.name ?? '—'
  const scopeName = effectiveBranch ? branchName(effectiveBranch) : 'All branches'

  // inventory snapshot for the scoped branch(es)
  const inventoryRows = (stock ?? []).filter((row) =>
    effectiveBranch ? row.branches[effectiveBranch] !== undefined : true,
  )
  const lowRows = inventoryRows
    .map((row) => {
      const ids = effectiveBranch ? [effectiveBranch] : Object.keys(row.branches)
      return ids
        .map((id) => {
          const b = row.branches[id] ?? { quantity: 0, low_stock_threshold: null }
          return {
            productId: row.product_id,
            name: row.name,
            branchId: id,
            quantity: b.quantity,
            threshold: b.low_stock_threshold,
            low: isLowStock(b.quantity, b.low_stock_threshold),
            out: b.quantity === 0,
          }
        })
        .filter((r) => r.low || r.out)
        .flat()
    })
    .flat()

  return (
    <section>
      <h2>Reports</h2>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '12px 0', alignItems: 'center' }}>
        <label>
          From <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </label>
        <label>
          To <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </label>
        {isOwner ? (
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">All branches</option>
            {branches?.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        ) : (
          <span>Branch: <strong>{scopeName}</strong></span>
        )}
      </div>

      {error && <p role="alert" style={{ color: 'crimson' }}>{describeError(error)}</p>}
      {isLoading && <p>Loading report…</p>}

      {data && (
        <>
          <h3>Sales summary — {scopeName}</h3>
          <table style={{ width: '100%', maxWidth: 480 }}>
            <tbody>
              <tr><td>Revenue (completed)</td><td style={{ textAlign: 'right' }}>{formatMoney(data.totals.revenue)}</td></tr>
              <tr><td>Transactions</td><td style={{ textAlign: 'right' }}>{data.totals.transactions}</td></tr>
              <tr><td>Units sold</td><td style={{ textAlign: 'right' }}>{data.totals.units}</td></tr>
              <tr><td>Discounts given</td><td style={{ textAlign: 'right' }}>{formatMoney(data.totals.discounts)}</td></tr>
              <tr><td>Cash payments</td><td style={{ textAlign: 'right' }}>{formatMoney(data.totals.cash)}</td></tr>
              <tr><td>Card payments</td><td style={{ textAlign: 'right' }}>{formatMoney(data.totals.card)}</td></tr>
              <tr><td>InstaPay payments</td><td style={{ textAlign: 'right' }}>{formatMoney(data.totals.instapay)}</td></tr>
              <tr>
                <td>Gross profit</td>
                <td style={{ textAlign: 'right' }}>
                  {data.totals.profit === null
                    ? '—'
                    : formatMoney(data.totals.profit)}
                  {data.totals.unknownCostUnits > 0 && (
                    <span style={{ color: '#b45309' }}> (excludes {data.totals.unknownCostUnits} units with unknown cost)</span>
                  )}
                </td>
              </tr>
              <tr><td>Voided sales</td><td style={{ textAlign: 'right' }}>{data.totals.voidedCount}</td></tr>
            </tbody>
          </table>

          {isOwner && data.byBranch.length > 0 && (
            <>
              <h3>Branch comparison</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
                    <th style={{ padding: 6 }}>Branch</th>
                    <th style={{ padding: 6 }}>Revenue</th>
                    <th style={{ padding: 6 }}>Transactions</th>
                    <th style={{ padding: 6 }}>Units</th>
                    <th style={{ padding: 6 }}>Gross profit</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byBranch.map((b) => (
                    <tr key={b.branchId} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: 6 }}>{b.code}</td>
                      <td style={{ padding: 6 }}>{formatMoney(b.revenue)}</td>
                      <td style={{ padding: 6 }}>{b.transactions}</td>
                      <td style={{ padding: 6 }}>{b.units}</td>
                      <td style={{ padding: 6 }}>{b.profit === null ? '—' : formatMoney(b.profit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <h3>Best-selling products</h3>
          {data.topProducts.length === 0 && <p>No items sold in this period.</p>}
          {data.topProducts.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
                  <th style={{ padding: 6 }}>Product</th>
                  <th style={{ padding: 6 }}>Units</th>
                  <th style={{ padding: 6 }}>Revenue</th>
                  <th style={{ padding: 6 }}>Gross profit</th>
                </tr>
              </thead>
              <tbody>
                {data.topProducts.slice(0, 15).map((p) => (
                  <tr key={p.productId} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: 6 }}>{p.name}</td>
                    <td style={{ padding: 6 }}>{p.quantity}</td>
                    <td style={{ padding: 6 }}>{formatMoney(p.revenue)}</td>
                    <td style={{ padding: 6 }}>{p.profit === null ? '—' : formatMoney(p.profit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <h3>Daily sales</h3>
          {data.daily.length === 0 && <p>No sales in this period.</p>}
          {data.daily.length > 0 && (
            <table style={{ width: '100%', maxWidth: 480, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
                  <th style={{ padding: 6 }}>Date</th>
                  <th style={{ padding: 6 }}>Transactions</th>
                  <th style={{ padding: 6 }}>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {data.daily.map((d) => (
                  <tr key={d.date} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: 6 }}>{d.date}</td>
                    <td style={{ padding: 6 }}>{d.transactions}</td>
                    <td style={{ padding: 6 }}>{formatMoney(d.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      <h3>Inventory alerts — {scopeName}</h3>
      {lowRows.length === 0 && <p>No low or out-of-stock products in scope.</p>}
      {lowRows.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
              <th style={{ padding: 6 }}>Product</th>
              <th style={{ padding: 6 }}>Branch</th>
              <th style={{ padding: 6 }}>Quantity</th>
              <th style={{ padding: 6 }}>Threshold</th>
              <th style={{ padding: 6 }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {lowRows.map((r) => (
              <tr key={`${r.branchId}:${r.productId}`} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: 6 }}>{r.name}</td>
                <td style={{ padding: 6 }}>{branchName(r.branchId)}</td>
                <td style={{ padding: 6 }}>{r.quantity}</td>
                <td style={{ padding: 6 }}>{r.threshold ?? '—'}</td>
                <td style={{ padding: 6, color: r.out ? 'crimson' : '#b45309', fontWeight: 600 }}>
                  {r.out ? 'OUT' : 'LOW'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
