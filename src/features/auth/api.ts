import { supabase } from '@/lib/supabase'
import type { Profile } from '@/lib/database.types'

export async function getCurrentProfile(): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', (await supabase.auth.getUser()).data.user?.id ?? '')
    .maybeSingle()
  if (error) throw error
  return data ?? null
}

export async function signIn(identifier: string, password: string): Promise<void> {
  const value = identifier.trim()
  const credentials = value.includes('@')
    ? { email: value.toLowerCase(), password }
    : { phone: normalizePhone(value), password }
  const { error } = await supabase.auth.signInWithPassword(credentials)
  if (error) throw error
}

export function normalizePhone(input: string): string {
  const compact = input.trim().replace(/[\s()-]/g, '')
  const phone = compact.startsWith('01') ? `+20${compact.slice(1)}`
    : compact.startsWith('20') ? `+${compact}`
      : compact
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
    throw new Error('Enter a valid phone number with country code, such as +201000000001')
  }
  return phone
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function requestPasswordReset(email: string): Promise<void> {
  const redirectTo = `${window.location.origin}/reset-password`
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
  if (error) throw error
}

export async function updatePassword(newPassword: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) throw error
}
