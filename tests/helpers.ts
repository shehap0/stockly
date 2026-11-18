import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Database } from '@/lib/database.types'

/**
 * Environment resolution order:
 * 1. tests/.supabase-env.json (written by global-setup from `supabase status`)
 * 2. process.env (set by CI or the shell)
 */
function loadRuntimeEnv(): { url: string; anonKey: string; serviceRoleKey: string } {
  try {
    const raw = JSON.parse(
      readFileSync(join(process.cwd(), 'tests', '.supabase-env.json'), 'utf8'),
    ) as { url: string; anonKey: string; serviceRoleKey: string }
    if (raw.url && raw.anonKey) return raw
  } catch {
    // fall through to process.env
  }
  return {
    url: process.env.VITE_SUPABASE_URL ?? '',
    anonKey: process.env.VITE_SUPABASE_ANON_KEY ?? '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  }
}

const runtimeEnv = loadRuntimeEnv()

export const SUPABASE_URL = runtimeEnv.url
export const ANON_KEY = runtimeEnv.anonKey
export const SERVICE_ROLE_KEY = runtimeEnv.serviceRoleKey

export type Client = SupabaseClient<Database>

export const SEED_PASSWORD = 'Demo1234!'

/**
 * supabase-js polyfills a GLOBAL in-memory storage when running outside a
 * browser, which would leak sessions between clients in the same process.
 * Give every client its own isolated memory store.
 */
function makeIsolatedStorage() {
  const store = new Map<string, string>()
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
}

const emails = {
  owner: 'owner@demo.test',
  managerBr1: 'manager.br1@demo.test',
  managerBr2: 'manager.br2@demo.test',
  employeeBr1: 'employee.br1@demo.test',
  employeeBr2: 'employee.br2@demo.test',
} as const

export const seedEmails = emails

/** Client with no user (anon). */
export function anonClient(): Client {
  return createClient<Database>(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, storage: makeIsolatedStorage() },
  })
}

/** Client with the service role (bypasses RLS) — setup/teardown/verification only. */
export function adminClient(): Client {
  if (!SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY missing from environment')
  return createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, storage: makeIsolatedStorage() },
  })
}

/** Client authenticated as a seeded demo user (exercises real auth + RLS). */
export async function clientFor(
  who: keyof typeof emails,
  password = SEED_PASSWORD,
): Promise<Client> {
  const client = createClient<Database>(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, storage: makeIsolatedStorage() },
  })
  const { error } = await client.auth.signInWithPassword({
    email: emails[who],
    password,
  })
  if (error) throw new Error(`Sign-in as ${emails[who]} failed: ${error.message}`)
  return client
}

/** Extract Postgres error details from a supabase-js error. */
export function pgError(err: unknown): { message: string; code: string | null } {
  const e = err as { message?: string; code?: string }
  return { message: e?.message ?? String(err), code: e?.code ?? null }
}
