import { Link } from 'react-router-dom'
import { useBranches } from '@/features/branches/api'
import { formatMoney } from '@/lib/money'
import { useDashboardData } from '@/features/reports/api'
import { describeError } from '@/lib/errors'

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="surface metric">
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
      {hint && <div className="metric-hint">{hint}</div>}
    </div>
  )
}

export default function DashboardPage() {
  const { data, isLoading, error } = useDashboardData()
  const { data: branches } = useBranches()
  const branchName = (id: string) => branches?.find((b) => b.id === id)?.name ?? '—'

  if (isLoading) return <section aria-busy="true"><div className="page-heading"><div><h1>Dashboard</h1><p>Business activity across your branches.</p></div></div><div className="metric-grid">{Array.from({ length: 4 }, (_, i) => <div className="surface metric" key={i}><div className="metric-label">Loading…</div><div className="metric-value">—</div></div>)}</div></section>
  if (error) return <div className="error-state" role="alert">{describeError(error)}</div>
  if (!data) return null

  return (
    <section>
      <div className="page-heading"><div><h1>Dashboard</h1><p>Business activity across your branches.</p></div><Link to="/sales/new"><button className="primary">＋ Record a sale</button></Link></div>

      <div className="metric-grid">
        <Metric label="Sales today" value={formatMoney(data.todayRevenue)} hint={`${data.todayTransactions} transactions`} />
        <Metric label="Sales this week" value={formatMoney(data.weekRevenue)} />
        <Metric label="Sales this month" value={formatMoney(data.monthRevenue)} hint={`${data.monthTransactions} transactions`} />
        <Metric
          label="Gross profit (month)"
          value={data.monthProfit === null ? '—' : formatMoney(data.monthProfit)}
          hint="From purchase-cost snapshots"
        />
      </div>

      <div className="metric-grid">
        <Metric label="Active products" value={String(data.totalProducts)} />
        <Metric label="Units in stock" value={String(data.totalUnits)} />
        <Metric label="Estimated inventory value" value={formatMoney(data.inventoryValue)} hint="At purchase cost" />
        <Metric label="Low stock" value={String(data.lowStock.length)} hint="At or below threshold" />
      </div>

      <div className="surface" style={{ marginBottom: 20 }}>
      <div className="section-heading"><h2>Stock needing attention</h2><span className="status-pill warning">{data.lowStock.length + data.outOfStock.length} items</span></div>
      {data.lowStock.length === 0 && data.outOfStock.length === 0 && <div className="empty-state">Stock levels are healthy across your branches.</div>}
      {data.lowStock.length > 0 && (
        <div className="table-wrap"><table>
          <thead>
            <tr>
              <th>Product</th>
              <th>Branch</th>
              <th>Quantity</th>
              <th>Threshold</th>
            </tr>
          </thead>
          <tbody>
            {data.lowStock.slice(0, 10).map((row) => (
              <tr key={`${row.branchId}:${row.productId}`}>
                <td>
                  <Link to={`/products/${row.productId}`}>{row.name}</Link>
                </td>
                <td>{branchName(row.branchId)}</td>
                <td><span className="status-pill warning">{row.quantity} left</span></td>
                <td>{row.threshold}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
      {data.outOfStock.length > 0 && <div className="section-heading"><h3>Out of stock</h3><span className="status-pill warning">{data.outOfStock.length} products</span></div>}
      {data.outOfStock.length > 0 && <div className="table-wrap"><table><thead><tr><th>Product</th><th>Branch</th><th>Status</th></tr></thead><tbody>{data.outOfStock.slice(0, 8).map((row) => <tr key={`${row.branchId}:${row.productId}`}><td><Link to={`/products/${row.productId}`}>{row.name}</Link></td><td>{branchName(row.branchId)}</td><td><span className="status-pill warning">Out of stock</span></td></tr>)}</tbody></table></div>}
      </div>
      <p><Link to="/reports">View reports →</Link></p>
    </section>
  )
}
