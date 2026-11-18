import { describe, expect, it } from 'vitest'
import {
  anonClient,
  clientFor,
  adminClient,
  pgError,
  seedEmails,
} from '../helpers'

describe('auth', () => {
  it('seeded users can sign in', async () => {
    for (const who of [
      'owner',
      'managerBr1',
      'managerBr2',
      'employeeBr1',
      'employeeBr2',
    ] as const) {
      const client = await clientFor(who)
      const { data, error } = await client.auth.getUser()
      expect(error).toBeNull()
      expect(data.user?.email).toBe(seedEmails[who])
    }
  })

  it('rejects wrong password', async () => {
    const { error } = await anonClient().auth.signInWithPassword({
      email: seedEmails.owner,
      password: 'wrong-password',
    })
    expect(error).not.toBeNull()
  })
})

describe('RLS: profiles & branches visibility', () => {
  it('employee sees own profile but cannot change role/branch', async () => {
    const client = await clientFor('employeeBr1')
    // Branch staff can read their own profile, but not other staff contact details.
    const { data: profiles, error } = await client.from('profiles').select('*')
    expect(error).toBeNull()
    const own = profiles?.find((p) => p.full_name === 'Omar Zeidan')
    expect(own).not.toBeNull()
    expect(profiles).toHaveLength(1)
    expect(own?.full_name).toBe('Omar Zeidan')

    // Self-update is allowed by policy for full_name only; the guard trigger
    // must reject role/branch/activation changes.
    const roleAttempt = await client
      .from('profiles')
      .update({ role: 'OWNER' })
      .eq('id', own!.id)
    expect(roleAttempt.error).not.toBeNull()

    const branchAttempt = await client
      .from('profiles')
      .update({ branch_id: crypto.randomUUID() })
      .eq('id', own!.id)
    expect(branchAttempt.error).not.toBeNull()

    // Renaming yourself is fine.
    const nameAttempt = await client
      .from('profiles')
      .update({ full_name: 'Omar Z. Renamed' })
      .eq('id', own!.id)
    expect(nameAttempt.error).toBeNull()
    const restore = await client
      .from('profiles')
      .update({ full_name: 'Omar Zeidan' })
      .eq('id', own!.id)
    expect(restore.error).toBeNull()
  })

  it('anon sees nothing', async () => {
    const { data, error } = await anonClient().from('branches').select('*')
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('owner can deactivate a user; deactivated user loses data access', async () => {
    const admin = adminClient()
    const client = await clientFor('employeeBr2')
    const { data: profile } = await admin.from('profiles').select('*').maybeSingle()
    // find employeeBr2 profile
    const { data: emp2 } = await admin
      .from('profiles')
      .select('id, is_active, full_name')
      .eq('full_name', 'Kareem Adel')
      .maybeSingle()
    expect(emp2).not.toBeNull()

    // sanity: employee currently reads branches
    const before = await client.from('branches').select('id')
    expect(before.error).toBeNull()
    expect(before.data?.length).toBeGreaterThan(0)

    // deactivate (as owner session, not service role, to exercise RLS)
    const owner = await clientFor('owner')
    const upd = await owner
      .from('profiles')
      .update({ is_active: false })
      .eq('id', emp2!.id)
    expect(upd.error).toBeNull()

    // deactivated employee is cut off
    const after = await client.from('branches').select('id')
    expect(after.data).toEqual([])

    // restore
    const restore = await admin
      .from('profiles')
      .update({ is_active: true })
      .eq('id', emp2!.id)
    expect(restore.error).toBeNull()
    void profile
  })
})

describe('RLS: cross-branch visibility rules', () => {
  it('branch staff can see all branches (availability requirement)', async () => {
    const client = await clientFor('employeeBr1')
    const { data, error } = await client.from('branches').select('short_code')
    expect(error).toBeNull()
    expect(data?.map((b) => b.short_code).sort()).toEqual(['BR1', 'BR2'])
  })

  it('branch staff see inventory of all branches', async () => {
    const client = await clientFor('employeeBr2')
    const { data, error } = await client
      .from('branch_inventory')
      .select('branch_id, product_id, quantity')
    expect(error).toBeNull()
    expect(data?.length).toBeGreaterThan(5)
  })

  it('employee sees only own-branch sales', async () => {
    const emp1 = await clientFor('employeeBr1')
    const { data: br1 } = await emp1.from('branches').select('id').eq('short_code', 'BR1').maybeSingle()
    const { data: sales, error } = await emp1
      .from('sales')
      .select('id, branch_id')
    expect(error).toBeNull()
    for (const s of sales ?? []) {
      expect(s.branch_id).toBe(br1!.id)
    }
  })

  it('owner sees sales of all branches', async () => {
    const owner = await clientFor('owner')
    const { data, error } = await owner
      .from('sales')
      .select('id, sale_number')
    expect(error).toBeNull()
    const numbers = new Set((data ?? []).map((s) => s.sale_number.slice(0, 3)))
    expect(numbers).toEqual(new Set(['BR1', 'BR2']))
  })
})

describe('stock guard: direct writes rejected', () => {
  it('employee cannot update inventory rows directly (RLS filters, no change)', async () => {
    const emp1 = await clientFor('employeeBr1')
    const { data: rows } = await emp1
      .from('branch_inventory')
      .select('id, quantity')
      .limit(1)
    expect(rows?.length).toBe(1)
    const before = rows![0]!.quantity
    await emp1
      .from('branch_inventory')
      .update({ quantity: before + 100 })
      .eq('id', rows![0]!.id)
    const { data: after } = await emp1
      .from('branch_inventory')
      .select('quantity')
      .eq('id', rows![0]!.id)
      .single()
    expect(after!.quantity).toBe(before)
  })

  it('manager quantity changes hit the RPC-only guard trigger', async () => {
    const mgr = await clientFor('managerBr1')
    const { data: me } = await mgr
      .from('profiles')
      .select('branch_id')
      .eq('id', (await mgr.auth.getUser()).data.user!.id)
      .single()
    const { data: rows } = await mgr
      .from('branch_inventory')
      .select('id, quantity')
      .eq('branch_id', me!.branch_id!)
      .limit(1)
    expect(rows?.length).toBe(1)
    const attempt = await mgr
      .from('branch_inventory')
      .update({ quantity: (rows![0]!.quantity ?? 0) + 100 })
      .eq('id', rows![0]!.id)
    const err = pgError(attempt.error)
    expect(err.message).toMatch(/add_stock|adjust_stock|create_sale|void_sale/)
  })

  it('employee cannot insert inventory movements directly', async () => {
    const emp1 = await clientFor('employeeBr1')
    const { data: row } = await emp1
      .from('branch_inventory')
      .select('branch_id, product_id')
      .limit(1)
    const attempt = await emp1.from('inventory_movements').insert({
      branch_id: row![0]!.branch_id,
      product_id: row![0]!.product_id,
      movement_type: 'STOCK_ADDITION',
      quantity_change: 10,
      previous_quantity: 0,
      new_quantity: 10,
    })
    expect(attempt.error).not.toBeNull()
  })

  it('audit logs are immutable (owner read-only; updates affect 0 rows)', async () => {
    const owner = await clientFor('owner')
    const { data: logs } = await owner.from('audit_logs').select('id, action').limit(1)
    expect(logs?.length).toBe(1)
    const target = logs![0]!

    // No UPDATE/DELETE policies → statement succeeds but affects nothing.
    const upd = await owner
      .from('audit_logs')
      .update({ action: 'HACKED' })
      .eq('id', target.id)
      .select('id')
    expect(upd.error).toBeNull()
    expect(upd.data).toEqual([])

    const del = await owner.from('audit_logs').delete().eq('id', target.id).select('id')
    expect(del.error).toBeNull()
    expect(del.data).toEqual([])

    const { data: after } = await owner
      .from('audit_logs')
      .select('action')
      .eq('id', target.id)
      .maybeSingle()
    expect(after?.action).toBe(target.action)
  })

  it('inactive users cannot read data (covered) and movement history is branch-scoped', async () => {
    const emp1 = await clientFor('employeeBr1')
    const { data: br1 } = await emp1.from('branches').select('id').eq('short_code', 'BR1').maybeSingle()
    const { data: br2 } = await emp1.from('branches').select('id').eq('short_code', 'BR2').maybeSingle()
    const { data: m1, error: e1 } = await emp1
      .from('inventory_movements')
      .select('id')
      .eq('branch_id', br1!.id)
    expect(e1).toBeNull()
    expect(m1?.length).toBeGreaterThan(0)
    const { data: m2, error: e2 } = await emp1
      .from('inventory_movements')
      .select('id')
      .eq('branch_id', br2!.id)
    expect(e2).toBeNull()
    expect(m2).toEqual([])
  })
})
