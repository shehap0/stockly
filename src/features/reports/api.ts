import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { TableRow } from '@/lib/database.types'
import { aggregateReport, type ReportSale } from './aggregate'

export type SaleRow = TableRow<'sales'>
export type SaleItemRow = TableRow<'sale_items'>

export const reportKeys = {
  all: ['reports'] as const,
  range: (fromISO: string, toISO: string, branchId: string | null) =>
    ['reports', 'range', fromISO, toISO, branchId] as const,
  dashboard: ['reports', 'dashboard'] as const,
}

export type ReportData = {
  sales: SaleRow[]
  items: SaleItemRow[]
  /** per-branch aggregates */
  byBranch: { branchId: string; code: string; revenue: number; transactions: number; units: number; profit: number | null }[]
  totals: {
    revenue: number
    transactions: number
    units: number
    discounts: number
    cash: number
    card: number
    instapay: number
    voidedCount: number
    profit: number | null
    unknownCostUnits: number
  }
  topProducts: {
    productId: string
    name: string
    quantity: number
    revenue: number
    profit: number | null
  }[]
  daily: { date: string; revenue: number; transactions: number }[]
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function startOfMonthISO(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
}

export function todayISO(): string {
  return isoDay(new Date())
}

/** Sales + items within [from, to] (dates inclusive, local-day based). */
export function useReportData(fromDate: string, toDate: string, branchId: string | null) {
  const fromISO = new Date(`${fromDate}T00:00:00`).toISOString()
  const toISO = new Date(`${toDate}T23:59:59.999`).toISOString()

  return useQuery({
    queryKey: reportKeys.range(fromISO, toISO, branchId),
    queryFn: async (): Promise<ReportData> => {
      let saleQuery = supabase
        .from('sales')
        .select('*, branches(short_code)')
        .gte('created_at', fromISO)
        .lte('created_at', toISO)
        .order('created_at')
      if (branchId) saleQuery = saleQuery.eq('branch_id', branchId)

      const { data: saleRows, error: saleError } = await saleQuery
      if (saleError) throw saleError

      const sales = (saleRows ?? []) as (SaleRow & { branches: { short_code: string } | null })[]
      const completed = sales.filter((s) => s.status === 'COMPLETED')
      let items: SaleItemRow[] = []
      if (completed.length > 0) {
        const { data: itemRows, error: itemError } = await supabase
          .from('sale_items')
          .select('*')
          .in('sale_id', completed.map((s) => s.id))
        if (itemError) throw itemError
        items = itemRows ?? []
      }

      const report = aggregateReport(
        sales.map((s) => ({
          ...s,
          branch_code: (s as SaleRow & { branches: { short_code: string } | null }).branches?.short_code ?? '—',
        })) as ReportSale[],
        completed.length > 0 ? items : [],
      )

      return report
    },
  })
}

export type DashboardData = {
  todayRevenue: number
  todayTransactions: number
  weekRevenue: number
  monthRevenue: number
  monthTransactions: number
  monthProfit: number | null
  totalProducts: number
  totalUnits: number
  inventoryValue: number
  lowStock: { productId: string; name: string; branchId: string; quantity: number; threshold: number }[]
  outOfStock: { productId: string; name: string; branchId: string }[]
}

export function useDashboardData() {
  return useQuery({
    queryKey: reportKeys.dashboard,
    queryFn: async (): Promise<DashboardData> => {
      const now = new Date()
      const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const startWeek = new Date(startToday)
      startWeek.setDate(startWeek.getDate() - startWeek.getDay())
      const startMonth = new Date(now.getFullYear(), now.getMonth(), 1)

      const { data: sales, error } = await supabase
        .from('sales')
        .select('id, total_amount, created_at, status')
        .gte('created_at', startMonth.toISOString())
      if (error) throw error

      const completed = (sales ?? []).filter((s) => s.status === 'COMPLETED')
      let todayRevenue = 0
      let todayTransactions = 0
      let weekRevenue = 0
      let monthRevenue = 0
      for (const s of completed) {
        const created = new Date(s.created_at)
        const amount = Number(s.total_amount)
        monthRevenue += amount
        if (created >= startWeek) weekRevenue += amount
        if (created >= startToday) {
          todayRevenue += amount
          todayTransactions += 1
        }
      }

      // month gross profit from item snapshots (unknown costs excluded)
      let monthProfit: number | null = 0
      if (completed.length > 0) {
        const { data: items, error: itemErr } = await supabase
          .from('sale_items')
          .select('quantity, unit_selling_price, unit_purchase_cost_snapshot')
          .in('sale_id', completed.map((s) => s.id))
        if (itemErr) throw itemErr
        for (const i of items ?? []) {
          if (i.unit_purchase_cost_snapshot === null) continue
          monthProfit =
            (monthProfit ?? 0) +
            (Number(i.unit_selling_price) - Number(i.unit_purchase_cost_snapshot)) * i.quantity
        }
      }

      const { count: productCount } = await supabase
        .from('products')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true)

      const { data: inventory, error: invErr } = await supabase
        .from('branch_inventory')
        .select('product_id, branch_id, quantity, low_stock_threshold, products!inner(name, purchase_cost, is_active)')
      if (invErr) throw invErr

      let totalUnits = 0
      let inventoryValue = 0
      const lowStock: DashboardData['lowStock'] = []
      const outOfStock: DashboardData['outOfStock'] = []
      for (const row of inventory ?? []) {
        const product = row.products as { name: string; purchase_cost: number | null; is_active: boolean } | null
        if (!product?.is_active) continue
        totalUnits += row.quantity
        if (product.purchase_cost !== null) {
          inventoryValue += row.quantity * Number(product.purchase_cost)
        }
        if (row.quantity === 0) {
          outOfStock.push({ productId: row.product_id, name: product.name, branchId: row.branch_id })
        } else if (row.low_stock_threshold !== null && row.quantity < row.low_stock_threshold) {
          lowStock.push({
            productId: row.product_id,
            name: product.name,
            branchId: row.branch_id,
            quantity: row.quantity,
            threshold: row.low_stock_threshold,
          })
        }
      }

      return {
        todayRevenue,
        todayTransactions,
        weekRevenue,
        monthRevenue,
        monthTransactions: completed.length,
        monthProfit,
        totalProducts: productCount ?? 0,
        totalUnits,
        inventoryValue,
        lowStock,
        outOfStock,
      }
    },
  })
}
