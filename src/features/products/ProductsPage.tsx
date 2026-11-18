import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useProductList, useProductMutations, PAGE_SIZE } from './api'
import { useCategories } from '@/features/categories/api'
import { formatMoney } from '@/lib/money'
import { useAuth } from '@/features/auth/AuthContext'
import { productImageUrl } from './image'
import { useBranches } from '@/features/branches/api'
import { describeError } from '@/lib/errors'

type SortKey = 'name' | 'category' | 'selling_price' | 'total_stock' | 'is_active'
type SortDirection = 'asc' | 'desc'

export default function ProductsPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const isOwner = profile?.role === 'OWNER'
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [includeInactive, setIncludeInactive] = useState(false)
  const [page, setPage] = useState(0)
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  const { data, isLoading, error } = useProductList({
    search,
    categoryId: categoryId || undefined,
    includeInactive,
    page,
  })
  const { data: categories } = useCategories()
  const { data: branches } = useBranches()
  const { deactivate } = useProductMutations()

  const totalCount = data?.count ?? 0
  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const sortedItems = [...(data?.items ?? [])].sort((a, b) => {
    // When showing inactive products, keep them together at the top regardless
    // of the selected column sort so active products remain easy to distinguish.
    if (includeInactive && a.is_active !== b.is_active) return a.is_active ? 1 : -1
    const first = sortKey === 'category'
      ? categories?.find((category) => category.id === a.category_id)?.name ?? ''
      : a[sortKey]
    const second = sortKey === 'category'
      ? categories?.find((category) => category.id === b.category_id)?.name ?? ''
      : b[sortKey]
    const comparison = sortKey === 'selling_price' || sortKey === 'total_stock'
      ? Number(first) - Number(second)
      : String(first ?? '').localeCompare(String(second ?? ''), undefined, { numeric: true, sensitivity: 'base' })
    return sortDirection === 'asc' ? comparison : -comparison
  })

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDirection((current) => current === 'asc' ? 'desc' : 'asc')
    else {
      setSortKey(key)
      setSortDirection('asc')
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
      <div className="page-heading"><div><h1>Products</h1><p>Shared catalog and branch availability.</p></div>
        {isOwner && (
          <button className="primary" onClick={() => navigate('/products/new')}>＋ Add product</button>
        )}
      </div>

      <div className="surface toolbar" style={{ marginBottom: 16 }}>
        <input
          placeholder="Search name, SKU, barcode, OEM…"
          aria-label="Search catalog"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(0)
          }}
          style={{ flex: '1 1 260px' }}
        />
        <select
          value={categoryId}
          onChange={(e) => {
            setCategoryId(e.target.value)
            setPage(0)
          }}
        >
          <option value="">All categories</option>
          {categories?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {isOwner && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => {
                setIncludeInactive(e.target.checked)
                setPage(0)
              }}
            />
            Show deactivated
          </label>
        )}
      </div>

      {error && <p className="error-state" role="alert">{describeError(error)}</p>}
      {isLoading && <div className="surface empty-state" aria-busy="true">Loading catalog…</div>}
      {!isLoading && data && data.items.length === 0 && (
        <div className="surface empty-state">No products match your search. {isOwner ? 'Add a product to start building the catalog.' : 'Try a different search.'}</div>
      )}

      {data && data.items.length > 0 && (
        <div className="surface table-wrap"><table>
          <thead>
            <tr>
              {sortHeader('name', 'Product')}{sortHeader('category', 'Category')}{sortHeader('selling_price', 'Price')}{sortHeader('total_stock', 'Total stock')}<th>Stock per branch</th>
              {isOwner && sortHeader('is_active', 'Status')}
            </tr>
          </thead>
          <tbody>
            {sortedItems.map((p) => (
              <tr key={p.id}>
                <td>
                  {p.image_path && (
                    <img
                      src={productImageUrl(p.image_path) ?? ''}
                      alt=""
                      style={{ width: 38, height: 38, objectFit: 'cover', marginRight: 10, verticalAlign: 'middle', borderRadius: 7 }}
                    />
                  )}
                  <Link to={`/products/${p.id}`}>{p.name}</Link>
                  {p.sku && <span className="muted"> · {p.sku}</span>}
                </td>
                <td>{categories?.find((c) => c.id === p.category_id)?.name ?? '—'}</td>
                <td>{formatMoney(p.selling_price)}</td>
                <td>{p.total_stock}</td>
                <td>
                  {(() => {
                    const stockByBranch = branches?.flatMap((b) => {
                      const q = p.branch_stock.find((s) => s.branch_id === b.id)?.quantity
                      return q ? [{ id: b.id, name: b.name, quantity: q }] : []
                    }) ?? []
                    return stockByBranch.length ? stockByBranch.map((stock, index) => (
                      <span className="branch-stock-item" key={stock.id} dir="auto">
                        {index > 0 && <span aria-hidden="true"> · </span>}
                        {stock.name}: <bdi>{stock.quantity}</bdi>
                      </span>
                    )) : '—'
                  })()}
                </td>
                {isOwner && (
                  <td>
                    {p.is_active ? (
                      <button className="danger"
                        onClick={() =>
                          deactivate.mutate({ productId: p.id, isActive: false })
                        }
                      >
                        Deactivate
                      </button>
                    ) : (
                      <button className="success-action"
                        onClick={() =>
                          deactivate.mutate({ productId: p.id, isActive: true })
                        }
                      >
                        Reactivate
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table></div>
      )}

      {pageCount > 1 && (
        <div style={{ marginTop: 14, display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end' }}>
          <button disabled={page === 0} onClick={() => setPage(page - 1)}>
            Previous
          </button>
          <span className="muted">
            Page {page + 1} of {pageCount} ({totalCount} products)
          </span>
          <button disabled={page >= pageCount - 1} onClick={() => setPage(page + 1)}>
            Next
          </button>
        </div>
      )}
    </section>
  )
}
