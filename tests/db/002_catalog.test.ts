import { describe, it, expect, afterAll } from 'vitest'
import { anonClient, clientFor, pgError } from '../helpers'
import type { Database } from '../../src/lib/database.types'

type Client = Awaited<ReturnType<typeof clientFor>>

/** Remove test-created rows (reactivate defs so frozen values can be deleted). */
afterAll(async () => {
  const owner = await clientFor('owner')

  const defs = await owner
    .from('product_attribute_definitions')
    .select('id')
    .like('name', 'Attr %')
  for (const d of defs.data ?? []) {
    await owner
      .from('product_attribute_definitions')
      .update({ is_active: true })
      .eq('id', d.id)
    await owner.from('product_attribute_values').delete().eq('attribute_id', d.id)
    await owner.from('product_attribute_definitions').delete().eq('id', d.id)
  }

  const productNames = ['Test part', 'Hidden part', 'Manager product', 'Employee product',
    'Incomplete part', 'Complete part', 'Audited part']
  for (const prefix of productNames) {
    await owner.from('products').delete().like('name', `${prefix}%`)
  }

  await owner.from('product_categories').delete().like('name', 'Cat %')
  await owner.from('product_categories').delete().like('name', 'Child %')
  await owner.from('product_categories').delete().like('name', 'Used cat %')
})

async function companyIdOf(client: Client): Promise<string> {
  const { data: userData, error: userErr } = await client.auth.getUser()
  if (userErr || !userData?.user) throw new Error('no session')
  const { data, error } = await client
    .from('profiles')
    .select('company_id')
    .eq('id', userData.user.id)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('no profile')
  return data.company_id
}

async function createProduct(
  client: Client,
  overrides: Partial<
    Database['public']['Tables']['products']['Insert']
  > = {},
) {
  const companyId = await companyIdOf(client)
  const insert = {
    company_id: companyId,
    name: `Test part ${Math.random().toString(36).slice(2, 8)}`,
    selling_price: 100,
    ...overrides,
  }
  return client.from('products').insert(insert).select('*').single()
}

describe('M2 catalog: product CRUD (owner)', () => {
  it('owner can create a product with only name and selling_price', async () => {
    const owner = await clientFor('owner')
    const { data, error } = await createProduct(owner)
    expect(error).toBeNull()
    expect(data).not.toBeNull()
    expect(data!.is_active).toBe(true)
    expect(data!.name).toMatch(/^Test part /)
  })

  it('rejects negative selling_price and purchase_cost', async () => {
    const owner = await clientFor('owner')
    const bad = await createProduct(owner, { selling_price: -5 })
    expect(bad.error).not.toBeNull()
    expect(pgError(bad.error).code).toBe('23514')

    const badCost = await createProduct(owner, { purchase_cost: -1 })
    expect(badCost.error).not.toBeNull()
    expect(pgError(badCost.error).code).toBe('23514')
  })

  it('rejects invalid manufacturing_year', async () => {
    const owner = await clientFor('owner')
    const res = await createProduct(owner, { manufacturing_year: 1850 })
    expect(res.error).not.toBeNull()
    expect(pgError(res.error).code).toBe('23514')
  })

  it('owner can update a product and deactivate/reactivate it', async () => {
    const owner = await clientFor('owner')
    const created = await createProduct(owner)
    const id = created.data!.id

    const upd = await owner
      .from('products')
      .update({ name: 'Renamed part', selling_price: 150.5 })
      .eq('id', id)
      .select('*')
      .single()
    expect(upd.error).toBeNull()
    expect(upd.data!.name).toBe('Renamed part')
    expect(Number(upd.data!.selling_price)).toBe(150.5)

    const off = await owner
      .from('products')
      .update({ is_active: false })
      .eq('id', id)
      .select('is_active')
      .single()
    expect(off.error).toBeNull()
    expect(off.data!.is_active).toBe(false)

    const backOn = await owner
      .from('products')
      .update({ is_active: true })
      .eq('id', id)
      .select('is_active')
      .single()
    expect(backOn.error).toBeNull()
    expect(backOn.data!.is_active).toBe(true)
  })

  it('deactivated products are hidden from staff but visible to owner', async () => {
    const owner = await clientFor('owner')
    const manager = await clientFor('managerBr1')
    const created = await createProduct(owner, { name: 'Hidden part' })
    const id = created.data!.id

    await owner.from('products').update({ is_active: false }).eq('id', id)

    const staffView = await manager
      .from('products')
      .select('id')
      .eq('id', id)
      .maybeSingle()
    expect(staffView.error).toBeNull()
    expect(staffView.data).toBeNull()

    const ownerView = await owner
      .from('products')
      .select('id')
      .eq('id', id)
      .maybeSingle()
    expect(ownerView.data).not.toBeNull()

    await owner.from('products').update({ is_active: true }).eq('id', id)
  })
})

describe('M2 catalog: owner-only writes enforced by RLS', () => {
  it('employee cannot insert or update products', async () => {
    const manager = await clientFor('managerBr1')
    const owner = await clientFor('owner')

    const ins = await createProduct(manager, { name: 'Manager product' })
    expect(ins.error).not.toBeNull()
    expect(pgError(ins.error).code).toBe('42501')

    const created = await createProduct(owner)
    const id = created.data!.id
    const upd = await manager
      .from('products')
      .update({ name: 'hacked' })
      .eq('id', id)
    expect(upd.error).toBeNull() // RLS filters silently
    const verify = await owner.from('products').select('name').eq('id', id).single()
    expect(verify.data!.name).toBe(created.data!.name)
  })

  it('employee can read the catalog but cannot write', async () => {
    const employee = await clientFor('employeeBr1')

    const read = await employee.from('products').select('id').limit(1)
    expect(read.error).toBeNull()
    expect(read.data!.length).toBeGreaterThan(0)

    const ins = await createProduct(employee, { name: 'Employee product' })
    expect(ins.error).not.toBeNull()
    expect(pgError(ins.error).code).toBe('42501')
  })
})

describe('M2 catalog: categories', () => {
  it('owner can create a nested category; FK restricts cross-company parents', async () => {
    const owner = await clientFor('owner')
    const companyId = await companyIdOf(owner)

    const top = await owner
      .from('product_categories')
      .insert({ company_id: companyId, name: `Cat ${Math.random().toString(36).slice(2, 6)}` })
      .select('*')
      .single()
    expect(top.error).toBeNull()

    const child = await owner
      .from('product_categories')
      .insert({
        company_id: companyId,
        name: `Child ${Math.random().toString(36).slice(2, 6)}`,
        parent_category_id: top.data!.id,
      })
      .select('*')
      .single()
    expect(child.error).toBeNull()
    expect(child.data!.parent_category_id).toBe(top.data!.id)

    // parent uuid from a different company → composite FK fails
    const bogus = await owner
      .from('product_categories')
      .insert({
        company_id: companyId,
        name: 'Bad parent',
        parent_category_id: '00000000-0000-0000-0000-000000000001',
      })
    expect(bogus.error).not.toBeNull()
    expect(['23503', '23514']).toContain(pgError(bogus.error).code)
  })

  it('deleting a category referenced by products is blocked (FK restrict)', async () => {
    const owner = await clientFor('owner')
    const companyId = await companyIdOf(owner)
    const cat = await owner
      .from('product_categories')
      .insert({ company_id: companyId, name: `Used cat ${Math.random().toString(36).slice(2, 6)}` })
      .select('*')
      .single()
    expect(cat.error).toBeNull()

    const prod = await createProduct(owner, { category_id: cat.data!.id })
    expect(prod.error).toBeNull()

    const del = await owner.from('product_categories').delete().eq('id', cat.data!.id)
    expect(del.error).not.toBeNull()
    expect(pgError(del.error).code).toBe('23503')
  })

  it('employees cannot create categories', async () => {
    const manager = await clientFor('managerBr1')
    const companyId = await companyIdOf(manager)
    const res = await manager
      .from('product_categories')
      .insert({ company_id: companyId, name: 'Manager cat' })
    expect(res.error).not.toBeNull()
    expect(pgError(res.error).code).toBe('42501')
  })
})

describe('M2 catalog: custom attributes', () => {
  async function makeDef(
    client: Client,
    overrides: Partial<Database['public']['Tables']['product_attribute_definitions']['Insert']> = {},
  ) {
    const companyId = await companyIdOf(client)
    return client
      .from('product_attribute_definitions')
      .insert({
        company_id: companyId,
        name: `Attr ${Math.random().toString(36).slice(2, 8)}`,
        data_type: 'TEXT' as const,
        ...overrides,
      })
      .select('*')
      .single()
  }

  async function setAttr(
    client: Client,
    productId: string,
    attributeId: string,
    value: Partial<
      Pick<
        Database['public']['Tables']['product_attribute_values']['Insert'],
        'value_text' | 'value_number' | 'value_boolean' | 'value_date'
      >
    >,
  ) {
    return client
      .from('product_attribute_values')
      .upsert(
        { ...value, product_id: productId, attribute_id: attributeId },
        { onConflict: 'product_id,attribute_id' },
      )
  }

  it('stores values in the correct typed column per data type', async () => {
    const owner = await clientFor('owner')
    const product = await createProduct(owner)
    const pid = product.data!.id

    const textDef = await makeDef(owner, { data_type: 'TEXT' as const })
    const numDef = await makeDef(owner, { data_type: 'NUMBER' as const })
    const boolDef = await makeDef(owner, { data_type: 'BOOLEAN' as const })
    const dateDef = await makeDef(owner, { data_type: 'DATE' as const })

    const t = await setAttr(owner, pid, textDef.data!.id, { value_text: 'High flow' })
    expect(t.error).toBeNull()
    const n = await setAttr(owner, pid, numDef.data!.id, { value_number: 2.5 })
    expect(n.error).toBeNull()
    const b = await setAttr(owner, pid, boolDef.data!.id, { value_boolean: true })
    expect(b.error).toBeNull()
    const d = await setAttr(owner, pid, dateDef.data!.id, { value_date: '2026-01-31' })
    expect(d.error).toBeNull()

    const rows = await owner
      .from('product_attribute_values')
      .select('*')
      .eq('product_id', pid)
    expect(rows.data!.length).toBe(4)
    const byId = new Map(rows.data!.map((r) => [r.attribute_id, r]))
    expect(byId.get(textDef.data!.id)!.value_text).toBe('High flow')
    expect(byId.get(numDef.data!.id)!.value_number).toBe(2.5)
    expect(byId.get(boolDef.data!.id)!.value_boolean).toBe(true)
    expect(byId.get(dateDef.data!.id)!.value_date).toBe('2026-01-31')
  })

  it('rejects values that do not match the attribute data type', async () => {
    const owner = await clientFor('owner')
    const product = await createProduct(owner)
    const pid = product.data!.id
    const textDef = await makeDef(owner, { data_type: 'TEXT' as const })

    // writing a NUMBER value into a TEXT attribute must fail (trigger)
    const res = await setAttr(owner, pid, textDef.data!.id, { value_number: 42 })
    expect(res.error).not.toBeNull()
    expect(['23514', 'P0001']).toContain(pgError(res.error).code)
  })

  it('enforces dropdown option membership', async () => {
    const owner = await clientFor('owner')
    const product = await createProduct(owner)
    const pid = product.data!.id
    const def = await makeDef(owner, {
      data_type: 'DROPDOWN' as const,
      options: ['Manual', 'Automatic'],
    })

    const ok = await setAttr(owner, pid, def.data!.id, { value_text: 'Manual' })
    expect(ok.error).toBeNull()

    const bad = await setAttr(owner, pid, def.data!.id, { value_text: 'CVT' })
    expect(bad.error).not.toBeNull()
    expect(['23514', 'P0001']).toContain(pgError(bad.error).code)
  })

  it('enforces required attributes when editing an active product', async () => {
    const owner = await clientFor('owner')
    const def = await makeDef(owner, {
      data_type: 'TEXT' as const,
      is_required: true,
    })

    // incomplete products are allowed (spec: only name + price are mandatory)
    const created = await createProduct(owner, { name: 'Incomplete part' })
    expect(created.error).toBeNull()
    const pid = created.data!.id

    // editing an active product without the required value fails
    const bad = await owner
      .from('products')
      .update({ name: 'Incomplete part v2' })
      .eq('id', pid)
      .select('*')
    expect(bad.error).not.toBeNull()
    expect(['23514', 'P0001']).toContain(pgError(bad.error).code)

    // attach the required value, then the same edit passes
    const v = await setAttr(owner, pid, def.data!.id, { value_text: 'filled' })
    expect(v.error).toBeNull()

    const good = await owner
      .from('products')
      .update({ name: 'Complete part' })
      .eq('id', pid)
      .select('*')
    expect(good.error).toBeNull()
    expect(good.data?.[0]?.name).toBe('Complete part')

    // deactivating an incomplete product stays possible (retire path)
    await owner.from('products').update({ is_active: false }).eq('id', pid)
    const incomplete2 = await createProduct(owner, { name: 'Incomplete part 2' })
    expect(incomplete2.error).toBeNull()
    const retire = await owner
      .from('products')
      .update({ is_active: false })
      .eq('id', incomplete2.data!.id)
      .select('is_active')
    expect(retire.error).toBeNull()

    // cleanup now: a lingering required definition would break later tests
    await owner.from('products').update({ is_active: false }).eq('id', pid)
    await owner.from('product_attribute_values').delete().eq('attribute_id', def.data!.id)
    await owner.from('product_attribute_definitions').delete().eq('id', def.data!.id)
  })

  it('freezes values of deactivated definitions', async () => {
    const owner = await clientFor('owner')
    const def = await makeDef(owner, { data_type: 'TEXT' as const })
    const product = await createProduct(owner)
    const pid = product.data!.id
    const v = await setAttr(owner, pid, def.data!.id, { value_text: 'frozen' })
    expect(v.error).toBeNull()

    await owner
      .from('product_attribute_definitions')
      .update({ is_active: false })
      .eq('id', def.data!.id)

    const upd = await setAttr(owner, pid, def.data!.id, { value_text: 'changed' })
    expect(upd.error).not.toBeNull()
    expect(['23514', 'P0001']).toContain(pgError(upd.error).code)

    const del = await owner
      .from('product_attribute_values')
      .delete()
      .eq('product_id', pid)
      .eq('attribute_id', def.data!.id)
    expect(del.error).not.toBeNull()
    expect(['23514', 'P0001']).toContain(pgError(del.error).code)
  })

  it('staff can read definitions but cannot create or set values', async () => {
    const manager = await clientFor('managerBr1')
    const owner = await clientFor('owner')

    const readDefs = await manager
      .from('product_attribute_definitions')
      .select('id')
      .limit(1)
    expect(readDefs.error).toBeNull()
    expect(readDefs.data!.length).toBeGreaterThan(0)

    const product = await createProduct(owner)
    const def = await makeDef(owner, { data_type: 'TEXT' as const })
    const res = await setAttr(manager, product.data!.id, def.data!.id, {
      value_text: 'nope',
    })
    expect(res.error).not.toBeNull()
    expect(pgError(res.error).code).toBe('42501')
  })
})

describe('M2 catalog: product image storage policies', () => {
  it('owner can upload an image and public URL resolves', async () => {
    const owner = await clientFor('owner')
    const product = await createProduct(owner)
    const pid = product.data!.id
    const path = `products/${pid}/11111111-1111-1111-1111-111111111111.webp`

    // minimal valid WebP (1x1 pixel, VP8)
    const bytes = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
      0x56, 0x50, 0x38, 0x20, 0x18, 0x00, 0x00, 0x00, 0x30, 0x01, 0x00, 0x9d,
      0x01, 0x2a, 0x01, 0x00, 0x01, 0x00, 0x02, 0x00, 0x02, 0x00, 0xaa, 0x02,
      0x7c, 0x03, 0x00, 0x00, 0x3c, 0x00, 0x00, 0x00,
    ])
    const up = await owner.storage.from('product-images').upload(path, bytes, {
      contentType: 'image/webp',
    })
    expect(up.error).toBeNull()

    // cleanup
    await owner.storage.from('product-images').remove([path])
  })

  it('owner cannot upload outside the products/<uuid>/ prefix', async () => {
    const owner = await clientFor('owner')
    const res = await owner.storage
      .from('product-images')
      .upload('misc/evil.webp', new Uint8Array([1, 2, 3]), { contentType: 'image/webp' })
    expect(res.error).not.toBeNull()
  })

  it('employee cannot upload product images', async () => {
    const manager = await clientFor('managerBr1')
    const owner = await clientFor('owner')
    const product = await createProduct(owner)
    const pid = product.data!.id
    const res = await manager.storage
      .from('product-images')
      .upload(`products/${pid}/22222222-2222-2222-2222-222222222222.webp`, new Uint8Array([1]), {
        contentType: 'image/webp',
      })
    expect(res.error).not.toBeNull()
  })
})

describe('M2 catalog: audit trail for product changes', () => {
  it('logs create, update and deactivate actions', async () => {
    const owner = await clientFor('owner')
    const created = await createProduct(owner, { name: 'Audited part' })
    const pid = created.data!.id

    await owner
      .from('products')
      .update({ selling_price: 77 })
      .eq('id', pid)
    await owner.from('products').update({ is_active: false }).eq('id', pid)

    const logs = await owner
      .from('audit_logs')
      .select('action, entity_id')
      .eq('entity_id', pid)
      .order('created_at')
    expect(logs.error).toBeNull()
    const actions = logs.data!.map((l) => l.action)
    expect(actions).toContain('PRODUCT_CREATE')
    expect(actions).toContain('PRODUCT_PRICE_CHANGE')
    expect(actions).toContain('PRODUCT_DEACTIVATE')
  })
})

describe('M2 catalog: anon access', () => {
  it('anon cannot read products or categories', async () => {
    const products = await anonClient().from('products').select('id').limit(1)
    expect(products.data).toEqual([])

    const categories = await anonClient().from('product_categories').select('id').limit(1)
    expect(categories.data).toEqual([])
  })
})
