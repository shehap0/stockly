import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import type { TableRow, Enums } from '@/lib/database.types'

export type AttributeDefinition = TableRow<'product_attribute_definitions'>
export type AttributeDataType = Enums['attribute_data_type']
export type AttributeValue = TableRow<'product_attribute_values'>

export const attributeKeys = {
  defs: ['attribute-definitions'] as const,
  values: (productId: string) => ['attribute-values', productId] as const,
}

export const attributeDefSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  data_type: z.enum(['TEXT', 'NUMBER', 'BOOLEAN', 'DROPDOWN', 'DATE']),
  is_required: z.boolean(),
  is_active: z.boolean(),
  options: z.array(z.string().trim().min(1)).default([]),
  display_order: z.coerce.number().int().min(0).default(0),
})

export type AttributeDefValues = z.infer<typeof attributeDefSchema>

export function useAttributeDefinitions() {
  return useQuery({
    queryKey: attributeKeys.defs,
    queryFn: async (): Promise<AttributeDefinition[]> => {
      const { data, error } = await supabase
        .from('product_attribute_definitions')
        .select('*')
        .order('display_order')
        .order('name')
      if (error) throw error
      return data
    },
    staleTime: 60 * 1000,
  })
}

/** The DB trigger enforces type/dropdown/required rules; this maps form values
 * to the right typed column. */
export function attributeValueColumn(
  dataType: AttributeDataType,
): 'value_text' | 'value_number' | 'value_boolean' | 'value_date' {
  switch (dataType) {
    case 'TEXT':
    case 'DROPDOWN':
      return 'value_text'
    case 'NUMBER':
      return 'value_number'
    case 'BOOLEAN':
      return 'value_boolean'
    case 'DATE':
      return 'value_date'
  }
}

export function attributeValueOf(
  value: AttributeValue | undefined,
  dataType: AttributeDataType,
): string | number | boolean | null {
  if (!value) return null
  switch (dataType) {
    case 'TEXT':
    case 'DROPDOWN':
      return value.value_text
    case 'NUMBER':
      return value.value_number
    case 'BOOLEAN':
      return value.value_boolean
    case 'DATE':
      return value.value_date
  }
}

export function useProductAttributeValues(productId: string) {
  return useQuery({
    queryKey: attributeKeys.values(productId),
    enabled: Boolean(productId),
    queryFn: async (): Promise<AttributeValue[]> => {
      const { data, error } = await supabase
        .from('product_attribute_values')
        .select('*')
        .eq('product_id', productId)
      if (error) throw error
      return data
    },
  })
}

export function useAttributeDefMutations() {
  const queryClient = useQueryClient()
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: attributeKeys.defs })
    void queryClient.invalidateQueries({ queryKey: ['products'] })
  }

  async function companyId(): Promise<string> {
    const { data, error } = await supabase.from('profiles').select('company_id').maybeSingle()
    if (error) throw error
    if (!data) throw new Error('No profile')
    return data.company_id
  }

  const create = useMutation({
    mutationFn: async (values: AttributeDefValues) => {
      const payload = {
        company_id: await companyId(),
        name: values.name,
        data_type: values.data_type,
        is_required: values.is_required,
        is_active: values.is_active,
        options: values.data_type === 'DROPDOWN' ? values.options : null,
        display_order: values.display_order,
      }
      const { data, error } = await supabase
        .from('product_attribute_definitions')
        .insert(payload)
        .select('*')
        .single()
      if (error) throw error
      return data
    },
    onSuccess: invalidate,
  })

  const update = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: AttributeDefValues }) => {
      const payload = {
        name: values.name,
        is_required: values.is_required,
        is_active: values.is_active,
        options: values.data_type === 'DROPDOWN' ? values.options : null,
        display_order: values.display_order,
      }
      const { data, error } = await supabase
        .from('product_attribute_definitions')
        .update(payload)
        .eq('id', id)
        .select('*')
        .single()
      if (error) throw error
      return data
    },
    onSuccess: invalidate,
  })

  const deactivate = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase
        .from('product_attribute_definitions')
        .update({ is_active: isActive })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  return { create, update, deactivate }
}

/** Replace all attribute values of a product with the given map (attributeId -> value). */
export function useSetProductAttributes(productId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (values: Map<string, string | number | boolean>) => {
      // Only owner can write values (RLS). Build rows by attribute type.
      const defs = (
        await supabase.from('product_attribute_definitions').select('*')
      ).data
      if (!defs) throw new Error('Attribute definitions unavailable')

      const keepIds = new Set(values.keys())
      const rows: {
        product_id: string
        attribute_id: string
        value_text?: string
        value_number?: number
        value_boolean?: boolean
        value_date?: string
      }[] = []
      for (const def of defs) {
        if (!keepIds.has(def.id)) continue
        const v = values.get(def.id)!
        switch (def.data_type) {
          case 'TEXT':
          case 'DROPDOWN':
            rows.push({ product_id: productId, attribute_id: def.id, value_text: String(v) })
            break
          case 'NUMBER':
            rows.push({ product_id: productId, attribute_id: def.id, value_number: Number(v) })
            break
          case 'BOOLEAN':
            rows.push({ product_id: productId, attribute_id: def.id, value_boolean: Boolean(v) })
            break
          case 'DATE':
            rows.push({ product_id: productId, attribute_id: def.id, value_date: String(v) })
            break
        }
      }

      // Replace strategy: delete removed + upsert provided (trigger validates).
      const { data: existing } = await supabase
        .from('product_attribute_values')
        .select('attribute_id')
        .eq('product_id', productId)
      const existingIds = new Set((existing ?? []).map((r) => r.attribute_id))
      const toDelete = [...existingIds].filter((id) => !keepIds.has(id))
      if (toDelete.length > 0) {
        const { error } = await supabase
          .from('product_attribute_values')
          .delete()
          .eq('product_id', productId)
          .in('attribute_id', toDelete)
        if (error) throw error
      }
      if (rows.length > 0) {
        const { error } = await supabase
          .from('product_attribute_values')
          .upsert(rows, { onConflict: 'product_id,attribute_id' })
        if (error) throw error
      }
    },
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: attributeKeys.values(productId) }),
  })
}
