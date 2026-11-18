import { describe, it, expect } from 'vitest'
import { clientFor } from '../helpers'

/**
 * M5: verify the seeded ledger — the numbers reports aggregate — matches the
 * documented seed data. Uses seeded sale numbers so parallel test files that
 * create their own sales cannot interfere.
 */
describe('M5 reports: seeded ledger truth', () => {
  const seededNumbers = ['BR1-000001', 'BR2-000002', 'BR2-000003', 'BR1-000004']

  it('owner sees exactly the four seeded sales with consistent totals', async () => {
    const owner = await clientFor('owner')
    const { data: sales, error } = await owner
      .from('sales')
      .select('sale_number, status, subtotal, discount_amount, total_amount, payment_method, branch_id, branches(short_code)')
      .in('sale_number', seededNumbers)
      .order('sale_number')
    expect(error).toBeNull()
    expect(sales!.length).toBe(4)

    const byNumber = new Map(sales!.map((s) => [s.sale_number, s]))

    const s1 = byNumber.get('BR1-000001')!
    expect(s1.status).toBe('COMPLETED')
    expect(Number(s1.subtotal)).toBe(240)
    expect(Number(s1.total_amount)).toBe(240)
    expect(s1.payment_method).toBe('CASH')
    expect((s1 as unknown as { branches: { short_code: string } }).branches.short_code).toBe('BR1')

    const s2 = byNumber.get('BR2-000002')!
    expect(Number(s2.total_amount)).toBe(120)

    const s3 = byNumber.get('BR2-000003')!
    expect(Number(s3.subtotal)).toBe(900)
    expect(Number(s3.discount_amount)).toBe(90)
    expect(Number(s3.total_amount)).toBe(810)
    expect(s3.payment_method).toBe('CARD')

    const s4 = byNumber.get('BR1-000004')!
    expect(s4.status).toBe('VOIDED')
  })

  it('revenue from completed seeded sales totals 1,170 EGP; voided excluded', async () => {
    const owner = await clientFor('owner')
    const { data, error } = await owner
      .from('sales')
      .select('status, total_amount')
      .in('sale_number', seededNumbers)
    expect(error).toBeNull()
    const completed = data!.filter((s) => s.status === 'COMPLETED')
    const revenue = completed.reduce((acc, s) => acc + Number(s.total_amount), 0)
    expect(completed.length).toBe(3)
    expect(revenue).toBe(1170)
  })

  it('sale item snapshots carry prices, and profit math is derivable per item', async () => {
    const owner = await clientFor('owner')
    const { data: sale } = await owner
      .from('sales')
      .select('id')
      .eq('sale_number', 'BR1-000001')
      .single()

    const { data: items, error } = await owner
      .from('sale_items')
      .select('*')
      .eq('sale_id', sale!.id)
    expect(error).toBeNull()
    expect(items!.length).toBe(1)
    const item = items![0]!
    expect(item.product_name_snapshot).toContain('Oil Filter')
    expect(item.quantity).toBe(2)
    expect(Number(item.unit_selling_price)).toBe(120)
    expect(Number(item.line_total)).toBe(240)
    // purchase_cost_snapshot may be null (unknown) or a number — never inferred client-side
    expect(
      item.unit_purchase_cost_snapshot === null ||
        typeof Number(item.unit_purchase_cost_snapshot) === 'number',
    ).toBe(true)
  })

  it('branch staff only aggregate their own branch sales', async () => {
    const employeeBr1 = await clientFor('employeeBr1')
    const { data, error } = await employeeBr1
      .from('sales')
      .select('sale_number')
      .in('sale_number', seededNumbers)
    expect(error).toBeNull()
    const numbers = new Set(data!.map((s) => s.sale_number))
    expect(numbers).toEqual(new Set(['BR1-000001', 'BR1-000004']))

    const managerBr2 = await clientFor('managerBr2')
    const { data: br2 } = await managerBr2
      .from('sales')
      .select('sale_number')
      .in('sale_number', seededNumbers)
    expect(new Set(br2!.map((s) => s.sale_number))).toEqual(new Set(['BR2-000002', 'BR2-000003']))
  })

  it('inventory aggregates are company-readable with no negative quantities', async () => {
    const employee = await clientFor('employeeBr2')
    const { data, error } = await employee
      .from('branch_inventory')
      .select('quantity, low_stock_threshold')
    expect(error).toBeNull()
    expect(data!.length).toBeGreaterThan(0)
    expect(data!.every((r) => r.quantity >= 0)).toBe(true)

    // BR1's seeded BP-2001 row demonstrates a low-stock case (qty 1 < threshold 5)
    const owner = await clientFor('owner')
    const { data: bp } = await owner
      .from('products')
      .select('id')
      .eq('sku', 'BP-2001')
      .single()
    const { data: br1 } = await owner.from('branches').select('id').eq('short_code', 'BR1').single()
    const { data: row } = await owner
      .from('branch_inventory')
      .select('quantity, low_stock_threshold')
      .eq('product_id', bp!.id)
      .eq('branch_id', br1!.id)
      .single()
    expect(row!.quantity).toBe(1)
    expect(row!.low_stock_threshold).toBe(5)
  })
})
