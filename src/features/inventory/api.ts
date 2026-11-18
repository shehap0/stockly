import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { TableRow, Enums } from '@/lib/database.types'
import { logWarn } from '@/lib/logger'

export type InventoryRow = TableRow<'branch_inventory'>
export type Movement = TableRow<'inventory_movements'>
export type MovementType = Enums['movement_type']
export type AdjustmentType = Extract<
  MovementType,
  'DAMAGE' | 'MANUAL_ADJUSTMENT' | 'OTHER' | 'SALE_RETURN'
>

export const inventoryKeys = {
  all: ['inventory'] as const,
  stock: ['inventory', 'stock'] as const,
  movements: (branchId: string) => ['inventory', 'movements', branchId] as const,
}

export type StockRow = {
  product_id: string
  name: string
  sku: string | null
  category_id: string | null
  is_active: boolean
  selling_price: number
  /** quantity and threshold per branch id */
  branches: Record<string, { quantity: number; low_stock_threshold: number | null }>
}

/**
 * All active products with per-branch quantities (company-readable).
 * Products without an inventory row show zeroes.
 */
export function useStockOverview() {
  return useQuery({
    queryKey: inventoryKeys.stock,
    queryFn: async (): Promise<StockRow[]> => {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, sku, category_id, is_active, selling_price, branch_inventory(branch_id, quantity, low_stock_threshold)')
        .eq('is_active', true)
        .order('name')
        .limit(500)
      if (error) throw error

      return (data ?? []).map((p) => {
        const rows = (p.branch_inventory ?? []) as {
          branch_id: string
          quantity: number
          low_stock_threshold: number | null
        }[]
        const branches: StockRow['branches'] = {}
        for (const r of rows) {
          branches[r.branch_id] = {
            quantity: r.quantity,
            low_stock_threshold: r.low_stock_threshold,
          }
        }
        return {
          product_id: p.id,
          name: p.name,
          sku: p.sku,
          category_id: p.category_id,
          is_active: p.is_active,
          selling_price: p.selling_price,
          branches,
        }
      })
    },
  })
}

export function useMovements(branchId: string) {
  return useQuery({
    queryKey: inventoryKeys.movements(branchId),
    enabled: Boolean(branchId),
    queryFn: async (): Promise<(Movement & { product_name: string })[]> => {
      const { data, error } = await supabase
        .from('inventory_movements')
        .select('*, products(name)')
        .eq('branch_id', branchId)
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      return (data ?? []).map((m) => {
        const { products, ...movement } = m as Movement & { products: { name: string } | null }
        return { ...movement, product_name: products?.name ?? 'Unknown product' }
      })
    },
  })
}

function useInvalidateInventory() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: inventoryKeys.all })
    void queryClient.invalidateQueries({ queryKey: ['products'] })
  }
}

export function useAddStock() {
  const invalidate = useInvalidateInventory()
  return useMutation({
    mutationFn: async (input: {
      branchId: string
      productId: string
      quantity: number
      unitPurchaseCost?: number | null
      reason?: string
      idempotencyKey?: string
    }) => {
      const { data, error } = await supabase.rpc('add_stock', {
        p_branch_id: input.branchId,
        p_product_id: input.productId,
        p_quantity: input.quantity,
        p_unit_purchase_cost: input.unitPurchaseCost ?? undefined,
        p_reason: input.reason || undefined,
        p_idempotency_key: input.idempotencyKey ?? crypto.randomUUID(),
      })
      if (error) throw error
      return data
    },
    onSuccess: invalidate,
  })
}

export function useAdjustStock() {
  const invalidate = useInvalidateInventory()
  return useMutation({
    mutationFn: async (input: {
      branchId: string
      productId: string
      quantityChange: number
      movementType: AdjustmentType
      reason: string
      idempotencyKey?: string
    }) => {
      const { data, error } = await supabase.rpc('adjust_stock', {
        p_branch_id: input.branchId,
        p_product_id: input.productId,
        p_quantity_change: input.quantityChange,
        p_movement_type: input.movementType,
        p_reason: input.reason,
        p_idempotency_key: input.idempotencyKey ?? crypto.randomUUID(),
      })
      if (error) throw error
      return data
    },
    onSuccess: invalidate,
  })
}

export function useSetThreshold() {
  const invalidate = useInvalidateInventory()
  return useMutation({
    mutationFn: async (input: { branchId: string; productId: string; threshold: number }) => {
      const { data, error } = await supabase.rpc('set_low_stock_threshold', {
        p_branch_id: input.branchId,
        p_product_id: input.productId,
        p_threshold: input.threshold,
      })
      if (error) throw error
      return data
    },
    onSuccess: invalidate,
  })
}

export function isLowStock(quantity: number, threshold: number | null | undefined): boolean {
  return threshold != null && threshold > 0 && quantity < threshold
}

/**
 * Live inventory sync: any branch_inventory change refreshes stock and movements
 * (the publication covers branch_inventory; movements refresh via invalidation).
 */
export function useInventoryRealtime() {
  const queryClient = useQueryClient()
  useEffect(() => {
    const channel = supabase
      .channel('inventory-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'branch_inventory' },
        () => void queryClient.invalidateQueries({ queryKey: inventoryKeys.all }),
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // Covers first connect AND automatic reconnects: missed events are
          // reconciled from PostgreSQL rather than trusted.
          void queryClient.invalidateQueries({ queryKey: inventoryKeys.all })
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          logWarn('Inventory realtime channel unavailable; will reconcile on reconnect', status)
        }
      })
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [queryClient])
}
