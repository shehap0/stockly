import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import type { TableRow, Enums } from '@/lib/database.types'

export type Sale = TableRow<'sales'>
export type SaleItem = TableRow<'sale_items'>
export type Customer = TableRow<'customers'>
export type DiscountType = Enums['discount_type']

export const saleKeys = {
  all: ['sales'] as const,
  list: (branchId: string | null) => ['sales', 'list', branchId] as const,
  detail: (id: string) => ['sales', 'detail', id] as const,
}

export type SaleListItem = Sale & {
  branch_name: string
  customer_name: string | null
  item_count: number
}

export type SalePayload = { sale: Sale; items: SaleItem[] }

export const customerSchema = z.object({
  full_name: z.string().trim().min(1, 'Customer name is required'),
  phone: z
    .string()
    .trim()
    .refine((v) => v === '' || /^[+\d\s-]{5,20}$/.test(v), 'Enter a valid phone number')
    .optional()
    .or(z.literal('')),
  notes: z.string().trim().optional().or(z.literal('')),
})
export type CustomerFormValues = z.infer<typeof customerSchema>

export function useSalesList(branchId: string | null) {
  return useQuery({
    queryKey: saleKeys.list(branchId),
    queryFn: async (): Promise<SaleListItem[]> => {
      let query = supabase
        .from('sales')
        .select('*, branches(name), customers(name), sale_items(quantity)')
        .order('created_at', { ascending: false })
        .limit(100)
      if (branchId) query = query.eq('branch_id', branchId)

      const { data, error } = await query
      if (error) throw error

      return (data ?? []).map((row) => {
        const { branches, customers, sale_items, ...sale } = row as Sale & {
          branches: { name: string } | null
          customers: { name: string } | null
          sale_items: { quantity: number }[] | null
        }
        return {
          ...sale,
          branch_name: branches?.name ?? '—',
          customer_name: customers?.name ?? null,
          item_count: (sale_items ?? []).reduce((acc, i) => acc + i.quantity, 0),
        }
      })
    },
  })
}

export function useSaleDetail(saleId: string) {
  return useQuery({
    queryKey: saleKeys.detail(saleId),
    enabled: Boolean(saleId),
    queryFn: async (): Promise<SalePayload | null> => {
      const { data: sale, error } = await supabase
        .from('sales')
        .select('*, branches(name, short_code), customers(name, phone)')
        .eq('id', saleId)
        .maybeSingle()
      if (error) throw error
      if (!sale) return null

      const { data: items, error: itemsError } = await supabase
        .from('sale_items')
        .select('*')
        .eq('sale_id', saleId)
        .order('created_at')
      if (itemsError) throw itemsError

      return {
        sale: sale as Sale,
        items: items ?? [],
      }
    },
  })
}

export function useCreateSale() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      branchId: string
      items: { product_id: string; quantity: number }[]
      paymentMethod: 'CASH' | 'CARD' | 'INSTAPAY'
      discountType: DiscountType
      discountValue: number
      customerId: string | null
      idempotencyKey: string
    }): Promise<SalePayload> => {
      const { data, error } = await supabase.rpc('create_sale', {
        p_branch_id: input.branchId,
        p_items: input.items,
        p_payment_method: input.paymentMethod,
        p_discount_type: input.discountType,
        p_discount_value: input.discountValue,
        p_customer_id: input.customerId ?? undefined,
        p_idempotency_key: input.idempotencyKey,
      })
      if (error) throw error
      const payload = data as unknown as SalePayload
      return payload
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: saleKeys.all })
      void queryClient.invalidateQueries({ queryKey: ['inventory'] })
      void queryClient.invalidateQueries({ queryKey: ['products'] })
    },
  })
}

export function useVoidSale() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { saleId: string; reason: string }): Promise<SalePayload> => {
      const { data, error } = await supabase.rpc('void_sale', {
        p_sale_id: input.saleId,
        p_reason: input.reason,
      })
      if (error) throw error
      return data as unknown as SalePayload
    },
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: saleKeys.all })
      void queryClient.invalidateQueries({ queryKey: saleKeys.detail(vars.saleId) })
      void queryClient.invalidateQueries({ queryKey: ['inventory'] })
      void queryClient.invalidateQueries({ queryKey: ['products'] })
    },
  })
}

export const customerKeys = {
  all: ['customers'] as const,
}

export function useCustomers() {
  return useQuery({
    queryKey: customerKeys.all,
    queryFn: async (): Promise<Customer[]> => {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('name')
      if (error) throw error
      return data
    },
  })
}

export function useCustomerMutations() {
  const queryClient = useQueryClient()
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: customerKeys.all })

  async function companyId(): Promise<string> {
    const { data: user } = await supabase.auth.getUser()
    if (!user.user) throw new Error('Not signed in')
    const { data, error } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('id', user.user.id)
      .maybeSingle()
    if (error) throw error
    if (!data) throw new Error('No profile')
    return data.company_id
  }

  const create = useMutation({
    mutationFn: async (values: CustomerFormValues): Promise<Customer> => {
      const { data, error } = await supabase
        .from('customers')
        .insert({
          company_id: await companyId(),
          name: values.full_name,
          phone: values.phone || null,
          notes: values.notes || null,
        })
        .select('*')
        .single()
      if (error) throw error
      return data
    },
    onSuccess: invalidate,
  })

  const update = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: CustomerFormValues }): Promise<Customer> => {
      const { data, error } = await supabase
        .from('customers')
        .update({
          name: values.full_name,
          phone: values.phone || null,
          notes: values.notes || null,
        })
        .eq('id', id)
        .select('*')
        .single()
      if (error) throw error
      return data
    },
    onSuccess: invalidate,
  })

  return { create, update }
}

/** Active products for POS, restricted to the caller's branch availability. */
export function useSellableProducts(branchId: string, search: string, categoryId = '') {
  return useQuery({
    queryKey: ['sales', 'sellable', branchId, search, categoryId] as const,
    enabled: Boolean(branchId),
    queryFn: async () => {
      let query = supabase
        .from('products')
        .select('id, name, sku, barcode, category_id, selling_price, branch_inventory!inner(quantity)')
        .eq('branch_inventory.branch_id', branchId)
        .eq('is_active', true)
        .order('name')
        .limit(20)

      if (categoryId) query = query.eq('category_id', categoryId)

      const term = search.trim().replace(/[,%()"\\]/g, ' ').trim()
      if (term) {
        const { data: matchingCategories, error: categoryError } = await supabase
          .from('product_categories')
          .select('id')
          .eq('is_active', true)
          .ilike('name', `%${term}%`)
        if (categoryError) throw categoryError

        const filters = [`name.ilike.%${term}%`, `sku.eq.${term}`, `barcode.eq.${term}`]
        if (matchingCategories?.length) {
          filters.push(`category_id.in.(${matchingCategories.map((category) => category.id).join(',')})`)
        }
        query = query.or(filters.join(','))
      }

      const { data, error } = await query
      if (error) throw error
      return (data ?? []).map((p) => {
        const inv = (p.branch_inventory ?? []) as { quantity: number }[]
        return {
          id: p.id,
          name: p.name,
          sku: p.sku,
          selling_price: p.selling_price,
          available: inv[0]?.quantity ?? 0,
        }
      })
    },
  })
}
