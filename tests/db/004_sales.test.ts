import { describe, it, expect, afterAll } from 'vitest'
import { adminClient, clientFor, pgError } from '../helpers'

type Client = Awaited<ReturnType<typeof clientFor>>

const TEST_PREFIX = 'Test part sale'
const createdSaleIds: string[] = []

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
  const { data, error } = await client.from('branches').select('id, short_code').order('short_code')
  if (error) throw error
  const m = new Map(data.map((b) => [b.short_code, b.id]))
  return { br1: m.get('BR1')!, br2: m.get('BR2')! }
}

async function createTestProduct(owner: Client, price = 100): Promise<string> {
  const { data, error } = await owner
    .from('products')
    .insert({
      company_id: await companyIdOf(owner),
      name: `${TEST_PREFIX} ${Math.random().toString(36).slice(2, 8)}`,
      selling_price: price,
      purchase_cost: 60,
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

async function stockQuantity(client: Client, branchId: string, productId: string) {
  const { data } = await client
    .from('branch_inventory')
    .select('quantity')
    .eq('branch_id', branchId)
    .eq('product_id', productId)
    .maybeSingle()
  return data?.quantity ?? 0
}

async function makeSale(
  client: Client,
  branchId: string,
  items: { product_id: string; quantity: number }[],
  extra: Partial<{
    payment: 'CASH' | 'CARD'
    discountType: 'NONE' | 'FIXED' | 'PERCENT'
    discountValue: number
    customerId: string | null
    idempotencyKey: string
  }> = {},
) {
  return client.rpc('create_sale', {
    p_branch_id: branchId,
    p_items: items,
    p_payment_method: extra.payment ?? 'CASH',
    p_discount_type: extra.discountType ?? 'NONE',
    p_discount_value: extra.discountValue ?? 0,
    p_customer_id: extra.customerId ?? undefined,
    p_idempotency_key: extra.idempotencyKey ?? crypto.randomUUID(),
  })
}

afterAll(async () => {
  const admin = adminClient()
  const { data: products } = await admin
    .from('products')
    .select('id')
    .like('name', `${TEST_PREFIX}%`)
  const productIds = (products ?? []).map((p) => p.id)

  if (createdSaleIds.length > 0) {
    await admin.from('sale_items').delete().in('sale_id', createdSaleIds)
    await admin.from('sales').delete().in('id', createdSaleIds)
  }
  if (productIds.length > 0) {
    await admin.from('inventory_movements').delete().in('product_id', productIds)
    await admin.from('branch_inventory').delete().in('product_id', productIds)
    await admin.from('products').delete().in('id', productIds)
  }
})

describe('M4 sales: create_sale', () => {
  it('employee completes a cash sale: totals, snapshot, stock, movement', async () => {
    const owner = await clientFor('owner')
    const employee = await clientFor('employeeBr1')
    const { br1 } = await branchIds(employee)
    const productId = await createTestProduct(owner, 120)
    await employee.rpc('add_stock', { p_branch_id: br1, p_product_id: productId, p_quantity: 10 })

    const res = await makeSale(employee, br1, [{ product_id: productId, quantity: 2 }])
    expect(res.error).toBeNull()
    const payload = res.data as any
    createdSaleIds.push(payload.sale.id)

    expect(payload.sale.sale_number).toMatch(/^BR1-\d{6}$/)
    expect(payload.sale.status).toBe('COMPLETED')
    expect(payload.sale.payment_method).toBe('CASH')
    expect(Number(payload.sale.subtotal)).toBe(240)
    expect(Number(payload.sale.discount_amount)).toBe(0)
    expect(Number(payload.sale.total_amount)).toBe(240)
    expect(payload.items.length).toBe(1)
    expect(payload.items[0].product_name_snapshot).toContain(TEST_PREFIX)
    expect(Number(payload.items[0].unit_selling_price)).toBe(120)
    expect(payload.items[0].quantity).toBe(2)

    expect(await stockQuantity(employee, br1, productId)).toBe(8)

    const movements = await employee
      .from('inventory_movements')
      .select('movement_type, quantity_change, reference_id, reference_type')
      .eq('product_id', productId)
      .eq('movement_type', 'SALE')
    expect(movements.data!.length).toBe(1)
    expect(movements.data?.[0]?.quantity_change).toBe(-2)
    expect(movements.data?.[0]?.reference_id).toBe(payload.sale.id)
    expect(movements.data?.[0]?.reference_type).toBe('SALE')
  })

  it('is idempotent: duplicate key returns the same sale and deducts once', async () => {
    const owner = await clientFor('owner')
    const employee = await clientFor('employeeBr1')
    const { br1 } = await branchIds(employee)
    const productId = await createTestProduct(owner, 50)
    await employee.rpc('add_stock', { p_branch_id: br1, p_product_id: productId, p_quantity: 5 })
    const key = crypto.randomUUID()

    const first = await makeSale(employee, br1, [{ product_id: productId, quantity: 2 }], { idempotencyKey: key })
    expect(first.error).toBeNull()
    const saleId = (first.data as any).sale.id
    createdSaleIds.push(saleId)

    const second = await makeSale(employee, br1, [{ product_id: productId, quantity: 2 }], { idempotencyKey: key })
    expect(second.error).toBeNull()
    expect((second.data as any).sale.id).toBe(saleId)
    expect(await stockQuantity(employee, br1, productId)).toBe(3)
  })

  it('is atomic: insufficient stock leaves no sale and no movement', async () => {
    const owner = await clientFor('owner')
    const employee = await clientFor('employeeBr1')
    const { br1 } = await branchIds(employee)
    const productId = await createTestProduct(owner, 10)
    await employee.rpc('add_stock', { p_branch_id: br1, p_product_id: productId, p_quantity: 1 })

    const key = crypto.randomUUID()
    const res = await makeSale(employee, br1, [{ product_id: productId, quantity: 2 }], {
      idempotencyKey: key,
    })
    expect(res.error).not.toBeNull()
    expect(pgError(res.error!).code).toBe('23514')
    expect(res.error!.message).toMatch(/Insufficient stock/)

    expect(await stockQuantity(employee, br1, productId)).toBe(1)
    const sales = await employee
      .from('sales')
      .select('id')
      .eq('idempotency_key', key)
    expect(sales.data).toEqual([])
  })

  it('validates items and payment method', async () => {
    const owner = await clientFor('owner')
    const employee = await clientFor('employeeBr1')
    const { br1 } = await branchIds(employee)
    const p1 = await createTestProduct(owner, 10)
    const p2 = await createTestProduct(owner, 20)
    await employee.rpc('add_stock', { p_branch_id: br1, p_product_id: p1, p_quantity: 3 })
    await employee.rpc('add_stock', { p_branch_id: br1, p_product_id: p2, p_quantity: 3 })

    const empty = await employee.rpc('create_sale', {
      p_branch_id: br1, p_items: [], p_payment_method: 'CASH',
    })
    expect(pgError(empty.error!).code).toBe('23514')

    const duplicate = await makeSale(employee, br1, [
      { product_id: p1, quantity: 1 },
      { product_id: p1, quantity: 1 },
    ])
    expect(pgError(duplicate.error!).code).toBe('23514')

    const zeroQty = await makeSale(employee, br1, [{ product_id: p1, quantity: 0 }])
    expect(pgError(zeroQty.error!).code).toBe('23514')

    const badPayment = await employee.rpc('create_sale', {
      p_branch_id: br1,
      p_items: [{ product_id: p1, quantity: 1 }],
      p_payment_method: 'CHEQUE',
    })
    expect(pgError(badPayment.error!).code).toBe('23514')

    const inactive = await createTestProduct(owner, 5)
    await owner.from('products').update({ is_active: false }).eq('id', inactive)
    const inactiveRes = await makeSale(employee, br1, [{ product_id: inactive, quantity: 1 }])
    expect(pgError(inactiveRes.error!).code).toBe('P0002')
  })

  it('applies discounts with caps: manager limited, owner unlimited', async () => {
    const owner = await clientFor('owner')
    const manager = await clientFor('managerBr1')
    const { br1 } = await branchIds(manager)
    const productId = await createTestProduct(owner, 100)
    await manager.rpc('add_stock', { p_branch_id: br1, p_product_id: productId, p_quantity: 10 })

    // manager: 20% is within the seeded cap (25%)
    const okPercent = await makeSale(manager, br1, [{ product_id: productId, quantity: 2 }], {
      discountType: 'PERCENT', discountValue: 20,
    })
    expect(okPercent.error).toBeNull()
    const okPayload = okPercent.data as any
    createdSaleIds.push(okPayload.sale.id)
    expect(Number(okPayload.sale.subtotal)).toBe(200)
    expect(Number(okPayload.sale.discount_amount)).toBe(40)
    expect(Number(okPayload.sale.total_amount)).toBe(160)
    expect(okPayload.sale.discount_type).toBe('PERCENT')

    // manager: 30% exceeds the cap
    const overCap = await makeSale(manager, br1, [{ product_id: productId, quantity: 1 }], {
      discountType: 'PERCENT', discountValue: 30,
    })
    expect(overCap.error).not.toBeNull()
    expect(pgError(overCap.error!).code).toBe('42501')

    // owner: 30% allowed
    const ownerSale = await makeSale(owner, br1, [{ product_id: productId, quantity: 1 }], {
      discountType: 'PERCENT', discountValue: 30,
    })
    expect(ownerSale.error).toBeNull()
    const ownerPayload = ownerSale.data as any
    createdSaleIds.push(ownerPayload.sale.id)
    expect(Number(ownerPayload.sale.discount_amount)).toBe(30)

    // fixed discount larger than subtotal is rejected
    const tooBig = await makeSale(manager, br1, [{ product_id: productId, quantity: 1 }], {
      discountType: 'FIXED', discountValue: 500,
    })
    expect(tooBig.error).not.toBeNull()
    expect(pgError(tooBig.error!).code).toBe('23514')

    // NONE with a value is rejected
    const noneWithValue = await makeSale(manager, br1, [{ product_id: productId, quantity: 1 }], {
      discountType: 'NONE', discountValue: 5,
    })
    expect(noneWithValue.error).not.toBeNull()
    expect(pgError(noneWithValue.error!).code).toBe('23514')
  })

  it('links an existing customer and rejects unknown customers', async () => {
    const owner = await clientFor('owner')
    const employee = await clientFor('employeeBr1')
    const { br1 } = await branchIds(employee)
    const productId = await createTestProduct(owner, 40)
    await employee.rpc('add_stock', { p_branch_id: br1, p_product_id: productId, p_quantity: 3 })

    const customer = await employee
      .from('customers')
      .select('id')
      .limit(1)
      .single()
    const res = await makeSale(employee, br1, [{ product_id: productId, quantity: 1 }], {
      customerId: customer.data!.id,
    })
    expect(res.error).toBeNull()
    const payload = res.data as any
    createdSaleIds.push(payload.sale.id)
    expect(payload.sale.customer_id).toBe(customer.data!.id)

    const bogus = await makeSale(employee, br1, [{ product_id: productId, quantity: 1 }], {
      customerId: '00000000-0000-0000-0000-000000000005',
    })
    expect(bogus.error).not.toBeNull()
    expect(pgError(bogus.error!).code).toBe('P0002')
  })
})

describe('M4 sales: void_sale', () => {
  async function completedSale(client: Client, branchId: string, productId: string, qty: number) {
    const res = await makeSale(client, branchId, [{ product_id: productId, quantity: qty }])
    if (res.error) throw res.error
    const payload = res.data as any
    createdSaleIds.push(payload.sale.id)
    return payload.sale.id as string
  }

  it('employees cannot void sales; owner void restores stock with a compensating movement', async () => {
    const owner = await clientFor('owner')
    const employee = await clientFor('employeeBr1')
    const { br1 } = await branchIds(employee)
    const productId = await createTestProduct(owner, 25)
    await employee.rpc('add_stock', { p_branch_id: br1, p_product_id: productId, p_quantity: 6 })

    const saleId = await completedSale(employee, br1, productId, 2)
    expect(await stockQuantity(employee, br1, productId)).toBe(4)

    const employeeVoid = await employee.rpc('void_sale', { p_sale_id: saleId, p_reason: 'not allowed' })
    expect(employeeVoid.error).not.toBeNull()
    expect(pgError(employeeVoid.error!).code).toBe('42501')

    const voidRes = await owner.rpc('void_sale', {
      p_sale_id: saleId,
      p_reason: 'Customer changed mind',
    })
    expect(voidRes.error).toBeNull()
    const payload = voidRes.data as any
    expect(payload.sale.status).toBe('VOIDED')
    expect(payload.sale.void_reason).toBe('Customer changed mind')
    expect(await stockQuantity(employee, br1, productId)).toBe(6)

    const movements = await owner
      .from('inventory_movements')
      .select('movement_type, quantity_change')
      .eq('product_id', productId)
      .eq('movement_type', 'SALE_RETURN')
    expect(movements.data!.length).toBe(1)
    expect(movements.data?.[0]?.quantity_change).toBe(2)

    const audit = await owner
      .from('audit_logs')
      .select('action')
      .eq('entity_id', saleId)
      .eq('action', 'SALE_VOID')
    expect(audit.data!.length).toBe(1)
  })

  it('rejects double voids, missing reasons and employee voids', async () => {
    const owner = await clientFor('owner')
    const employee = await clientFor('employeeBr1')
    const { br1 } = await branchIds(owner)
    const productId = await createTestProduct(owner, 15)
    await employee.rpc('add_stock', { p_branch_id: br1, p_product_id: productId, p_quantity: 4 })
    const saleId = await completedSale(employee, br1, productId, 1)

    const noReason = await owner.rpc('void_sale', { p_sale_id: saleId, p_reason: '   ' })
    expect(noReason.error).not.toBeNull()
    expect(pgError(noReason.error!).code).toBe('23514')

    const empVoid = await employee.rpc('void_sale', { p_sale_id: saleId, p_reason: 'x' })
    expect(empVoid.error).not.toBeNull()
    expect(pgError(empVoid.error!).code).toBe('42501')

    const ok = await owner.rpc('void_sale', { p_sale_id: saleId, p_reason: 'ok' })
    expect(ok.error).toBeNull()

    const again = await owner.rpc('void_sale', { p_sale_id: saleId, p_reason: 'again' })
    expect(again.error).not.toBeNull()
    expect(pgError(again.error!).code).toBe('23514')
  })

  it('employees cannot void sales in another branch; owner can', async () => {
    const owner = await clientFor('owner')
    const managerBr1 = await clientFor('managerBr1')
    const employeeBr2 = await clientFor('employeeBr2')
    const { br2 } = await branchIds(managerBr1)
    const productId = await createTestProduct(owner, 30)
    await employeeBr2.rpc('add_stock', { p_branch_id: br2, p_product_id: productId, p_quantity: 3 })
    const saleId = await completedSale(employeeBr2, br2, productId, 1)

    const cross = await managerBr1.rpc('void_sale', { p_sale_id: saleId, p_reason: 'nope' })
    expect(cross.error).not.toBeNull()
    expect(pgError(cross.error!).code).toBe('42501')

    const ownerVoid = await owner.rpc('void_sale', { p_sale_id: saleId, p_reason: 'owner fix' })
    expect(ownerVoid.error).toBeNull()
    expect((ownerVoid.data as any).sale.status).toBe('VOIDED')
    expect(await stockQuantity(owner, br2, productId)).toBe(3)
  })
})

describe('M4 sales: visibility & RLS', () => {
  it('staff only see their branch sales; owner sees all; anon sees none', async () => {
    const owner = await clientFor('owner')
    const employeeBr1 = await clientFor('employeeBr1')
    const employeeBr2 = await clientFor('employeeBr2')
    const { br1, br2 } = await branchIds(owner)
    const p1 = await createTestProduct(owner, 10)
    await employeeBr1.rpc('add_stock', { p_branch_id: br1, p_product_id: p1, p_quantity: 2 })
    await employeeBr2.rpc('add_stock', { p_branch_id: br2, p_product_id: p1, p_quantity: 2 })

    const sale1 = await makeSale(employeeBr1, br1, [{ product_id: p1, quantity: 1 }])
    const sale2 = await makeSale(employeeBr2, br2, [{ product_id: p1, quantity: 1 }])
    createdSaleIds.push((sale1.data as any).sale.id, (sale2.data as any).sale.id)

    const br1View = await employeeBr1.from('sales').select('id, branch_id')
    expect(br1View.data!.every((s) => s.branch_id === br1)).toBe(true)
    expect(br1View.data!.some((s) => s.id === (sale1.data as any).sale.id)).toBe(true)
    expect(br1View.data!.some((s) => s.id === (sale2.data as any).sale.id)).toBe(false)

    const ownerView = await owner.from('sales').select('id').in('id', [
      (sale1.data as any).sale.id,
      (sale2.data as any).sale.id,
    ])
    expect(ownerView.data!.length).toBe(2)

    const crossPayload = await employeeBr1.rpc('sale_payload', {
      p_sale_id: (sale2.data as any).sale.id,
    })
    expect(crossPayload.data).toBeNull()

    const { anonClient } = await import('../helpers')
    const anon = anonClient()
    const anonSales = await anon.from('sales').select('id').limit(1)
    expect(anonSales.data).toEqual([])
  })

  it('sale_items are readable only through visible sales', async () => {
    const owner = await clientFor('owner')
    const employeeBr1 = await clientFor('employeeBr1')
    const employeeBr2 = await clientFor('employeeBr2')
    const { br2 } = await branchIds(owner)
    const p = await createTestProduct(owner, 12)
    await employeeBr2.rpc('add_stock', { p_branch_id: br2, p_product_id: p, p_quantity: 1 })
    const sale = await makeSale(employeeBr2, br2, [{ product_id: p, quantity: 1 }])
    const saleId = (sale.data as any).sale.id
    createdSaleIds.push(saleId)

    const itemsBr2 = await employeeBr2
      .from('sale_items')
      .select('id')
      .eq('sale_id', saleId)
    expect(itemsBr2.data!.length).toBe(1)

    const itemsBr1 = await employeeBr1
      .from('sale_items')
      .select('id')
      .eq('sale_id', saleId)
    expect(itemsBr1.data).toEqual([])
  })
})
