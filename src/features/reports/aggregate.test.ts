import { describe, it, expect } from 'vitest'
import { aggregateReport, type ReportSale } from './aggregate'
import type { SaleItemRow } from './api'

const baseSale = {
  id: 's1',
  company_id: 'c1',
  branch_id: 'b1',
  customer_id: null,
  sale_number: 'BR1-000001',
  subtotal: 0,
  discount_type: 'NONE',
  discount_value: 0,
  discount_amount: 0,
  total_amount: 0,
  payment_method: 'CASH',
  status: 'COMPLETED',
  created_by: 'u1',
  idempotency_key: null,
  void_reason: null,
  created_at: '2026-11-01T10:00:00Z',
  updated_at: '2026-11-01T10:00:00Z',
} as const

function sale(overrides: Partial<ReportSale> & { id: string }): ReportSale {
  return { ...baseSale, branch_code: 'BR1', ...overrides } as ReportSale
}

function item(overrides: Partial<SaleItemRow> & { id: string; sale_id: string }): SaleItemRow {
  return {
    product_id: 'p1',
    product_name_snapshot: 'Oil Filter',
    quantity: 1,
    unit_selling_price: 100,
    unit_purchase_cost_snapshot: 60,
    discount_amount: 0,
    line_total: 100,
    created_at: '2026-11-01T10:00:00Z',
    ...overrides,
  } as SaleItemRow
}

describe('aggregateReport', () => {
  it('sums revenue, discounts and payment split from completed sales only', () => {
    const report = aggregateReport(
      [
        sale({ id: 's1', total_amount: 240, payment_method: 'CASH' }),
        sale({ id: 's2', branch_id: 'b2', branch_code: 'BR2', total_amount: 120, payment_method: 'CARD' }),
        sale({ id: 's3', total_amount: 90, status: 'VOIDED', void_reason: 'mistake' }),
        sale({ id: 's4', total_amount: 200, discount_type: 'PERCENT', discount_value: 10, discount_amount: 22.22 }),
      ],
      [
        item({ id: 'i1', sale_id: 's1', quantity: 2, line_total: 240 }),
        item({ id: 'i2', sale_id: 's2', line_total: 120 }),
        item({ id: 'i3', sale_id: 's3', line_total: 90 }),
        item({ id: 'i4', sale_id: 's4', line_total: 200 }),
      ],
    )

    expect(report.totals.revenue).toBe(560)
    expect(report.totals.transactions).toBe(3)
    expect(report.totals.voidedCount).toBe(1)
    expect(report.totals.cash).toBe(440)
    expect(report.totals.card).toBe(120)
    expect(report.totals.discounts).toBe(22.22)
    // voided sale items are excluded
    expect(report.totals.units).toBe(4)
  })

  it('computes gross profit from purchase-cost snapshots and never invents unknown costs', () => {
    const report = aggregateReport(
      [sale({ id: 's1', total_amount: 250 })],
      [
        item({ id: 'i1', sale_id: 's1', quantity: 2, unit_selling_price: 100, unit_purchase_cost_snapshot: 60, line_total: 200 }),
        item({ id: 'i2', sale_id: 's1', product_id: 'p2', product_name_snapshot: 'Spark Plug', quantity: 1, unit_selling_price: 50, unit_purchase_cost_snapshot: null, line_total: 50 }),
      ],
    )
    // (100-60)*2 = 80 profit; the unknown-cost item is excluded and reported
    expect(report.totals.profit).toBe(80)
    expect(report.totals.unknownCostUnits).toBe(1)
    const spark = report.topProducts.find((p) => p.productId === 'p2')!
    expect(spark.profit).toBe(0) // no invented profit
    expect(spark.revenue).toBe(50)
  })

  it('builds per-branch comparison, top products and daily series', () => {
    const report = aggregateReport(
      [
        sale({ id: 's1', total_amount: 100, created_at: '2026-11-01T09:00:00Z' }),
        sale({ id: 's2', total_amount: 300, created_at: '2026-11-01T12:00:00Z' }),
        sale({ id: 's3', branch_id: 'b2', branch_code: 'BR2', total_amount: 200, created_at: '2026-11-02T09:00:00Z' }),
      ],
      [
        item({ id: 'i1', sale_id: 's1', quantity: 1, line_total: 100 }),
        item({ id: 'i2', sale_id: 's2', product_id: 'p2', quantity: 3, line_total: 300 }),
        item({ id: 'i3', sale_id: 's3', product_id: 'p3', quantity: 1, line_total: 200 }),
      ],
    )

    expect(report.byBranch.map((b) => b.code)).toEqual(['BR1', 'BR2'])
    expect(report.byBranch[0]!.revenue).toBe(400)
    expect(report.byBranch[0]!.units).toBe(4)
    expect(report.topProducts[0]!.quantity).toBe(3)
    expect(report.daily).toEqual([
      { date: '2026-11-01', revenue: 400, transactions: 2 },
      { date: '2026-11-02', revenue: 200, transactions: 1 },
    ])
  })

  it('handles empty input', () => {
    const report = aggregateReport([], [])
    expect(report.totals.revenue).toBe(0)
    expect(report.totals.transactions).toBe(0)
    expect(report.byBranch).toEqual([])
    expect(report.topProducts).toEqual([])
    expect(report.daily).toEqual([])
  })
})
