import { describe, it, expect, afterAll } from 'vitest'
import { anonClient, adminClient, clientFor, pgError } from '../helpers'

type Client = Awaited<ReturnType<typeof clientFor>>

const TEST_PREFIX = 'Test part inv'

async function companyIdOf(client: Client): Promise<string> {
  const { data: userData } = await client.auth.getUser()
  if (!userData?.user) throw new Error('no session')
  const { data } = await client
    .from('profiles')
    .select('company_id')
    .eq('id', userData.user.id)
    .maybeSingle()
  if (!data) throw new Error('no profile')
  return data.company_id
}

async function branchIds(client: Client): Promise<{ br1: string; br2: string }> {
  const { data, error } = await client
    .from('branches')
    .select('id, short_code')
    .order('short_code')
  if (error) throw error
  const byCode = new Map(data.map((b) => [b.short_code, b.id]))
  return { br1: byCode.get('BR1')!, br2: byCode.get('BR2')! }
}

async function createTestProduct(owner: Client): Promise<string> {
  const { data, error } = await owner
    .from('products')
    .insert({
      company_id: await companyIdOf(owner),
      name: `${TEST_PREFIX} ${Math.random().toString(36).slice(2, 8)}`,
      selling_price: 100,
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

afterAll(async () => {
  const admin = adminClient()
  const { data: products } = await admin
    .from('products')
    .select('id')
    .like('name', `${TEST_PREFIX}%`)
  const ids = (products ?? []).map((p) => p.id)
  if (ids.length === 0) return
  await admin.from('inventory_movements').delete().in('product_id', ids)
  await admin.from('branch_inventory').delete().in('product_id', ids)
  await admin.from('products').delete().in('id', ids)
})

describe('M3 inventory: add stock', () => {
  it('employee can add stock to their own branch and a movement is recorded', async () => {
    const owner = await clientFor('owner')
    const employee = await clientFor('employeeBr1')
    const { br1 } = await branchIds(employee)
    const productId = await createTestProduct(owner)

    const { data, error } = await employee.rpc('add_stock', {
      p_branch_id: br1,
      p_product_id: productId,
      p_quantity: 5,
      p_unit_purchase_cost: 40,
      p_reason: 'Delivery',
    })
    expect(error).toBeNull()
    // first ever stock for this branch/product is INITIAL_STOCK
    expect(data!.movement_type).toBe('INITIAL_STOCK')
    expect(data!.quantity_change).toBe(5)
    expect(data!.previous_quantity).toBe(0)
    expect(data!.new_quantity).toBe(5)

    const more = await employee.rpc('add_stock', {
      p_branch_id: br1,
      p_product_id: productId,
      p_quantity: 2,
    })
    expect(more.error).toBeNull()
    expect(more.data!.movement_type).toBe('STOCK_ADDITION')
    expect(more.data!.previous_quantity).toBe(5)
    expect(more.data!.new_quantity).toBe(7)

    const inv = await employee
      .from('branch_inventory')
      .select('quantity')
      .eq('branch_id', br1)
      .eq('product_id', productId)
      .single()
    expect(inv.error).toBeNull()
    expect(inv.data!.quantity).toBe(7)
  })

  it('is idempotent: same key does not double-apply', async () => {
    const owner = await clientFor('owner')
    const employee = await clientFor('employeeBr1')
    const { br1 } = await branchIds(employee)
    const productId = await createTestProduct(owner)
    const key = crypto.randomUUID()

    const first = await employee.rpc('add_stock', {
      p_branch_id: br1,
      p_product_id: productId,
      p_quantity: 3,
      p_idempotency_key: key,
    })
    expect(first.error).toBeNull()

    const second = await employee.rpc('add_stock', {
      p_branch_id: br1,
      p_product_id: productId,
      p_quantity: 3,
      p_idempotency_key: key,
    })
    expect(second.error).toBeNull()
    expect(second.data!.id).toBe(first.data!.id)
    expect(second.data!.new_quantity).toBe(3)

    const inv = await employee
      .from('branch_inventory')
      .select('quantity')
      .eq('branch_id', br1)
      .eq('product_id', productId)
      .single()
    expect(inv.data!.quantity).toBe(3)
  })

  it('rejects zero/negative quantity, negative cost, inactive products and foreign branches', async () => {
    const owner = await clientFor('owner')
    const employee = await clientFor('employeeBr1')
    const { br1, br2 } = await branchIds(employee)
    const productId = await createTestProduct(owner)

    const zero = await employee.rpc('add_stock', {
      p_branch_id: br1, p_product_id: productId, p_quantity: 0,
    })
    expect(zero.error).not.toBeNull()
    expect(pgError(zero.error!).code).toBe('23514')

    const negCost = await employee.rpc('add_stock', {
      p_branch_id: br1, p_product_id: productId, p_quantity: 1, p_unit_purchase_cost: -1,
    })
    expect(negCost.error).not.toBeNull()
    expect(pgError(negCost.error!).code).toBe('23514')

    const foreign = await employee.rpc('add_stock', {
      p_branch_id: br2, p_product_id: productId, p_quantity: 1,
    })
    expect(foreign.error).not.toBeNull()
    expect(pgError(foreign.error!).code).toBe('42501')

    const prod = await createTestProduct(owner)
    await owner.from('products').update({ is_active: false }).eq('id', prod)
    const inactive = await employee.rpc('add_stock', {
      p_branch_id: br1, p_product_id: prod, p_quantity: 1,
    })
    expect(inactive.error).not.toBeNull()
    expect(pgError(inactive.error!).code).toBe('P0002')

    const missing = await employee.rpc('add_stock', {
      p_branch_id: br1,
      p_product_id: '00000000-0000-0000-0000-000000000009',
      p_quantity: 1,
    })
    expect(missing.error).not.toBeNull()
    expect(pgError(missing.error!).code).toBe('P0002')
  })
})

describe('M3 inventory: adjustments', () => {
  it('owner can record a damage adjustment with a reason', async () => {
    const owner = await clientFor('owner')
    const { br1 } = await branchIds(owner)
    const productId = await createTestProduct(owner)

    await owner.rpc('add_stock', { p_branch_id: br1, p_product_id: productId, p_quantity: 10 })

    const { data, error } = await owner.rpc('adjust_stock', {
      p_branch_id: br1,
      p_product_id: productId,
      p_quantity_change: -2,
      p_movement_type: 'DAMAGE',
      p_reason: 'Broken during handling',
    })
    expect(error).toBeNull()
    expect(data!.movement_type).toBe('DAMAGE')
    expect(data!.previous_quantity).toBe(10)
    expect(data!.new_quantity).toBe(8)
  })

  it('requires a reason and rejects zero/downward-overflow/invalid types', async () => {
    const owner = await clientFor('owner')
    const { br1 } = await branchIds(owner)
    const productId = await createTestProduct(owner)
    await owner.rpc('add_stock', { p_branch_id: br1, p_product_id: productId, p_quantity: 2 })

    const noReason = await owner.rpc('adjust_stock', {
      p_branch_id: br1, p_product_id: productId,
      p_quantity_change: -1, p_movement_type: 'DAMAGE', p_reason: '',
    })
    expect(noReason.error).not.toBeNull()
    expect(pgError(noReason.error!).code).toBe('23514')

    const zero = await owner.rpc('adjust_stock', {
      p_branch_id: br1, p_product_id: productId,
      p_quantity_change: 0, p_movement_type: 'MANUAL_ADJUSTMENT', p_reason: 'x',
    })
    expect(zero.error).not.toBeNull()
    expect(pgError(zero.error!).code).toBe('23514')

    const overflow = await owner.rpc('adjust_stock', {
      p_branch_id: br1, p_product_id: productId,
      p_quantity_change: -5, p_movement_type: 'MANUAL_ADJUSTMENT', p_reason: 'x',
    })
    expect(overflow.error).not.toBeNull()
    expect(pgError(overflow.error!).code).toBe('23514')

    const badType = await owner.rpc('adjust_stock', {
      p_branch_id: br1, p_product_id: productId,
      p_quantity_change: 1, p_movement_type: 'SALE', p_reason: 'x',
    })
    expect(badType.error).not.toBeNull()
    expect(pgError(badType.error!).code).toBe('23514')
  })

  it('employees cannot adjust stock or change thresholds', async () => {
    const owner = await clientFor('owner')
    const employee = await clientFor('employeeBr1')
    const { br1 } = await branchIds(employee)
    const productId = await createTestProduct(owner)
    await employee.rpc('add_stock', { p_branch_id: br1, p_product_id: productId, p_quantity: 4 })

    const adj = await employee.rpc('adjust_stock', {
      p_branch_id: br1, p_product_id: productId,
      p_quantity_change: -1, p_movement_type: 'DAMAGE', p_reason: 'x',
    })
    expect(adj.error).not.toBeNull()
    expect(pgError(adj.error!).code).toBe('42501')

    const thr = await employee.rpc('set_low_stock_threshold', {
      p_branch_id: br1, p_product_id: productId, p_threshold: 3,
    })
    expect(thr.error).not.toBeNull()
    expect(pgError(thr.error!).code).toBe('42501')
  })

  it('direct quantity updates are blocked even for managers (RPC-only)', async () => {
    const owner = await clientFor('owner')
    const manager = await clientFor('managerBr1')
    const { br1 } = await branchIds(manager)
    const productId = await createTestProduct(owner)
    await manager.rpc('add_stock', { p_branch_id: br1, p_product_id: productId, p_quantity: 7 })

    const direct = await manager
      .from('branch_inventory')
      .update({ quantity: 1000 })
      .eq('branch_id', br1)
      .eq('product_id', productId)
    expect(direct.error).not.toBeNull()

    const inv = await manager
      .from('branch_inventory')
      .select('quantity')
      .eq('branch_id', br1)
      .eq('product_id', productId)
      .single()
    expect(inv.data!.quantity).toBe(7)
  })
})

describe('M3 inventory: thresholds', () => {
  it('only the owner can set a threshold; employees cannot update it directly', async () => {
    const owner = await clientFor('owner')
    const employee = await clientFor('employeeBr1')
    const { br1 } = await branchIds(owner)
    const productId = await createTestProduct(owner)
    await owner.rpc('add_stock', { p_branch_id: br1, p_product_id: productId, p_quantity: 2 })

    const set = await owner.rpc('set_low_stock_threshold', {
      p_branch_id: br1, p_product_id: productId, p_threshold: 5,
    })
    expect(set.error).toBeNull()
    expect(set.data!.low_stock_threshold).toBe(5)

    const negative = await owner.rpc('set_low_stock_threshold', {
      p_branch_id: br1, p_product_id: productId, p_threshold: -1,
    })
    expect(negative.error).not.toBeNull()
    expect(pgError(negative.error!).code).toBe('23514')

    // employee: RLS filters the update silently → value unchanged
    const direct = await employee
      .from('branch_inventory')
      .update({ low_stock_threshold: 99 })
      .eq('branch_id', br1)
      .eq('product_id', productId)
    expect(direct.error).toBeNull()
    const check = await owner
      .from('branch_inventory')
      .select('low_stock_threshold')
      .eq('branch_id', br1)
      .eq('product_id', productId)
      .single()
    expect(check.data!.low_stock_threshold).toBe(5)
  })
})

describe('M3 inventory: visibility and scoping', () => {
  it('staff can view other branches stock but only their own movement history', async () => {
    const owner = await clientFor('owner')
    const employeeBr1 = await clientFor('employeeBr1')
    const employeeBr2 = await clientFor('employeeBr2')
    const { br1, br2 } = await branchIds(employeeBr1)
    const productId = await createTestProduct(owner)
    await employeeBr1.rpc('add_stock', { p_branch_id: br1, p_product_id: productId, p_quantity: 2 })
    await employeeBr2.rpc('add_stock', { p_branch_id: br2, p_product_id: productId, p_quantity: 9 })

    // cross-branch availability is a business requirement
    const crossView = await employeeBr1
      .from('branch_inventory')
      .select('quantity')
      .eq('branch_id', br2)
      .eq('product_id', productId)
      .single()
    expect(crossView.error).toBeNull()
    expect(crossView.data!.quantity).toBe(9)

    // movements of BR2 are not visible to BR1 staff
    const br2Movements = await employeeBr1
      .from('inventory_movements')
      .select('id')
      .eq('branch_id', br2)
      .eq('product_id', productId)
    expect(br2Movements.error).toBeNull()
    expect(br2Movements.data).toEqual([])

    const ownMovements = await employeeBr1
      .from('inventory_movements')
      .select('id')
      .eq('branch_id', br1)
      .eq('product_id', productId)
    expect(ownMovements.data!.length).toBe(1)

    // owner sees everything
    const ownerMovements = await owner
      .from('inventory_movements')
      .select('id')
      .eq('product_id', productId)
    expect(ownerMovements.data!.length).toBe(2)
  })

  it('anon cannot read inventory or movements', async () => {
    const client = anonClient()
    const inv = await client.from('branch_inventory').select('id').limit(1)
    expect(inv.data).toEqual([])
    const mov = await client.from('inventory_movements').select('id').limit(1)
    expect(mov.data).toEqual([])
  })
})
