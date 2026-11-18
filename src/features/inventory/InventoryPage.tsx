import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import { useBranches } from '@/features/branches/api'
import { formatMoney } from '@/lib/money'
import { describeError } from '@/lib/errors'
import { useCategories } from '@/features/categories/api'
import {
  useStockOverview,
  useMovements,
  useAddStock,
  useAdjustStock,
  useSetThreshold,
  useInventoryRealtime,
  isLowStock,
  type StockRow,
  type AdjustmentType,
} from './api'

type RowMode = 'add' | 'adjust' | 'threshold'
type StockSortKey = 'name' | 'price' | 'stock' | 'threshold' | 'otherBranches'
type MovementSortKey = 'created_at' | 'product_name' | 'movement_type' | 'quantity_change' | 'new_quantity' | 'reason'
type SortDirection = 'asc' | 'desc'

export default function InventoryPage() {
  const { profile } = useAuth()
  const { data: branches } = useBranches()
  const { data: categories } = useCategories()
  const isOwner = profile?.role === 'OWNER'
  const canAdjust = profile?.role === 'OWNER'

  const [selectedBranch, setSelectedBranch] = useState<string>('')
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [lowOnly, setLowOnly] = useState(false)
  const [stockSortKey, setStockSortKey] = useState<StockSortKey>('name')
  const [stockSortDirection, setStockSortDirection] = useState<SortDirection>('asc')
  const [movementSortKey, setMovementSortKey] = useState<MovementSortKey>('created_at')
  const [movementSortDirection, setMovementSortDirection] = useState<SortDirection>('desc')
  const [expanded, setExpanded] = useState<{ productId: string; mode: RowMode } | null>(null)

  const branchId = isOwner
    ? selectedBranch || branches?.[0]?.id || ''
    : profile?.branch_id ?? ''

  useInventoryRealtime()
  const { data: stock, isLoading, error } = useStockOverview()
  const { data: movements } = useMovements(branchId)
  const addStock = useAddStock()
  const adjustStock = useAdjustStock()
  const setThreshold = useSetThreshold()

  const rows = useMemo(() => {
    if (!stock) return []
    const term = search.trim().toLowerCase()
    return stock.filter((r) => {
      if (term && !`${r.name} ${r.sku ?? ''}`.toLowerCase().includes(term)) return false
      if (categoryId && r.category_id !== categoryId) return false
      if (lowOnly) {
        const b = r.branches[branchId]
        if (!isLowStock(b?.quantity ?? 0, b?.low_stock_threshold)) return false
      }
      return true
    }).sort((a, b) => {
      let comparison: number
      if (stockSortKey === 'name') comparison = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
      else if (stockSortKey === 'price') comparison = a.selling_price - b.selling_price
      else if (stockSortKey === 'stock') comparison = (a.branches[branchId]?.quantity ?? 0) - (b.branches[branchId]?.quantity ?? 0)
      else if (stockSortKey === 'threshold') comparison = (a.branches[branchId]?.low_stock_threshold ?? -1) - (b.branches[branchId]?.low_stock_threshold ?? -1)
      else {
        const totalOther = (row: StockRow) => Object.entries(row.branches).reduce((sum, [id, branch]) => sum + (id === branchId ? 0 : branch.quantity), 0)
        comparison = totalOther(a) - totalOther(b)
      }
      return stockSortDirection === 'asc' ? comparison : -comparison
    })
  }, [stock, search, categoryId, lowOnly, branchId, stockSortKey, stockSortDirection])

  const sortedMovements = useMemo(() => [...(movements ?? [])].sort((a, b) => {
    let comparison: number
    if (movementSortKey === 'created_at') comparison = Date.parse(a.created_at) - Date.parse(b.created_at)
    else if (movementSortKey === 'quantity_change') comparison = a.quantity_change - b.quantity_change
    else if (movementSortKey === 'new_quantity') comparison = a.new_quantity - b.new_quantity
    else comparison = String(a[movementSortKey] ?? '').localeCompare(String(b[movementSortKey] ?? ''), undefined, { numeric: true, sensitivity: 'base' })
    return movementSortDirection === 'asc' ? comparison : -comparison
  }), [movements, movementSortKey, movementSortDirection])

  function toggleStockSort(key: StockSortKey) {
    if (stockSortKey === key) setStockSortDirection((direction) => direction === 'asc' ? 'desc' : 'asc')
    else { setStockSortKey(key); setStockSortDirection('asc') }
  }

  function toggleMovementSort(key: MovementSortKey) {
    if (movementSortKey === key) setMovementSortDirection((direction) => direction === 'asc' ? 'desc' : 'asc')
    else {
      setMovementSortKey(key)
      setMovementSortDirection(key === 'created_at' ? 'desc' : 'asc')
    }
  }

  const branchName = (id: string) => branches?.find((b) => b.id === id)?.name ?? id.slice(0, 4)

  return (
    <section>
      <div className="page-heading"><div><h1>Inventory</h1><p>Track branch quantities and record stock changes.</p></div><span className="status-pill">{rows.length} products</span></div>

      <div className="surface" style={{ marginBottom: 20 }}>
      <div className="toolbar">
        {isOwner ? (
          <label>
            Branch{' '}
            <select value={branchId} onChange={(e) => setSelectedBranch(e.target.value)}>
              {branches?.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span>
            Branch: <strong>{branches?.find((b) => b.id === profile?.branch_id)?.name ?? '—'}</strong>
          </span>
        )}
        <input
          placeholder="Search products…"
          aria-label="Search products"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: '1 1 260px' }}
        />
        <select aria-label="Filter by category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">All categories</option>
          {categories?.filter((category) => category.is_active).map((category) => (
            <option key={category.id} value={category.id}>{category.name}</option>
          ))}
        </select>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} />
          Low stock only
        </label>
        {canAdjust && (
          <Link to="/products">Manage catalog →</Link>
        )}
      </div>
      </div>

      {error && <p className="error-state" role="alert">{describeError(error)}</p>}
      {isLoading && <div className="surface empty-state" aria-busy="true">Loading stock levels…</div>}

      {!isLoading && (
        <div className="surface table-wrap"><table>
          <thead>
            <tr>
              <SortableHeader label="Product" active={stockSortKey === 'name'} direction={stockSortDirection} onClick={() => toggleStockSort('name')} />
              <SortableHeader label="Price" active={stockSortKey === 'price'} direction={stockSortDirection} onClick={() => toggleStockSort('price')} />
              <SortableHeader label="Stock" active={stockSortKey === 'stock'} direction={stockSortDirection} onClick={() => toggleStockSort('stock')} />
              <SortableHeader label="Threshold" active={stockSortKey === 'threshold'} direction={stockSortDirection} onClick={() => toggleStockSort('threshold')} />
              <SortableHeader label="Other branches" active={stockSortKey === 'otherBranches'} direction={stockSortDirection} onClick={() => toggleStockSort('otherBranches')} />
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const b = row.branches[branchId]
              const qty = b?.quantity ?? 0
              const threshold = b?.low_stock_threshold ?? null
              const low = isLowStock(qty, threshold)
              const isExpandedHere = expanded?.productId === row.product_id
              return (
                <Row
                  key={row.product_id}
                  row={row}
                  branchId={branchId}
                  qty={qty}
                  threshold={threshold}
                  low={low}
                  canAdjust={canAdjust}
                  branchName={branchName}
                  expandedMode={isExpandedHere ? expanded!.mode : null}
                  onExpand={(mode) =>
                    setExpanded(isExpandedHere && expanded!.mode === mode ? null : { productId: row.product_id, mode })
                  }
                  addStock={addStock}
                  adjustStock={adjustStock}
                  setThreshold={setThreshold}
                />
              )
            })}
          </tbody>
        </table></div>
      )}
      {!isLoading && rows.length === 0 && <div className="surface empty-state">No products match those filters. Try a different search or show all stock.</div>}

      <div className="section-heading" style={{ marginTop: 30, paddingLeft: 0, paddingRight: 0, border: 0 }}><h2>Recent movements</h2><span className="muted">{branchName(branchId)}</span></div>
      {movements && movements.length === 0 && <div className="surface empty-state">No stock movements have been recorded for this branch.</div>}
      {movements && movements.length > 0 && (
        <div className="surface table-wrap"><table>
          <thead>
            <tr>
              <SortableHeader label="When" active={movementSortKey === 'created_at'} direction={movementSortDirection} onClick={() => toggleMovementSort('created_at')} />
              <SortableHeader label="Product" active={movementSortKey === 'product_name'} direction={movementSortDirection} onClick={() => toggleMovementSort('product_name')} />
              <SortableHeader label="Type" active={movementSortKey === 'movement_type'} direction={movementSortDirection} onClick={() => toggleMovementSort('movement_type')} />
              <SortableHeader label="Change" active={movementSortKey === 'quantity_change'} direction={movementSortDirection} onClick={() => toggleMovementSort('quantity_change')} />
              <SortableHeader label="After" active={movementSortKey === 'new_quantity'} direction={movementSortDirection} onClick={() => toggleMovementSort('new_quantity')} />
              <SortableHeader label="Reason" active={movementSortKey === 'reason'} direction={movementSortDirection} onClick={() => toggleMovementSort('reason')} />
            </tr>
          </thead>
          <tbody>
            {sortedMovements.map((m) => (
              <tr key={m.id}>
                <td>{new Date(m.created_at).toLocaleString()}</td>
                <td>{m.product_name}</td>
                <td>{m.movement_type.replaceAll('_', ' ').toLowerCase()}</td>
                <td><span className={`status-pill ${m.quantity_change < 0 ? 'warning' : 'success'}`}>{m.quantity_change > 0 ? `+${m.quantity_change}` : m.quantity_change}</span></td>
                <td>{m.new_quantity}</td>
                <td>{m.reason ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </section>
  )
}

function SortableHeader({
  label,
  active,
  direction,
  onClick,
}: {
  label: string
  active: boolean
  direction: SortDirection
  onClick: () => void
}) {
  return (
    <th aria-sort={active ? direction === 'asc' ? 'ascending' : 'descending' : 'none'}>
      <button className="table-sort" type="button" onClick={onClick}>
        {label}{active ? (direction === 'asc' ? ' ↑' : ' ↓') : ''}
      </button>
    </th>
  )
}

function Row({
  row,
  branchId,
  qty,
  threshold,
  low,
  canAdjust,
  branchName,
  expandedMode,
  onExpand,
  addStock,
  adjustStock,
  setThreshold,
}: {
  row: StockRow
  branchId: string
  qty: number
  threshold: number | null
  low: boolean
  canAdjust: boolean
  branchName: (id: string) => string
  expandedMode: RowMode | null
  onExpand: (mode: RowMode) => void
  addStock: ReturnType<typeof useAddStock>
  adjustStock: ReturnType<typeof useAdjustStock>
  setThreshold: ReturnType<typeof useSetThreshold>
}) {
  const others = Object.entries(row.branches)
    .filter(([id]) => id !== branchId)
    .map(([id, v]) => `${branchName(id)}: ${v.quantity}`)
    .join(' · ')

  return (
    <>
      <tr className={low ? 'low-stock-row' : undefined}>
        <td style={{ padding: 8 }}>
          <Link to={`/products/${row.product_id}`}>{row.name}</Link>
          {row.sku && <span style={{ color: '#888' }}> · {row.sku}</span>}
          {low && <span className="low-stock-label">LOW</span>}
        </td>
        <td style={{ padding: 8 }}>{formatMoney(row.selling_price)}</td>
        <td style={{ padding: 8, fontWeight: 600 }}>{qty}</td>
        <td style={{ padding: 8 }}>{threshold ?? '—'}</td>
        <td style={{ padding: 8 }}>{others || '—'}</td>
        <td style={{ padding: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button onClick={() => onExpand('add')}>
            {expandedMode === 'add' ? 'Close' : 'Add stock'}
          </button>
          {canAdjust && (
            <button onClick={() => onExpand('adjust')}>
              {expandedMode === 'adjust' ? 'Close' : 'Adjust'}
            </button>
          )}
          {canAdjust && (
            <button onClick={() => onExpand('threshold')}>
              {expandedMode === 'threshold' ? 'Close' : 'Threshold'}
            </button>
          )}
        </td>
      </tr>
      {expandedMode && (
        <tr className="inventory-detail-row">
          <td colSpan={6} style={{ padding: 12 }}>
            {expandedMode === 'add' && (
              <AddStockForm
                onSubmit={async (input) => {
                  await addStock.mutateAsync({ branchId, productId: row.product_id, ...input })
                  onExpand('add')
                }}
              />
            )}
            {expandedMode === 'adjust' && (
              <AdjustStockForm
                onSubmit={async (input) => {
                  await adjustStock.mutateAsync({ branchId, productId: row.product_id, ...input })
                  onExpand('adjust')
                }}
              />
            )}
            {expandedMode === 'threshold' && (
              <ThresholdForm
                current={threshold}
                onSubmit={async (value) => {
                  await setThreshold.mutateAsync({ branchId, productId: row.product_id, threshold: value })
                  onExpand('threshold')
                }}
              />
            )}
          </td>
        </tr>
      )}
    </>
  )
}

function FormError({ error }: { error: unknown }) {
  if (!error) return null
  return (
    <p role="alert" style={{ color: 'crimson', margin: '4px 0' }}>
      {error instanceof Error ? error.message : String(error)}
    </p>
  )
}

function AddStockForm({
  onSubmit,
}: {
  onSubmit: (input: { quantity: number; unitPurchaseCost: number | null; reason: string }) => Promise<void>
}) {
  const [quantity, setQuantity] = useState('')
  const [cost, setCost] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<unknown>(null)
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const qty = Number(quantity)
    if (!Number.isInteger(qty) || qty <= 0) {
      setError(new Error('Quantity must be a positive whole number'))
      return
    }
    const unitCost = cost.trim() === '' ? null : Number(cost)
    if (unitCost !== null && (!Number.isFinite(unitCost) || unitCost < 0)) {
      setError(new Error('Purchase cost must be zero or positive'))
      return
    }
    setSaving(true)
    try {
      await onSubmit({ quantity: qty, unitPurchaseCost: unitCost, reason: reason.trim() })
      setQuantity('')
      setCost('')
      setReason('')
    } catch (err) {
      setError(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <strong>Add stock:</strong>
      <input
        type="number"
        min={1}
        step={1}
        placeholder="Quantity"
        value={quantity}
        onChange={(e) => setQuantity(e.target.value)}
        style={{ width: 100 }}
      />
      <input
        type="number"
        min={0}
        step="0.01"
        placeholder="Unit cost (optional)"
        value={cost}
        onChange={(e) => setCost(e.target.value)}
        style={{ width: 160 }}
      />
      <input
        placeholder="Note (optional, e.g. supplier)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        style={{ flex: '1 1 180px' }}
      />
      <button type="submit" disabled={saving}>
        {saving ? 'Saving…' : 'Add'}
      </button>
      <FormError error={error} />
    </form>
  )
}

function AdjustStockForm({
  onSubmit,
}: {
  onSubmit: (input: { quantityChange: number; movementType: AdjustmentType; reason: string }) => Promise<void>
}) {
  const [change, setChange] = useState('')
  const [type, setType] = useState<AdjustmentType>('MANUAL_ADJUSTMENT')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<unknown>(null)
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const qty = Number(change)
    if (!Number.isInteger(qty) || qty === 0) {
      setError(new Error('Quantity change must be a non-zero whole number'))
      return
    }
    if (reason.trim() === '') {
      setError(new Error('A reason is required for adjustments'))
      return
    }
    setSaving(true)
    try {
      await onSubmit({ quantityChange: qty, movementType: type, reason: reason.trim() })
      setChange('')
      setReason('')
    } catch (err) {
      setError(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <strong>Adjust stock:</strong>
      <input
        type="number"
        step={1}
        placeholder="Change (−3 for loss)"
        value={change}
        onChange={(e) => setChange(e.target.value)}
        style={{ width: 140 }}
      />
      <select value={type} onChange={(e) => setType(e.target.value as AdjustmentType)}>
        <option value="MANUAL_ADJUSTMENT">Manual adjustment</option>
        <option value="DAMAGE">Damage</option>
        <option value="OTHER">Other</option>
        <option value="SALE_RETURN">Sale return</option>
      </select>
      <input
        placeholder="Reason (required)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        style={{ flex: '1 1 200px' }}
      />
      <button type="submit" disabled={saving}>
        {saving ? 'Saving…' : 'Apply'}
      </button>
      <FormError error={error} />
    </form>
  )
}

function ThresholdForm({
  current,
  onSubmit,
}: {
  current: number | null
  onSubmit: (value: number) => Promise<void>
}) {
  const [value, setValue] = useState(current != null ? String(current) : '')
  const [error, setError] = useState<unknown>(null)
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const n = Number(value)
    if (!Number.isInteger(n) || n < 0) {
      setError(new Error('Threshold must be a whole number ≥ 0'))
      return
    }
    setSaving(true)
    try {
      await onSubmit(n)
    } catch (err) {
      setError(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <strong>Low-stock threshold (units):</strong>
      <input
        type="number"
        min={0}
        step={1}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        style={{ width: 100 }}
      />
      <button type="submit" disabled={saving}>
        {saving ? 'Saving…' : 'Save'}
      </button>
      <span style={{ color: '#666' }}>Product is flagged when stock is below this number.</span>
      <FormError error={error} />
    </form>
  )
}
