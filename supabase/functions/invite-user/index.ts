// Supabase Edge Function: invite-user
// Owner-only. Invites a staff email via Supabase Auth, then creates the matching
// profile row in the caller's company. Service-role key never reaches clients.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

type Payload = {
  action?: string
  profileId?: string
  confirmDelete?: boolean
  email?: string
  phone?: string
  fullName?: string
  role?: string
  branchId?: string | null
}

const VALID_ROLES = new Set(['OWNER', 'BRANCH_EMPLOYEE'])

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Missing authorization' }, 401)

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  })
  const {
    data: { user },
    error: userError,
  } = await callerClient.auth.getUser()
  if (userError || !user) return json({ error: 'Invalid session' }, 401)

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: callerProfile, error: profileError } = await admin
    .from('profiles')
    .select('company_id, role, is_active')
    .eq('id', user.id)
    .single()
  if (profileError || !callerProfile) return json({ error: 'No profile for caller' }, 403)
  if (!callerProfile.is_active || callerProfile.role !== 'OWNER') {
    return json({ error: 'Only an active owner can invite users' }, 403)
  }

  let payload: Payload
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  if (payload.action === 'delete-user') {
    if (!payload.profileId) return json({ error: 'Profile id is required' }, 400)
    if (payload.profileId === user.id) return json({ error: 'You cannot delete your own account' }, 400)
    const { data: target, error: targetError } = await admin
      .from('profiles')
      .select('id, role')
      .eq('id', payload.profileId)
      .eq('company_id', callerProfile.company_id)
      .maybeSingle()
    if (targetError) return json({ error: targetError.message }, 500)
    if (!target) return json({ error: 'Staff profile not found in your company' }, 404)
    if (target.role === 'OWNER') {
      const { count, error: ownerCountError } = await admin
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', callerProfile.company_id)
        .eq('role', 'OWNER')
        .eq('is_active', true)
      if (ownerCountError) return json({ error: ownerCountError.message }, 500)
      if ((count ?? 0) <= 1) return json({ error: 'The company must keep at least one active owner' }, 400)
    }
    const { error: deleteError } = await admin.auth.admin.deleteUser(target.id)
    if (deleteError) return json({ error: deleteError.message }, 400)
    return json({ id: target.id })
  }

  const rawPhone = payload.phone?.trim().replace(/[\s()-]/g, '')
  const phone = rawPhone?.startsWith('01') ? `+20${rawPhone.slice(1)}`
    : rawPhone?.startsWith('20') ? `+${rawPhone}`
      : rawPhone
  if (!phone || !/^\+[1-9]\d{7,14}$/.test(phone)) {
    return json({ error: 'A valid phone number with country code is required' }, 400)
  }

  if (payload.action === 'set-phone') {
    if (!payload.profileId) return json({ error: 'Profile id is required' }, 400)
    const { data: target, error: targetError } = await admin
      .from('profiles')
      .select('id, phone')
      .eq('id', payload.profileId)
      .eq('company_id', callerProfile.company_id)
      .maybeSingle()
    if (targetError) return json({ error: targetError.message }, 500)
    if (!target) return json({ error: 'Staff profile not found in your company' }, 404)

    const { error: profileUpdateError } = await admin
      .from('profiles')
      .update({ phone, updated_at: new Date().toISOString() })
      .eq('id', target.id)
    if (profileUpdateError) return json({ error: profileUpdateError.message }, 400)

    const { error: authUpdateError } = await admin.auth.admin.updateUserById(target.id, {
      phone,
      phone_confirm: true,
    })
    if (authUpdateError) {
      await admin.from('profiles').update({ phone: target.phone }).eq('id', target.id)
      return json({ error: authUpdateError.message }, 400)
    }
    return json({ id: target.id, phone })
  }

  const fullName = payload.fullName?.trim()
  const email = payload.email?.trim().toLowerCase()
  const role = payload.role
  const branchId = payload.branchId ?? null

  if (!fullName) return json({ error: 'Full name is required' }, 400)
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: 'A valid email address is required' }, 400)
  }
  if (!role || !VALID_ROLES.has(role)) return json({ error: 'Invalid role' }, 400)

  if (role === 'OWNER') {
    if (branchId) return json({ error: 'Owners are company-wide; no branch allowed' }, 400)
  } else {
    if (!branchId) return json({ error: `${role} requires a branch` }, 400)
    const { data: branch, error: branchError } = await admin
      .from('branches')
      .select('id')
      .eq('id', branchId)
      .eq('company_id', callerProfile.company_id)
      .maybeSingle()
    if (branchError) return json({ error: branchError.message }, 500)
    if (!branch) return json({ error: 'Branch does not belong to your company' }, 400)
  }

  // Email invitation lets staff choose a password; confirming the owner-entered
  // phone enables phone + password sign-in without an SMS verification step.
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName },
  })
  if (inviteError || !invited.user) {
    return json({ error: inviteError?.message ?? 'Invite failed' }, 400)
  }

  const { error: phoneError } = await admin.auth.admin.updateUserById(invited.user.id, {
    phone,
    phone_confirm: true,
  })
  if (phoneError) {
    await admin.auth.admin.deleteUser(invited.user.id)
    return json({ error: phoneError.message }, 400)
  }

  const { error: insertError } = await admin.from('profiles').insert({
    id: invited.user.id,
    company_id: callerProfile.company_id,
    phone,
    full_name: fullName,
    role,
    branch_id: branchId,
    is_active: true,
  })
  if (insertError) {
    // do not leave a half-provisioned auth user behind
      await admin.auth.admin.deleteUser(invited.user.id)
    return json({ error: insertError.message }, 400)
  }

  return json({ id: invited.user.id, email, phone })
})
