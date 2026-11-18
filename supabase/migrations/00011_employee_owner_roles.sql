-- Stockly now has two application roles. Existing managers retain their
-- branch assignments and continue as branch employees.
update public.profiles
set role = 'BRANCH_EMPLOYEE', updated_at = now()
where role = 'BRANCH_MANAGER';

alter table public.profiles
  add constraint profiles_owner_employee_roles
  check (role in ('OWNER', 'BRANCH_EMPLOYEE'));

drop policy if exists branch_inventory_update on public.branch_inventory;
create policy branch_inventory_update on public.branch_inventory
  for update to authenticated
  using (public.can_access_branch(branch_id) and public.is_owner())
  with check (public.can_access_branch(branch_id) and public.is_owner());

-- Stock adjustment and threshold changes are owner-only in the two-role model.
create or replace function public.adjust_stock(
  p_branch_id uuid,
  p_product_id uuid,
  p_quantity_change integer,
  p_movement_type text,
  p_reason text,
  p_idempotency_key uuid default null
) returns public.inventory_movements
language plpgsql security definer
set search_path = ''
as $$
begin
  if not public.is_active_user() then
    raise exception 'Account is inactive' using errcode = 'insufficient_privilege';
  end if;
  if not public.is_owner() then
    raise exception 'Only the owner can adjust stock' using errcode = 'insufficient_privilege';
  end if;
  if not public.can_access_branch(p_branch_id) then
    raise exception 'You do not have access to this branch' using errcode = 'insufficient_privilege';
  end if;
  if p_quantity_change is null or p_quantity_change = 0 then
    raise exception 'Quantity change cannot be zero' using errcode = 'check_violation';
  end if;
  if p_movement_type not in ('DAMAGE', 'MANUAL_ADJUSTMENT', 'OTHER', 'SALE_RETURN') then
    raise exception 'Invalid movement type for adjustment' using errcode = 'check_violation';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required for stock adjustments' using errcode = 'check_violation';
  end if;
  if not exists (
    select 1 from public.products p
    where p.id = p_product_id and p.company_id = public.current_company_id()
  ) then
    raise exception 'Product not found' using errcode = 'no_data_found';
  end if;
  perform set_config('app.is_rpc', 'on', true);
  return public.apply_stock_change(
    p_branch_id, p_product_id, p_quantity_change,
    p_movement_type::public.movement_type,
    null, p_reason, 'MANUAL', null, p_idempotency_key
  );
end;
$$;

create or replace function public.set_low_stock_threshold(
  p_branch_id uuid,
  p_product_id uuid,
  p_threshold integer
) returns public.branch_inventory
language plpgsql security definer
set search_path = ''
as $$
begin
  if not public.is_active_user() then
    raise exception 'Account is inactive' using errcode = 'insufficient_privilege';
  end if;
  if not public.is_owner() then
    raise exception 'Only the owner can change low-stock thresholds' using errcode = 'insufficient_privilege';
  end if;
  if not public.can_access_branch(p_branch_id) then
    raise exception 'You do not have access to this branch' using errcode = 'insufficient_privilege';
  end if;
  if p_threshold is not null and p_threshold < 0 then
    raise exception 'Threshold cannot be negative' using errcode = 'check_violation';
  end if;
  if not exists (
    select 1 from public.products p
    where p.id = p_product_id and p.company_id = public.current_company_id()
  ) then
    raise exception 'Product not found' using errcode = 'no_data_found';
  end if;
  perform set_config('app.is_rpc', 'on', true);
  return public.upsert_inventory_row(p_branch_id, p_product_id, p_threshold);
end;
$$;

create or replace function public.void_sale(p_sale_id uuid, p_reason text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_sale public.sales;
  v_item record;
  v_profile public.profiles;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile.id is null or not v_profile.is_active then
    raise exception 'Account is inactive' using errcode = 'insufficient_privilege';
  end if;
  if v_profile.role <> 'OWNER' then
    raise exception 'Only the owner can void a sale' using errcode = 'insufficient_privilege';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required to void a sale' using errcode = 'check_violation';
  end if;
  select * into v_sale from public.sales s
  where s.id = p_sale_id and s.company_id = v_profile.company_id
  for update;
  if v_sale.id is null then
    raise exception 'Sale not found' using errcode = 'no_data_found';
  end if;
  if v_sale.status <> 'COMPLETED' then
    raise exception 'Sale has already been voided' using errcode = 'check_violation';
  end if;
  perform set_config('app.is_rpc', 'on', true);
  for v_item in
    select si.product_id, si.quantity, si.unit_purchase_cost_snapshot
    from public.sale_items si where si.sale_id = p_sale_id order by si.product_id
  loop
    perform public.apply_stock_change(
      v_sale.branch_id, v_item.product_id, v_item.quantity, 'SALE_RETURN',
      v_item.unit_purchase_cost_snapshot,
      'Void: ' || btrim(p_reason), 'SALE', p_sale_id, null
    );
  end loop;
  update public.sales s set status = 'VOIDED', void_reason = btrim(p_reason)
  where s.id = p_sale_id;
  insert into public.audit_logs (user_id, branch_id, action, entity_type, entity_id, old_values, new_values)
  values (auth.uid(), v_sale.branch_id, 'SALE_VOID', 'sale', p_sale_id,
    jsonb_build_object('status', 'COMPLETED'),
    jsonb_build_object('status', 'VOIDED', 'reason', btrim(p_reason)));
  return public.sale_payload(p_sale_id);
end;
$$;
