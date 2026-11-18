import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import type { TableRow, Enums } from '@/lib/database.types'

export type Product = TableRow<'products'>
export type ProductCondition = Enums['product_condition']

export const PAGE_SIZE = 20

export type ProductListFilters = {
  search?: string
  categoryId?: string
  includeInactive?: boolean
  page?: number
}

export type ProductListItem = Product & {
  total_stock: number
  branch_stock: { branch_id: string; quantity: number }[]
}

export const productKeys = {
  all: ['products'] as const,
  list: (filters: ProductListFilters) =>
    [...productKeys.all, 'list', filters] as const,
  detail: (id: string) => [...productKeys.all, 'detail', id] as const,
}

export const productFormSchema = z.object({
  name: z.string().trim().min(1, 'Product name is required'),
  selling_price: z
    .string()
    .trim()
    .min(1, 'Selling price is required')
    .refine((v) => /^\d+(\.\d{1,2})?$/.test(v), 'Use a number with up to 2 decimals')
    .refine((v) => Number(v) >= 0, 'Cannot be negative'),
  purchase_cost: z
    .string()
    .trim()
    .refine((v) => v === '' || /^\d+(\.\d{1,2})?$/.test(v), 'Use a number with up to 2 decimals')
    .refine((v) => v === '' || Number(v) >= 0, 'Cannot be negative')
    .optional()
    .or(z.literal('')),
  category_id: z.string().uuid().nullable().optional(),
  description: z.string().trim().optional().or(z.literal('')),
  manufacturer: z.string().trim().optional().or(z.literal('')),
  brand: z.string().trim().optional().or(z.literal('')),
  car_make: z.string().trim().optional().or(z.literal('')),
  car_model: z.string().trim().optional().or(z.literal('')),
  manufacturing_year: z
    .string()
    .trim()
    .refine((v) => v === '' || (/^\d{4}$/.test(v) && Number(v) >= 1900 && Number(v) <= 2100),
      'Enter a 4-digit year')
    .optional()
    .or(z.literal('')),
  sku: z.string().trim().optional().or(z.literal('')),
  barcode: z.string().trim().optional().or(z.literal('')),
  oem_number: z.string().trim().optional().or(z.literal('')),
  condition: z.enum(['NEW', 'USED', 'REFURBISHED']).nullable().optional(),
  is_active: z.boolean().optional(),
})
export type ProductFormValues = z.infer<typeof productFormSchema>

function toPayload(values: ProductFormValues) {
  return {
    name: values.name,
    selling_price: Number(values.selling_price),
    purchase_cost: values.purchase_cost ? Number(values.purchase_cost) : null,
    category_id: values.category_id || null,
    description: values.description || null,
    manufacturer: values.manufacturer || null,
    brand: values.brand || null,
    car_make: values.car_make || null,
    car_model: values.car_model || null,
    manufacturing_year: values.manufacturing_year ? Number(values.manufacturing_year) : null,
    sku: values.sku || null,
    barcode: values.barcode || null,
    oem_number: values.oem_number || null,
    condition: values.condition ?? null,
    is_active: values.is_active ?? true,
  }
}

export function useProductList(filters: ProductListFilters) {
  const page = filters.page ?? 0
  const from = page * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  return useQuery({
    queryKey: productKeys.list(filters),
    queryFn: async (): Promise<{ items: ProductListItem[]; count: number }> => {
      let query = supabase
        .from('products')
        .select('*, branch_inventory(branch_id, quantity)', { count: 'exact' })
        .order('name', { ascending: true })
        .range(from, to)

      if (!filters.includeInactive) query = query.eq('is_active', true)
      if (filters.categoryId) query = query.eq('category_id', filters.categoryId)
      if (filters.search) {
        const term = filters.search.trim()
        // name contains OR exact sku/barcode/oem match
        query = query.or(
          [
            `name.ilike.%${term}%`,
            `sku.eq.${term}`,
            `barcode.eq.${term}`,
            `oem_number.eq.${term}`,
          ].join(','),
        )
      }

      const { data, error, count } = await query
      if (error) throw error

      const items: ProductListItem[] = (data ?? []).map((p) => {
        const stock = (p.branch_inventory as { branch_id: string; quantity: number }[] | null) ?? []
        const { branch_inventory: _drop, ...product } = p as Product & {
          branch_inventory: { branch_id: string; quantity: number }[] | null
        }
        return {
          ...product,
          branch_stock: stock,
          total_stock: stock.reduce((acc, s) => acc + s.quantity, 0),
        }
      })

      return { items, count: count ?? 0 }
    },
  })
}

export function useProduct(productId: string) {
  return useQuery({
    queryKey: productKeys.detail(productId),
    queryFn: async (): Promise<Product | null> => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', productId)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })
}

export function useCompanyProductsByIds(ids: string[]) {
  return useQuery({
    queryKey: [...productKeys.all, 'byIds', ids.sort()] as const,
    enabled: ids.length > 0,
    queryFn: async (): Promise<Product[]> => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .in('id', ids)
      if (error) throw error
      return data
    },
    staleTime: 30_000,
  })
}

export function useProductMutations() {
  const queryClient = useQueryClient()

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: productKeys.all })

  const create = useMutation({
    mutationFn: async ({
      values,
      companyId,
    }: {
      values: ProductFormValues
      companyId: string
    }): Promise<Product> => {
      const { data, error } = await supabase
        .from('products')
        .insert({ ...toPayload(values), company_id: companyId })
        .select('*')
        .single()
      if (error) throw error
      return data
    },
    onSuccess: invalidate,
  })

  const update = useMutation({
    mutationFn: async ({
      productId,
      values,
    }: {
      productId: string
      values: ProductFormValues
    }): Promise<Product> => {
      const { data, error } = await supabase
        .from('products')
        .update(toPayload(values))
        .eq('id', productId)
        .select('*')
        .single()
      if (error) throw error
      return data
    },
    onSuccess: invalidate,
  })

  const deactivate = useMutation({
    mutationFn: async ({ productId, isActive }: { productId: string; isActive: boolean }) => {
      const { error } = await supabase
        .from('products')
        .update({ is_active: isActive })
        .eq('id', productId)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  return { create, update, deactivate }
}
