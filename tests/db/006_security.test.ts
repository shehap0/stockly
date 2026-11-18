import { describe, it, expect, afterAll } from 'vitest'
import { adminClient, clientFor, pgError } from '../helpers'

const admin = adminClient()
const createdCompanyIds: string[] = []

async function seededProfileId(fullName: string): Promise<{ id: string; role: string; branch_id: string | null; is_active: boolean; company_id: string }> {
  const { data, error } = await admin
    .from('profiles')
    .select('id, role, branch_id, is_active, company_id')
    .eq('full_name', fullName)
    .single()
  if (error) throw error
  return data as unknown as { id: string; role: string; branch_id: string | null; is_active: boolean; company_id: string }
}

afterAll(async () => {
  // remove cross-company fixtures
  for (const companyId of createdCompanyIds) {
    await admin.from('branches').delete().eq('company_id', companyId)
    await admin.from('company_settings').delete().eq('company_id', companyId)
    await admin.from('companies').delete().eq('id', companyId)
  }
})

describe('M6 security: role and settings boundaries', () => {
  it('an employee cannot change roles, branches, or activation of anyone', async () => {
    const manager = await clientFor('managerBr1')
    const emp = await seededProfileId('Kareem Adel')

    const roleChange = await manager
      .from('profiles')
      .update({ role: 'OWNER', branch_id: null })
      .eq('id', emp.id)
      .select()
    expect(roleChange.error).toBeNull()
    expect(roleChange.data).toEqual([])

    const deactivate = await manager
      .from('profiles')
      .update({ is_active: false })
      .eq('id', emp.id)
      .select()
    expect(deactivate.data).toEqual([])

    const after = await seededProfileId('Kareem Adel')
    expect(after.role).toBe('BRANCH_EMPLOYEE')
    expect(after.is_active).toBe(true)
  })

  it('owner can reassign an employee branch and the change is audited as PERMISSION_CHANGE', async () => {
    const owner = await clientFor('owner')
    const emp = await seededProfileId('Kareem Adel')

    const { data: branches } = await owner.from('branches').select('id, short_code')
    const br2 = branches!.find((b) => b.short_code === 'BR2')!.id

    const promote = await owner
      .from('profiles')
      .update({ branch_id: br2 })
      .eq('id', emp.id)
      .select()
    expect(promote.error).toBeNull()
    expect(promote.data?.[0]!.role).toBe('BRANCH_EMPLOYEE')

    const { data: logs } = await owner
      .from('audit_logs')
      .select('action, entity_type, entity_id')
      .eq('entity_type', 'profile')
      .eq('entity_id', emp.id)
      .order('created_at', { ascending: false })
      .limit(1)
    expect(logs?.[0]?.action).toBe('PERMISSION_CHANGE')

    // restore
    const revert = await owner
      .from('profiles')
      .update({ role: 'BRANCH_EMPLOYEE', branch_id: emp.branch_id })
      .eq('id', emp.id)
    expect(revert.error).toBeNull()
  })

  it('an owner cannot demote or deactivate themselves (lockout guard)', async () => {
    const owner = await clientFor('owner')
    const { data: me } = await owner.auth.getUser()

    const demote = await owner
      .from('profiles')
      .update({ role: 'BRANCH_EMPLOYEE', branch_id: null })
      .eq('id', me.user!.id)
    expect(pgError(demote.error).code).toBe('42501')

    const deactivate = await owner
      .from('profiles')
      .update({ is_active: false })
      .eq('id', me.user!.id)
    expect(pgError(deactivate.error).code).toBe('42501')

    // non-privileged self edits still work
    const rename = await owner
      .from('profiles')
      .update({ full_name: 'Demo Owner' })
      .eq('id', me.user!.id)
      .select()
    expect(rename.error).toBeNull()
    expect(rename.data?.[0]!.full_name).toBe('Demo Owner')
  })

  it('branch managers cannot edit company settings; owners can', async () => {
    const manager = await clientFor('managerBr2')
    const owner = await clientFor('owner')
    const { data: company } = await owner.from('companies').select('id').single()

    const managerWrite = await manager
      .from('company_settings')
      .update({ max_discount_percent: 99 })
      .eq('company_id', company!.id)
      .select()
    expect(managerWrite.error).toBeNull()
    expect(managerWrite.data).toEqual([])

    const ownerWrite = await owner
      .from('company_settings')
      .update({ max_discount_percent: 30 })
      .eq('company_id', company!.id)
      .select()
    expect(ownerWrite.error).toBeNull()
    expect(Number(ownerWrite.data?.[0]!.max_discount_percent)).toBe(30)

    // restore for other suites
    await admin
      .from('company_settings')
      .update({ max_discount_percent: 25 })
      .eq('company_id', company!.id)
  })

  it('managers cannot create or rename branches; owners can', async () => {
    const manager = await clientFor('managerBr2')
    const owner = await clientFor('owner')
    const { data: company } = await owner.from('companies').select('id').single()

    const managerCreate = await manager.from('branches').insert({
      company_id: company!.id,
      short_code: 'MGR-X',
      name: 'Manager branch',
    })
    expect(pgError(managerCreate.error).code).toBe('42501')

    const { data: br2 } = await owner.from('branches').select('id, name').eq('short_code', 'BR2').single()
    const managerRename = await manager
      .from('branches')
      .update({ name: 'Renamed by manager' })
      .eq('id', br2!.id)
      .select()
    expect(managerRename.data).toEqual([])
    const { data: after } = await admin.from('branches').select('name').eq('id', br2!.id).single()
    expect(after!.name).toBe(br2!.name)

    const ownerRename = await owner
      .from('branches')
      .update({ name: 'Giza (Dokki)' })
      .eq('id', br2!.id)
      .select()
    expect(ownerRename.error).toBeNull()
    expect(ownerRename.data?.[0]!.name).toBe('Giza (Dokki)')
  })

  it('managers cannot read the audit log; owners can', async () => {
    const manager = await clientFor('managerBr1')
    const owner = await clientFor('owner')
    const managerRead = await manager.from('audit_logs').select('id').limit(5)
    expect(managerRead.error).toBeNull()
    expect(managerRead.data).toEqual([])

    const ownerRead = await owner.from('audit_logs').select('id').limit(5)
    expect(ownerRead.error).toBeNull()
    expect(ownerRead.data!.length).toBeGreaterThan(0)
  })
})

describe('M6 security: cross-company isolation', () => {
  it('sets up a second company with a branch', async () => {
    const suffix = Math.random().toString(36).slice(2, 8)
    const { data: company, error: companyError } = await admin
      .from('companies')
      .insert({ name: `Rival Co ${suffix}` })
      .select('id')
      .single()
    expect(companyError).toBeNull()
    createdCompanyIds.push(company!.id)

    const { error: settingsError } = await admin
      .from('company_settings')
      .insert({ company_id: company!.id })
    expect(settingsError).toBeNull()

    const { error: branchError } = await admin.from('branches').insert({
      company_id: company!.id,
      short_code: `RX-${suffix}`,
      name: 'Rival Branch',
    })
    expect(branchError).toBeNull()
  })

  it('the owner cannot write rows tagged with another company', async () => {
    const owner = await clientFor('owner')
    const { data: mine } = await owner.from('products').select('id, company_id').limit(1).single()

    const otherCompany = createdCompanyIds[0]!
    const { data: otherBranch } = await admin
      .from('branches')
      .select('id')
      .eq('company_id', otherCompany)
      .single()

    // insert product into another company
    const productWrite = await owner
      .from('products')
      .insert({ company_id: otherCompany, name: 'Smuggled part', selling_price: 1 })
    expect(pgError(productWrite.error).code).toBe('42501')

    // move own product into another company
    const productMove = await owner
      .from('products')
      .update({ company_id: otherCompany })
      .eq('id', mine!.id)
    expect(pgError(productMove.error).code).toBe('42501')

    // link own product to a foreign branch's inventory
    const inventoryWrite = await owner.from('branch_inventory').insert({
      branch_id: otherBranch!.id,
      product_id: mine!.id,
      quantity: 5,
    })
    expect(inventoryWrite.error).not.toBeNull()
    expect(['23514', '42501']).toContain(pgError(inventoryWrite.error).code)
  })

  it('the owner cannot touch another company, branch, or settings row', async () => {
    const owner = await clientFor('owner')
    const otherCompany = createdCompanyIds[0]!
    const { data: otherBranch } = await admin
      .from('branches')
      .select('id')
      .eq('company_id', otherCompany)
      .single()

    const companyUpdate = await owner
      .from('companies')
      .update({ name: 'Hijacked' })
      .eq('id', otherCompany)
      .select()
    expect(companyUpdate.data).toEqual([])

    const branchUpdate = await owner
      .from('branches')
      .update({ name: 'Hijacked branch' })
      .eq('id', otherBranch!.id)
      .select()
    expect(branchUpdate.data).toEqual([])

    const settingsUpdate = await owner
      .from('company_settings')
      .update({ max_discount_percent: 1 })
      .eq('company_id', otherCompany)
      .select()
    expect(settingsUpdate.data).toEqual([])
  })

  it('staff cannot read another company’s catalog or branches', async () => {
    const employee = await clientFor('employeeBr1')
    const otherCompany = createdCompanyIds[0]!

    const { data: branches } = await employee.from('branches').select('id, company_id')
    expect(branches!.every((b) => b.company_id !== otherCompany)).toBe(true)

    const { data: products } = await employee.from('products').select('company_id').limit(50)
    expect(products!.every((p) => p.company_id !== otherCompany)).toBe(true)
  })
})
