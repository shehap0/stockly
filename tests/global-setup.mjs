// Vitest globalSetup: ensures the local Supabase stack is up and exports
// its environment (URL/anon/service keys) into process.env for the test run.
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

const MAX_WAIT_MS = 180_000

function supabaseEnv() {
  const out = execFileSync('supabase', ['status', '-o', 'env'], {
    encoding: 'utf8',
    cwd: process.cwd(),
  })
  const env = {}
  for (const line of out.split('\n')) {
    const m = line.match(/^([A-Z_0-9]+)="(.*)"/)
    if (m) env[m[1]] = m[2]
  }
  return env
}

export default async function globalSetup() {
  const start = Date.now()
  let env = null
  let lastError = null

  while (Date.now() - start < MAX_WAIT_MS) {
    try {
      const candidate = supabaseEnv()
      if (candidate.API_URL && candidate.ANON_KEY) {
        // health check REST endpoint
        const res = await fetch(`${candidate.API_URL}/rest/v1/`, {
          headers: { apikey: candidate.ANON_KEY },
          signal: AbortSignal.timeout(5000),
        })
        if (res.status < 500) {
          env = candidate
          break
        }
        lastError = new Error(`REST health check status ${res.status}`)
      }
    } catch (e) {
      lastError = e
    }
    await new Promise((r) => setTimeout(r, 3000))
  }

  if (!env) {
    throw new Error(
      `Supabase local stack not reachable after ${MAX_WAIT_MS / 1000}s. ` +
        `Run \`npm run db:start\` first. Last error: ${lastError?.message ?? 'unknown'}`,
    )
  }

  // Write to a runtime file: globalSetup's process.env changes do NOT reach
  // test workers, and vitest loads .env files which would win otherwise.
  const runtimeEnv = {
    url: env.API_URL,
    anonKey: env.ANON_KEY,
    serviceRoleKey: env.SERVICE_ROLE_KEY,
  }
  writeFileSync(
    join(process.cwd(), 'tests', '.supabase-env.json'),
    JSON.stringify(runtimeEnv, null, 2),
  )

  process.env.VITE_SUPABASE_URL = env.API_URL
  process.env.VITE_SUPABASE_ANON_KEY = env.ANON_KEY
  process.env.SUPABASE_SERVICE_ROLE_KEY = env.SERVICE_ROLE_KEY
}
