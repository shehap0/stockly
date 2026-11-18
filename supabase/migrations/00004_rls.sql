-- Stockly migration 00004: Row Level Security
-- Direct client writes to stock/sales/movements are NOT permitted through
-- policies; they must go through the SECURITY DEFINER RPCs (00005), which
-- perform their own permission checks inside transactions.
-- SECURITY NOTE: tables are NOT "forced" RLS (the table owner postgres must
-- bypass RLS so definer RPCs can write). No service-role key reaches browsers;
-- anon has no policies, so anon sees nothing.

alter table public.companies enable row level security;
alter table public.branches enable row level security;
alter table public.company_settings enable row level security;
alter table public.profiles enable row level security;
alter table public.product_categories enable row level security;
alter table public.products enable row level security;
alter table public.product_attribute_definitions enable row level security;
alter table public.product_attribute_values enable row level security;
alter table public.branch_inventory enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.customers enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.audit_logs enable row level security;

-- ---------------------------------------------------------------------------
-- companies
-- ---------------------------------------------------------------------------
create policy companies_select on public.companies
  for select to authenticated
  using (id = public.current_company_id() and public.is_active_user());

create policy companies_update on public.companies
  for update to authenticated
  using (id = public.current_company_id() and public.is_owner())
  with check (id = public.current_company_id());

-- ---------------------------------------------------------------------------
-- branches (names/availability must be visible to all staff)
-- ---------------------------------------------------------------------------
create policy branches_select on public.branches
  for select to authenticated
  using (company_id = public.current_company_id() and public.is_active_user());

create policy branches_write on public.branches
  for all to authenticated
  using (company_id = public.current_company_id() and public.is_owner())
  with check (company_id = public.current_company_id() and public.is_owner());

-- ---------------------------------------------------------------------------
-- company_settings
-- ---------------------------------------------------------------------------
create policy company_settings_select on public.company_settings
  for select to authenticated
  using (company_id = public.current_company_id() and public.is_active_user());

create policy company_settings_update on public.company_settings
  for update to authenticated
  using (company_id = public.current_company_id() and public.is_owner())
  with check (company_id = public.current_company_id());

-- ---------------------------------------------------------------------------
-- profiles — self-service update is restricted by trigger (00005): nobody may
-- change their own role/branch/active flag. Owner manages everyone in company.
-- ---------------------------------------------------------------------------
create policy profiles_select on public.profiles
  for select to authenticated
  using (company_id = public.current_company_id() and public.is_active_user());

create policy profiles_update on public.profiles
  for update to authenticated
  using (
    (company_id = public.current_company_id() and public.is_owner())
    or (id = auth.uid() and public.is_active_user())
  )
  with check (company_id = public.current_company_id());

-- ---------------------------------------------------------------------------
-- Catalog: categories, products, attribute definitions/values — owner-managed
-- ---------------------------------------------------------------------------
create policy product_categories_select on public.product_categories
  for select to authenticated
  using (company_id = public.current_company_id() and public.is_active_user());

create policy product_categories_write on public.product_categories
  for all to authenticated
  using (company_id = public.current_company_id() and public.is_owner())
  with check (company_id = public.current_company_id() and public.is_owner());

create policy products_select on public.products
  for select to authenticated
  using (
    company_id = public.current_company_id()
    and public.is_active_user()
    and (public.is_owner() or is_active)
  );

create policy products_write on public.products
  for all to authenticated
  using (company_id = public.current_company_id() and public.is_owner())
  with check (company_id = public.current_company_id() and public.is_owner());

create policy pad_select on public.product_attribute_definitions
  for select to authenticated
  using (company_id = public.current_company_id() and public.is_active_user());

create policy pad_write on public.product_attribute_definitions
  for all to authenticated
  using (company_id = public.current_company_id() and public.is_owner())
  with check (company_id = public.current_company_id() and public.is_owner());

create policy pav_select on public.product_attribute_values
  for select to authenticated
  using (
    exists (
      select 1 from public.products pr
      where pr.id = product_id
        and pr.company_id = public.current_company_id()
    )
    and public.is_active_user()
  );

create policy pav_write on public.product_attribute_values
  for all to authenticated
  using (
    exists (
      select 1 from public.products pr
      where pr.id = product_id
        and pr.company_id = public.current_company_id()
        and public.is_owner()
    )
  )
  with check (
    exists (
      select 1 from public.products pr
      where pr.id = product_id
        and pr.company_id = public.current_company_id()
        and public.is_owner()
    )
  );

-- ---------------------------------------------------------------------------
-- branch_inventory — company-readable (cross-branch availability is a
-- business requirement); updates only by users of that branch, and only for
-- thresholds. Quantity changes are RPC-only (guard trigger in 00005).
-- ---------------------------------------------------------------------------
create policy branch_inventory_select on public.branch_inventory
  for select to authenticated
  using (public.is_active_user() and exists (
    select 1 from public.branches b
    where b.id = branch_id and b.company_id = public.current_company_id()
  ));

create policy branch_inventory_update on public.branch_inventory
  for update to authenticated
  using (
    public.can_access_branch(branch_id)
    and public.user_role() in ('OWNER', 'BRANCH_MANAGER')
  )
  with check (
    public.can_access_branch(branch_id)
    and public.user_role() in ('OWNER', 'BRANCH_MANAGER')
  );

-- ---------------------------------------------------------------------------
-- inventory_movements — audit trail: read scoped by branch, write RPC-only
-- ---------------------------------------------------------------------------
create policy movements_select on public.inventory_movements
  for select to authenticated
  using (public.can_access_branch(branch_id));

-- no INSERT/UPDATE/DELETE policies: RPC-only

-- ---------------------------------------------------------------------------
-- customers
-- ---------------------------------------------------------------------------
create policy customers_select on public.customers
  for select to authenticated
  using (company_id = public.current_company_id() and public.is_active_user());

create policy customers_write on public.customers
  for insert to authenticated
  with check (company_id = public.current_company_id() and public.is_active_user());

create policy customers_update on public.customers
  for update to authenticated
  using (company_id = public.current_company_id() and public.is_active_user())
  with check (company_id = public.current_company_id());

create policy customers_delete on public.customers
  for delete to authenticated
  using (company_id = public.current_company_id() and public.is_owner());

-- ---------------------------------------------------------------------------
-- sales — owner sees company-wide; branch staff see their branch.
-- Inserts/updates only via RPCs (create_sale / void_sale).
-- ---------------------------------------------------------------------------
create policy sales_select on public.sales
  for select to authenticated
  using (public.can_access_branch(branch_id));

create policy sale_items_select on public.sale_items
  for select to authenticated
  using (exists (
    select 1 from public.sales s
    where s.id = sale_id
  ));

-- ---------------------------------------------------------------------------
-- audit_logs — owner read-only, immutable for everyone
-- ---------------------------------------------------------------------------
create policy audit_logs_select on public.audit_logs
  for select to authenticated
  using (public.is_owner());
