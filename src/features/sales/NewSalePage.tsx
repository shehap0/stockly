import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import { useBranches } from '@/features/branches/api'
import { formatMoney } from '@/lib/money'
import { useCreateSale, useCustomers, useCustomerMutations, useSellableProducts } from './api'
import type { DiscountType } from './api'
import { describeError } from '@/lib/errors'
import { usePreferences } from '@/lib/usePreferences'
import { useCategories } from '@/features/categories/api'

type CartLine = {
  productId: string
  name: string
  sku: string | null
  unitPrice: number
  available: number
  quantity: number
}

export default function NewSalePage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { data: branches } = useBranches()
  const { data: categories } = useCategories()
  const { language } = usePreferences()
  const isOwner = profile?.role === 'OWNER'

  const [branchId, setBranchId] = useState('')
  const effectiveBranchId = isOwner ? branchId || branches?.[0]?.id || '' : profile?.branch_id ?? ''

  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [cart, setCart] = useState<CartLine[]>([])
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CARD' | 'INSTAPAY'>('CASH')
  const [discountType, setDiscountType] = useState<DiscountType>('NONE')
  const [discountValue, setDiscountValue] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [quickName, setQuickName] = useState('')
  const [quickPhone, setQuickPhone] = useState('')
  const [showQuickCustomer, setShowQuickCustomer] = useState(false)

  const idempotencyKey = useRef(crypto.randomUUID())
  const { data: products, isLoading: productsLoading } = useSellableProducts(effectiveBranchId, search, categoryId)
  const { data: customers } = useCustomers()
  const { create: createCustomer } = useCustomerMutations()
  const createSale = useCreateSale()

  const subtotal = useMemo(
    () => cart.reduce((acc, l) => acc + l.unitPrice * l.quantity, 0),
    [cart],
  )
  const discountAmount = useMemo(() => {
    const v = Number(discountValue)
    if (discountType === 'NONE' || !Number.isFinite(v) || v <= 0) return 0
    if (discountType === 'PERCENT') return Math.round(subtotal * v) / 100
    return Math.min(v, subtotal)
  }, [discountType, discountValue, subtotal])
  const total = subtotal - discountAmount

  function resetKey() {
    idempotencyKey.current = crypto.randomUUID()
  }

  function addToCart(p: { id: string; name: string; sku: string | null; selling_price: number; available: number }) {
    setError(null)
    resetKey()
    setCart((prev) => {
      const existing = prev.find((l) => l.productId === p.id)
      if (existing) {
        if (existing.quantity >= existing.available) {
          setError(`Only ${existing.available} in stock for "${existing.name}"`)
          return prev
        }
        return prev.map((l) =>
          l.productId === p.id ? { ...l, quantity: l.quantity + 1 } : l,
        )
      }
      if (p.available <= 0) {
        setError(`"${p.name}" is out of stock at this branch`)
        return prev
      }
      return [
        ...prev,
        {
          productId: p.id,
          name: p.name,
          sku: p.sku,
          unitPrice: p.selling_price,
          available: p.available,
          quantity: 1,
        },
      ]
    })
  }

  function setQty(productId: string, qty: number) {
    resetKey()
    setCart((prev) =>
      prev
        .map((l) =>
          l.productId === productId
            ? { ...l, quantity: Math.max(0, Math.min(qty, l.available)) }
            : l,
        )
        .filter((l) => l.quantity > 0),
    )
  }

  async function handleQuickCustomer() {
    setError(null)
    try {
      const created = await createCustomer.mutateAsync({
        full_name: quickName,
        phone: quickPhone,
      })
      setCustomerId(created.id)
      resetKey()
      setShowQuickCustomer(false)
      setQuickName('')
      setQuickPhone('')
    } catch (err) {
      setError(describeError(err))
    }
  }

  async function submit() {
    setError(null)
    if (cart.length === 0) {
      setError('Add at least one product to the sale')
      return
    }
    if (!effectiveBranchId) {
      setError('Select a branch')
      return
    }
    const value = discountType === 'NONE' ? 0 : Number(discountValue)
    if (discountType !== 'NONE' && (!Number.isFinite(value) || value <= 0)) {
      setError('Enter a discount value or set discount type to none')
      return
    }
    try {
      const payload = await createSale.mutateAsync({
        branchId: effectiveBranchId,
        items: cart.map((l) => ({ product_id: l.productId, quantity: l.quantity })),
        paymentMethod,
        discountType,
        discountValue: value,
        customerId: customerId || null,
        idempotencyKey: idempotencyKey.current,
      })
      setCart([])
      resetKey()
      navigate(`/sales/${payload.sale.id}`)
    } catch (err) {
      setError(describeError(err))
    }
  }

  return (
    <section>
      <p>
        <Link to="/sales">← Sales</Link>
      </p>
      <h2>New sale</h2>

      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 380px', minWidth: 320 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            {isOwner ? (
              <label>
                Branch{' '}
                <select value={effectiveBranchId} onChange={(e) => { setBranchId(e.target.value); setCart([]) }}>
                  {branches?.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </label>
            ) : (
              <span>
                Branch: <strong>{branches?.find((b) => b.id === effectiveBranchId)?.name ?? '—'}</strong>
              </span>
            )}
          </div>

          <div className="sale-search-controls">
            <input
              placeholder="Search by name, category, SKU, or barcode…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select aria-label="Filter by category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">All categories</option>
              {categories?.filter((category) => category.is_active).map((category) => (
                <option value={category.id} key={category.id}>{category.name}</option>
              ))}
            </select>
          </div>
          {productsLoading && <p>Searching…</p>}
          {products && (
            <div style={{ maxHeight: 550, overflowY: 'auto', border: '1px solid #eee' }}>
              {products.length === 0 && <p style={{ padding: 8 }}>No matching products with stock at this branch.</p>}
              {products.map((p) => (
                <div key={p.id} className="sale-product-row">
                  <div className="sale-product-meta">
                    <strong dir="auto">{p.name}</strong>
                    {p.sku && <span className="sale-product-sku" dir="ltr">{p.sku}</span>}
                    <span
                      className={`sale-product-availability${p.available <= 0 ? ' out-of-stock' : ''}`}
                      dir={language === 'ar' ? 'rtl' : 'ltr'}
                    >
                      {p.available <= 0
                        ? (language === 'ar' ? 'نفد المخزون' : 'Out of stock')
                        : language === 'ar'
                          ? <><span>متوفر</span><bdi>{p.available}</bdi></>
                          : <><bdi>{p.available}</bdi><span> in stock</span></>}
                    </span>
                  </div>
                  <div className="sale-product-actions">
                    {formatMoney(p.selling_price)}{' '}
                    <button className='add' onClick={() => addToCart(p)} disabled={p.available <= 0}>Add</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ flex: '1 1 420px', minWidth: 320 }}>
          <h3>Cart</h3>
          {cart.length === 0 && <p>Cart is empty.</p>}
          {cart.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
                  <th style={{ padding: 6 }}>Item</th>
                  <th style={{ padding: 6 }}>Qty</th>
                  <th style={{ padding: 6 }}>Line</th>
                </tr>
              </thead>
              <tbody>
                {cart.map((l) => (
                  <tr key={l.productId} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: 6 }}>
                      {l.name}
                      <div style={{ color: '#888' }}>{formatMoney(l.unitPrice)} each</div>
                    </td>
                    <td style={{ padding: 6 }}>
                      <input
                        type="number"
                        min={1}
                        max={l.available}
                        value={l.quantity}
                        onChange={(e) => setQty(l.productId, Number(e.target.value))}
                        style={{ width: 70 }}
                      />
                    </td>
                    <td style={{ padding: 6 }}>{formatMoney(l.unitPrice * l.quantity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <label>
              Payment{' '}
              <select value={paymentMethod} onChange={(e) => { resetKey(); setPaymentMethod(e.target.value as 'CASH' | 'CARD' | 'INSTAPAY') }}>
                <option value="CASH">Cash</option>
                <option value="CARD">Card</option>
                <option value="INSTAPAY">InstaPay</option>
              </select>
            </label>
            <label>
              Discount{' '}
              <select value={discountType} onChange={(e) => { resetKey(); setDiscountType(e.target.value as DiscountType) }}>
                <option value="NONE">None</option>
                <option value="PERCENT">Percent %</option>
                <option value="FIXED">Fixed EGP</option>
              </select>
            </label>
            {discountType !== 'NONE' && (
              <input
                type="number"
                min={0}
                step="0.01"
                placeholder={discountType === 'PERCENT' ? '%' : 'EGP'}
                value={discountValue}
                onChange={(e) => { resetKey(); setDiscountValue(e.target.value) }}
                style={{ width: 90 }}
              />
            )}
          </div>

          <div style={{ marginTop: 8 }}>
            <label>
              Customer (optional){' '}
              <select value={customerId} onChange={(e) => { resetKey(); setCustomerId(e.target.value) }}>
                <option value="">Walk-in</option>
                {customers?.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}{c.phone ? ` — ${c.phone}` : ''}</option>
                ))}
              </select>
            </label>{' '}
            <button onClick={() => setShowQuickCustomer(true)} style={{marginTop:10}}>+ New customer</button>
          </div>

          {showQuickCustomer && (
            <div style={{ margin: '8px 0', padding: 8, border: '1px dashed #ccc' }}>
              <input
                placeholder="Customer name"
                value={quickName}
                onChange={(e) => setQuickName(e.target.value)}
                style={{ marginRight: 6 }}
              />
              <input
                placeholder="Phone (optional)"
                value={quickPhone}
                onChange={(e) => setQuickPhone(e.target.value)}
                style={{ marginRight: 6 }}
              />
              <button onClick={handleQuickCustomer} disabled={!quickName.trim() || createCustomer.isPending}>
                Save customer
              </button>{' '}
              <button onClick={() => setShowQuickCustomer(false)}>Cancel</button>
            </div>
          )}

          <table style={{ marginTop: 12, width: '100%' }}>
            <tbody>
              <tr>
                <td>Subtotal</td>
                <td style={{ textAlign: 'right' }}>{formatMoney(subtotal)}</td>
              </tr>
              <tr>
                <td>Discount</td>
                <td style={{ textAlign: 'right' }}>{discountAmount > 0 ? `− ${formatMoney(discountAmount)}` : '—'}</td>
              </tr>
              <tr style={{ fontWeight: 700, fontSize: '1.1em' }}>
                <td>Total</td>
                <td style={{ textAlign: 'right' }}>{formatMoney(total)}</td>
              </tr>
            </tbody>
          </table>

          {error && <p role="alert" style={{ color: 'crimson' }}>{error}</p>}

          <button
            className='complete'
            onClick={submit}
            disabled={createSale.isPending || cart.length === 0}
            style={{ marginTop: 8, padding: '8px 16px', fontWeight: 700 }}
          >
            {createSale.isPending ? 'Processing…' : `Complete sale — ${formatMoney(total)}`}
          </button>
        </div>
      </div>
    </section>
  )
}
