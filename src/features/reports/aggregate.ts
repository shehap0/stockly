import type { SaleRow, SaleItemRow, ReportData } from './api'

export type ReportSale = SaleRow & { branch_code: string }

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/**
 * Pure aggregation over RLS-scoped sales/items. Revenue counts COMPLETED sales
 * only. Gross profit uses the purchase-cost snapshot; items without a known
 * cost are excluded and surfaced via unknownCostUnits (never invented).
 */
export function aggregateReport(sales: ReportSale[], items: SaleItemRow[]): ReportData {
  const completed = sales.filter((s) => s.status === 'COMPLETED')
  const saleById = new Map(completed.map((s) => [s.id, s]))
  const completedItems = items.filter((i) => saleById.has(i.sale_id))

  const totals: ReportData['totals'] = {
    revenue: 0,
    transactions: completed.length,
    units: 0,
    discounts: 0,
    cash: 0,
    card: 0,
    instapay: 0,
    voidedCount: sales.length - completed.length,
    profit: 0,
    unknownCostUnits: 0,
  }

  for (const s of completed) {
    totals.revenue += Number(s.total_amount)
    totals.discounts += Number(s.discount_amount)
    if (s.payment_method === 'CASH') totals.cash += Number(s.total_amount)
    else if (s.payment_method === 'CARD') totals.card += Number(s.total_amount)
    else if (s.payment_method === 'INSTAPAY') totals.instapay += Number(s.total_amount)
  }

  const branchMap = new Map<string, ReportData['byBranch'][number]>()
  for (const s of completed) {
    const entry = branchMap.get(s.branch_id) ?? {
      branchId: s.branch_id,
      code: s.branch_code,
      revenue: 0,
      transactions: 0,
      units: 0,
      profit: 0,
    }
    entry.revenue += Number(s.total_amount)
    entry.transactions += 1
    branchMap.set(s.branch_id, entry)
  }

  const productMap = new Map<string, ReportData['topProducts'][number]>()
  for (const item of completedItems) {
    const sale = saleById.get(item.sale_id)
    if (!sale) continue

    totals.units += item.quantity
    const branch = branchMap.get(sale.branch_id)
    if (branch) branch.units += item.quantity

    const cost = item.unit_purchase_cost_snapshot
    if (cost === null) {
      totals.unknownCostUnits += item.quantity
    } else {
      const lineProfit = (Number(item.unit_selling_price) - Number(cost)) * item.quantity
      totals.profit = (totals.profit ?? 0) + lineProfit
      if (branch) branch.profit = (branch.profit ?? 0) + lineProfit
    }

    const product = productMap.get(item.product_id) ?? {
      productId: item.product_id,
      name: item.product_name_snapshot,
      quantity: 0,
      revenue: 0,
      profit: 0,
    }
    product.quantity += item.quantity
    product.revenue += Number(item.line_total)
    if (cost !== null) {
      product.profit =
        (product.profit ?? 0) + (Number(item.unit_selling_price) - Number(cost)) * item.quantity
    }
    productMap.set(item.product_id, product)
  }

  const dailyMap = new Map<string, { revenue: number; transactions: number }>()
  for (const s of completed) {
    const day = isoDay(new Date(s.created_at))
    const entry = dailyMap.get(day) ?? { revenue: 0, transactions: 0 }
    entry.revenue += Number(s.total_amount)
    entry.transactions += 1
    dailyMap.set(day, entry)
  }

  return {
    sales: completed,
    items: completedItems,
    totals,
    byBranch: [...branchMap.values()].sort((a, b) => b.revenue - a.revenue),
    topProducts: [...productMap.values()].sort((a, b) => b.quantity - a.quantity),
    daily: [...dailyMap.entries()]
      .map(([date, v]) => ({ date, ...v }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  }
}
