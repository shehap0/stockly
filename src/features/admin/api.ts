import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Branch, Enums, Profile, TableRow } from '@/lib/database.types'

export type AuditLog = TableRow<'audit_logs'>
export type CompanySettings = TableRow<'company_settings'>

export const adminKeys = {
  users: ['admin', 'users'] as const,
  branches: ['admin', 'branches'] as const,
  audit: (action: string, entity: string) => ['admin', 'audit', action, entity] as const,
  settings: ['admin', 'settings'] as const,
}

export function useUsers() {
  return useQuery({
    queryKey: adminKeys.users,
    queryFn: async (): Promise<Profile[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('role')
        .order('full_name')
      if (error) throw error
      return data
    },
  })
}

export type InviteInput = {
  email: string
  phone: string
  fullName: string
  role: Enums['user_role']
  branchId: string | null
}

export function useInviteUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: InviteInput) => {
      const { data, error } = await supabase.functions.invoke('invite-user', { body: input })
      if (error) {
        const context = (error as { context?: { error?: string } }).context
        throw new Error(context?.error ?? error.message)
      }
      if (data?.error) throw new Error(data.error)
      return data as { id: string; email: string; phone: string }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminKeys.users }),
  })
}

export function useUpdateUserPhone() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { profileId: string; phone: string }) => {
      const { data, error } = await supabase.functions.invoke('invite-user', {
        body: { action: 'set-phone', profileId: input.profileId, phone: input.phone },
      })
      if (error) {
        const context = (error as { context?: { error?: string } }).context
        throw new Error(context?.error ?? error.message)
      }
      if (data?.error) throw new Error(data.error)
      return data as { id: string; phone: string }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminKeys.users }),
  })
}

export function useUpdateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id: string
      role: Enums['user_role']
      branchId: string | null
      isActive: boolean
    }) => {
      const { data, error } = await supabase
        .from('profiles')
        .update({
          role: input.role,
          branch_id: input.role === 'OWNER' ? null : input.branchId,
          is_active: input.isActive,
          updated_at: new Date().toISOString(),
        })
        .eq('id', input.id)
        .select()
      if (error) throw error
      if (!data || data.length === 0) throw new Error('Update was not permitted')
      return data[0]
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminKeys.users }),
  })
}

export function useDeleteUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (profileId: string) => {
      const { data, error } = await supabase.functions.invoke('invite-user', {
        body: { action: 'delete-user', profileId },
      })
      if (error) {
        const context = (error as { context?: { error?: string } }).context
        throw new Error(context?.error ?? error.message)
      }
      if (data?.error) throw new Error(data.error)
      return data as { id: string }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminKeys.users }),
  })
}

export function useSettings() {
  return useQuery({
    queryKey: adminKeys.settings,
    queryFn: async () => {
      const { data: company, error: companyError } = await supabase
        .from('companies')
        .select('id, name')
        .single()
      if (companyError) throw companyError
      const { data: settings, error: settingsError } = await supabase
        .from('company_settings')
        .select('*')
        .eq('company_id', company.id)
        .single()
      if (settingsError) throw settingsError
      return { company, settings }
    },
  })
}

export function useUpdateSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      companyId: string
      name: string
      currency: string
      maxDiscountPercent: number
      defaultLowStockThreshold: number | null
    }) => {
      const { error: companyError } = await supabase
        .from('companies')
        .update({ name: input.name, updated_at: new Date().toISOString() })
        .eq('id', input.companyId)
      if (companyError) throw companyError

      const { data, error } = await supabase
        .from('company_settings')
        .update({
          currency: input.currency,
          max_discount_percent: input.maxDiscountPercent,
          default_low_stock_threshold: input.defaultLowStockThreshold,
          updated_at: new Date().toISOString(),
        })
        .eq('company_id', input.companyId)
        .select()
      if (error) throw error
      if (!data || data.length === 0) throw new Error('Update was not permitted')
      return data[0]
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminKeys.settings }),
  })
}

export function useAuditLogs(action: string, entity: string) {
  return useQuery({
    queryKey: adminKeys.audit(action, entity),
    queryFn: async (): Promise<AuditLog[]> => {
      let query = supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(200)
      if (action.trim()) query = query.ilike('action', `%${action.trim()}%`)
      if (entity.trim()) query = query.ilike('entity_type', `%${entity.trim()}%`)
      const { data, error } = await query
      if (error) throw error
      return data
    },
  })
}

export function useAllBranches() {
  return useQuery({
    queryKey: adminKeys.branches,
    queryFn: async (): Promise<Branch[]> => {
      const { data, error } = await supabase.from('branches').select('*').order('short_code')
      if (error) throw error
      return data
    },
  })
}

export function useBranchMutations() {
  const queryClient = useQueryClient()
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: adminKeys.branches })
    void queryClient.invalidateQueries({ queryKey: ['branches'] })
  }

  const create = useMutation({
    mutationFn: async (input: { companyId: string; shortCode: string; name: string; address: string; phone: string }) => {
      const { data, error } = await supabase
        .from('branches')
        .insert({
          company_id: input.companyId,
          short_code: input.shortCode,
          name: input.name,
          address: input.address || null,
          phone: input.phone || null,
        })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: invalidate,
  })

  const update = useMutation({
    mutationFn: async (input: {
      id: string
      name: string
      address: string
      phone: string
      isActive: boolean
    }) => {
      const { data, error } = await supabase
        .from('branches')
        .update({
          name: input.name,
          address: input.address || null,
          phone: input.phone || null,
          is_active: input.isActive,
          updated_at: new Date().toISOString(),
        })
        .eq('id', input.id)
        .select()
      if (error) throw error
      if (!data || data.length === 0) throw new Error('Update was not permitted')
      return data[0]
    },
    onSuccess: invalidate,
  })

  return { create, update }
}
