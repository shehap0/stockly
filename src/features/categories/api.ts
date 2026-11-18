import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { TableRow } from '@/lib/database.types'

export type Category = TableRow<'product_categories'>

export const categoryKeys = {
  all: ['categories'] as const,
}

export function useCategories() {
  return useQuery({
    queryKey: categoryKeys.all,
    queryFn: async (): Promise<Category[]> => {
      const { data, error } = await supabase
        .from('product_categories')
        .select('*')
        .order('name')
      if (error) throw error
      return data
    },
    staleTime: 60 * 1000,
  })
}

export function useCategoryMutations() {
  const queryClient = useQueryClient()
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: categoryKeys.all })
    void queryClient.invalidateQueries({ queryKey: ['products'] })
  }

  const create = useMutation({
    mutationFn: async (input: {
      name: string
      description?: string
      parent_category_id?: string | null
    }) => {
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError) throw userError
      if (!user) throw new Error('No signed-in user')
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('company_id, role')
        .eq('id', user.id)
        .single()
      if (profileError) throw profileError
      if (profile.role !== 'OWNER') throw new Error('Only the owner can manage categories.')
      const { data, error } = await supabase
        .from('product_categories')
        .insert({
          company_id: profile.company_id,
          name: input.name,
          description: input.description || null,
          parent_category_id: input.parent_category_id || null,
        })
        .select('*')
        .single()
      if (error) throw error
      return data
    },
    onSuccess: invalidate,
  })

  const update = useMutation({
    mutationFn: async ({
      id,
      name,
      description,
      parent_category_id,
      is_active,
    }: {
      id: string
      name?: string
      description?: string | null
      parent_category_id?: string | null
      is_active?: boolean
    }) => {
      const { data, error } = await supabase
        .from('product_categories')
        .update({
          ...(name !== undefined ? { name } : {}),
          ...(description !== undefined ? { description: description || null } : {}),
          ...(parent_category_id !== undefined ? { parent_category_id: parent_category_id || null } : {}),
          ...(is_active !== undefined ? { is_active } : {}),
        })
        .eq('id', id)
        .select('*')
        .single()
      if (error) throw error
      return data
    },
    onSuccess: invalidate,
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('product_categories').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  return { create, update, remove }
}
