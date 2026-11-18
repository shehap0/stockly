-- Stockly migration 00003: common trigger + RLS helper functions
-- All SECURITY DEFINER functions pin search_path to '' and schema-qualify
-- every identifier, so they cannot be hijacked by a search_path attack.

create or replace function public.set_updated_at() returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Attach updated_at to every mutable table
do $$
declare
  t text;
begin
  foreach t in array array[
    'companies', 'branches', 'company_settings', 'profiles', 'product_categories',
    'products', 'product_attribute_definitions', 'product_attribute_values',
    'branch_inventory', 'customers', 'sales'
  ]
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function public.set_updated_at()',
      t
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS helpers. STABLE so policies can use them per-row cheaply.
-- They deliberately re-read the profile on each call (fresh is_active/role)
-- rather than trusting JWT claims.
-- ---------------------------------------------------------------------------

create or replace function public.current_profile()
returns public.profiles
language sql stable security definer
set search_path = ''
as $$
  select p.*
  from public.profiles p
  where p.id = auth.uid();
$$;

create or replace function public.is_active_user() returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce((
    select p.is_active from public.profiles p where p.id = auth.uid()
  ), false);
$$;

create or replace function public.current_company_id() returns uuid
language sql stable security definer
set search_path = ''
as $$
  select p.company_id from public.profiles p where p.id = auth.uid();
$$;

create or replace function public.user_role() returns public.user_role
language sql stable security definer
set search_path = ''
as $$
  select p.role from public.profiles p where p.id = auth.uid();
$$;

create or replace function public.is_owner() returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'OWNER' and p.is_active
  );
$$;

-- True when the caller may operate on the given branch:
-- owner => any branch of THEIR company; others => only their assigned branch.
create or replace function public.can_access_branch(p_branch_id uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    join public.branches b
      on b.company_id = p.company_id
     and b.id = p_branch_id
     and b.is_active
    where p.id = auth.uid()
      and p.is_active
      and (p.role = 'OWNER' or p.branch_id = p_branch_id)
  );
$$;

-- Helper functions are exposed to authenticated users only.
revoke all on all functions in schema public from public, anon;
