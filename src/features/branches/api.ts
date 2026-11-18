import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Branch } from '@/lib/database.types'

export const branchKeys = {
  all: ['branches'] as const,
}

export function useBranches() {
  return useQuery({
    queryKey: ['branches'],
    queryFn: async (): Promise<Branch[]> => {
      const { data, error } = await supabase
        .from('branches')
        .select('*')
        .eq('is_active', true)
        .order('short_code')
      if (error) throw error
      return data
    },
    staleTime: 5 * 60 * 1000,
  })
}
