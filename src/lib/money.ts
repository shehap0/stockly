import type { Enums } from './database.types'

export type Branch = import('./database.types').Tables['branches']['Row']
export type Profile = import('./database.types').Tables['profiles']['Row']

const egpFormatter = new Intl.NumberFormat('en-EG', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** Format a numeric string (as returned by Postgres `numeric`) as EGP. */
export function formatMoney(numericString: string | number | null | undefined): string {
  if (numericString === null || numericString === undefined || numericString === '') return '—'
  const n = typeof numericString === 'string' ? Number(numericString) : numericString
  if (!Number.isFinite(n)) return '—'
  return `${egpFormatter.format(n)} EGP`
}

export function roleLabel(role: Enums['user_role']): string {
  switch (role) {
    case 'OWNER':
      return 'Owner'
    case 'BRANCH_MANAGER':
      return 'Employee'
    case 'BRANCH_EMPLOYEE':
      return 'Employee'
  }
}
