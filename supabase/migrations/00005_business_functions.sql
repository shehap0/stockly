-- Stockly migration 00005: guards, audit triggers, attribute validation,
-- and the transactional RPCs that own all stock/sales mutations.
-- Direct client writes to quantities/sales are impossible: no RLS write
-- policies (00004) + guard triggers here. RPCs run SECURITY DEFINER and do
-- their own permission checks inside the transaction.

-- ---------------------------------------------------------------------------
-- A. branch_inventory guard: quantity changes and row deletes only via RPCs
-- ---------------------------------------------------------------------------
create or replace function public.guard_branch_inventory() returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('app.is_rpc', true), 'off') <> 'on' then
    if TG_OP = 'INSERT' and new.quantity <> 0 then
      raise exception 'Stock must be recorded via add_stock RPC'
        using errcode = 'check_violation';
    elsif TG_OP = 'UPDATE' and new.quantity is distinct from old.quantity then
      raise exception 'Stock quantities may only change via add_stock/adjust_stock/create_sale/void_sale RPCs'
        using errcode = 'check_violation';
    elsif TG_OP = 'DELETE' then
      raise exception 'Branch inventory rows cannot be deleted directly'
        using errcode = 'check_violation';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists guard_branch_inventory on public.branch_inventory;
create trigger guard_branch_inventory
  before insert or update or delete on public.branch_inventory
  for each row execute function public.guard_branch_inventory();

-- ---------------------------------------------------------------------------
-- B. Custom attribute validation
-- ---------------------------------------------------------------------------
create or replace function public.validate_product_attribute_value() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_data_type public.attribute_data_type;
  v_is_active boolean;
  v_options text[];
  v_def_company uuid;
  v_product_company uuid;
begin
  -- DELETE: values of a deactivated definition are frozen (no updates, no deletes).
  if tg_op = 'DELETE' then
    select d.is_active into v_is_active
    from public.product_attribute_definitions d
    where d.id = old.attribute_id;
    if v_is_active is distinct from true then
      raise exception 'Attribute is deactivated; its values cannot be modified'
        using errcode = 'check_violation';
    end if;
    return old;
  end if;

  select d.data_type, d.is_active, d.options, d.company_id
    into v_data_type, v_is_active, v_options, v_def_company
  from public.product_attribute_definitions d
  where d.id = new.attribute_id;

  if not v_is_active then
    raise exception 'Attribute is deactivated; its values cannot be modified'
      using errcode = 'check_violation';
  end if;

  select p.company_id into v_product_company
  from public.products p where p.id = new.product_id;

  if v_def_company is distinct from v_product_company then
    raise exception 'Attribute does not belong to the product company'
      using errcode = 'foreign_key_violation';
  end if;

  case v_data_type
    when 'TEXT' then
      if new.value_text is null then
        raise exception 'Value must be text'
          using errcode = 'check_violation';
      end if;
    when 'NUMBER' then
      if new.value_number is null then
        raise exception 'Value must be a number'
          using errcode = 'check_violation';
      end if;
    when 'BOOLEAN' then
      if new.value_boolean is null then
        raise exception 'Value must be a boolean'
          using errcode = 'check_violation';
      end if;
    when 'DATE' then
      if new.value_date is null then
        raise exception 'Value must be a date'
          using errcode = 'check_violation';
      end if;
    when 'DROPDOWN' then
      if new.value_text is null or not (new.value_text = any (v_options)) then
        raise exception 'Value must be one of the configured options'
          using errcode = 'check_violation';
      end if;
  end case;

  return new;
end;
$$;

drop trigger if exists validate_pav on public.product_attribute_values;
create trigger validate_pav
  before insert or update or delete on public.product_attribute_values
  for each row execute function public.validate_product_attribute_value();

create or replace function public.check_required_attributes(p_product_id uuid) returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  -- Only active products are validated: deactivated products may keep incomplete data.
  if not exists (
    select 1 from public.products p where p.id = p_product_id and p.is_active
  ) then
    return;
  end if;

  if exists (
    select 1
    from public.product_attribute_definitions d
    where d.company_id = (select p.company_id from public.products p where p.id = p_product_id)
      and d.is_required
      and d.is_active
      and not exists (
        select 1 from public.product_attribute_values v
        where v.attribute_id = d.id and v.product_id = p_product_id
      )
  ) then
    raise exception 'Product is missing one or more required attributes'
      using errcode = 'check_violation';
  end if;
end;
$$;

create or replace function public.pav_required_check() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  perform public.check_required_attributes(coalesce(new.product_id, old.product_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists pav_required_check on public.product_attribute_values;
create trigger pav_required_check
  after insert or update or delete on public.product_attribute_values
  for each row execute function public.pav_required_check();

create or replace function public.products_required_check() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  -- Per spec, products may be created with incomplete info (name + price only) and
  -- values can only be attached after the row exists. Enforce required attributes on
  -- edits of an already-active product; allow create, deactivate and reactivate so an
  -- incomplete product can always be fixed, sold, or retired.
  if tg_op = 'UPDATE' and old.is_active and new.is_active then
    perform public.check_required_attributes(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists products_required_check on public.products;
create trigger products_required_check
  after insert or update on public.products
  for each row execute function public.products_required_check();

-- ---------------------------------------------------------------------------
-- C. Audit triggers (append-only writes into audit_logs)
-- ---------------------------------------------------------------------------
create or replace function public.write_audit(
  p_action text,
  p_entity_type text,
  p_operation text,
  p_old jsonb,
  p_new jsonb
) returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  -- Trigger functions must pass TG_OP plus to_jsonb(old)/to_jsonb(new);
  -- TG_OP and OLD/NEW records only exist inside the trigger function itself.
  insert into public.audit_logs (user_id, action, entity_type, entity_id, old_values, new_values)
  values (
    auth.uid(),
    p_action,
    p_entity_type,
    (case when p_operation in ('UPDATE', 'DELETE') then (p_old ->> 'id')::uuid else (p_new ->> 'id')::uuid end),
    (case when p_operation in ('UPDATE', 'DELETE') then p_old else null end),
    (case when p_operation in ('INSERT', 'UPDATE') then p_new else null end)
  );
end;
$$;

create or replace function public.audit_products() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare v_action text;
begin
  v_action := case TG_OP
    when 'INSERT' then 'PRODUCT_CREATE'
    when 'DELETE' then 'PRODUCT_DELETE'
    else
      case
        when old.is_active and not new.is_active then 'PRODUCT_DEACTIVATE'
        when not old.is_active and new.is_active then 'PRODUCT_REACTIVATE'
        when new.selling_price is distinct from old.selling_price then 'PRODUCT_PRICE_CHANGE'
        else 'PRODUCT_UPDATE'
      end
  end;
  perform public.write_audit(
    v_action, 'product', TG_OP,
    case when TG_OP in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when TG_OP in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists audit_products on public.products;
create trigger audit_products
  after insert or update or delete on public.products
  for each row execute function public.audit_products();

create or replace function public.audit_profiles() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare v_action text;
begin
  v_action := case TG_OP
    when 'INSERT' then 'USER_CREATE'
    else
      case
        when new.role is distinct from old.role
          or new.branch_id is distinct from old.branch_id
          or new.is_active is distinct from old.is_active
        then 'PERMISSION_CHANGE'
        else 'USER_UPDATE'
      end
  end;
  perform public.write_audit(
    v_action, 'profile', TG_OP,
    case when TG_OP in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when TG_OP in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists audit_profiles on public.profiles;
create trigger audit_profiles
  after insert or update on public.profiles
  for each row execute function public.audit_profiles();

create or replace function public.guard_profile_update() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  -- Nobody may change their own role, branch, company or activation status —
  -- including an owner (prevents demoting/deactivating oneself and locking the
  -- company out). Self-service edits are limited to non-privileged fields such
  -- as full_name.
  if auth.uid() = old.id
    and (
      new.role is distinct from old.role
      or new.branch_id is distinct from old.branch_id
      or new.is_active is distinct from old.is_active
      or new.company_id is distinct from old.company_id
    )
  then
    raise exception 'You cannot change your own role, branch, or activation status'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_profile_update on public.profiles;
create trigger guard_profile_update
  before update on public.profiles
  for each row execute function public.guard_profile_update();

create or replace function public.audit_categories() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  perform public.write_audit(
    'CATEGORY_' || TG_OP, 'product_category', TG_OP,
    case when TG_OP in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when TG_OP in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists audit_categories on public.product_categories;
create trigger audit_categories
  after insert or update or delete on public.product_categories
  for each row execute function public.audit_categories();

create or replace function public.audit_attribute_definitions() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  perform public.write_audit(
    'ATTRIBUTE_DEFINITION_' || TG_OP, 'attribute_definition', TG_OP,
    case when TG_OP in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when TG_OP in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists audit_attribute_definitions on public.product_attribute_definitions;
create trigger audit_attribute_definitions
  after insert or update on public.product_attribute_definitions
  for each row execute function public.audit_attribute_definitions();

create or replace function public.audit_company_settings() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  perform public.write_audit(
    'SETTINGS_UPDATE', 'company_settings', 'UPDATE',
    to_jsonb(old), to_jsonb(new)
  );
  return new;
end;
$$;

drop trigger if exists audit_company_settings on public.company_settings;
create trigger audit_company_settings
  after update on public.company_settings
  for each row execute function public.audit_company_settings();

-- ---------------------------------------------------------------------------
-- D. Internal stock engine — called by RPCs inside their transaction.
-- Caller MUST have set app.is_rpc = 'on' (transaction-local).
-- p_delta may be negative; new quantity must remain >= 0.
-- Locks the branch_inventory row FOR UPDATE (caller ensures consistent
-- ordering across products to avoid deadlocks).
-- ---------------------------------------------------------------------------
create or replace function public.apply_stock_change(
  p_branch_id uuid,
  p_product_id uuid,
  p_delta integer,
  p_movement_type public.movement_type,
  p_unit_purchase_cost numeric default null,
  p_reason text default null,
  p_reference_type text default null,
  p_reference_id uuid default null,
  p_idempotency_key uuid default null
) returns public.inventory_movements
language plpgsql security definer
set search_path = ''
as $$
declare
  v_profile_id uuid := auth.uid();
  v_previous integer := 0;
  v_new integer;
  v_row_exists boolean;
  v_movement public.inventory_movements;
begin
  if coalesce(current_setting('app.is_rpc', true), 'off') <> 'on' then
    raise exception 'apply_stock_change is internal'
      using errcode = 'insufficient_privilege';
  end if;

  if p_delta = 0 then
    raise exception 'Quantity change cannot be zero' using errcode = 'check_violation';
  end if;

  -- Idempotent retry: return the already-recorded movement.
  if p_idempotency_key is not null then
    select * into v_movement from public.inventory_movements m
    where m.idempotency_key = p_idempotency_key;
    if found then
      return v_movement;
    end if;
  end if;

  select exists (
    select 1 from public.branch_inventory bi
    where bi.branch_id = p_branch_id and bi.product_id = p_product_id
  ) into v_row_exists;

  if v_row_exists then
    select bi.quantity into v_previous
    from public.branch_inventory bi
    where bi.branch_id = p_branch_id and bi.product_id = p_product_id
    for update;
  else
    insert into public.branch_inventory (branch_id, product_id, quantity)
    values (p_branch_id, p_product_id, 0);
    v_previous := 0;
  end if;

  v_new := v_previous + p_delta;

  if v_new < 0 then
    raise exception 'Insufficient stock: operation would make quantity negative'
      using errcode = 'check_violation';
  end if;

  update public.branch_inventory bi
  set quantity = v_new
  where bi.branch_id = p_branch_id and bi.product_id = p_product_id;

  insert into public.inventory_movements (
    branch_id, product_id, movement_type, quantity_change,
    previous_quantity, new_quantity, unit_purchase_cost,
    reason, reference_type, reference_id, created_by, idempotency_key
  ) values (
    p_branch_id, p_product_id, p_movement_type, p_delta,
    v_previous, v_new, p_unit_purchase_cost,
    p_reason, p_reference_type, p_reference_id, v_profile_id, p_idempotency_key
  )
  on conflict (idempotency_key) do nothing
  returning * into v_movement;

  return v_movement;
end;
$$;

-- ---------------------------------------------------------------------------
-- E. add_stock — record manually purchased / received stock (positive only)
-- ---------------------------------------------------------------------------
create or replace function public.add_stock(
  p_branch_id uuid,
  p_product_id uuid,
  p_quantity integer,
  p_unit_purchase_cost numeric(12, 2) default null,
  p_reason text default null,
  p_idempotency_key uuid default null
) returns public.inventory_movements
language plpgsql security definer
set search_path = ''
as $$
declare
  v_movement_type public.movement_type;
  v_existing boolean;
begin
  if not public.is_active_user() then
    raise exception 'Account is inactive' using errcode = 'insufficient_privilege';
  end if;
  if not public.can_access_branch(p_branch_id) then
    raise exception 'You do not have access to this branch'
      using errcode = 'insufficient_privilege';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantity must be greater than zero' using errcode = 'check_violation';
  end if;
  if p_unit_purchase_cost is not null and p_unit_purchase_cost < 0 then
    raise exception 'Purchase cost cannot be negative' using errcode = 'check_violation';
  end if;

  if not exists (
    select 1 from public.products p
    where p.id = p_product_id
      and p.company_id = public.current_company_id()
      and p.is_active
  ) then
    raise exception 'Product not found or inactive' using errcode = 'no_data_found';
  end if;

  perform set_config('app.is_rpc', 'on', true);

  select exists (
    select 1 from public.branch_inventory bi
    where bi.branch_id = p_branch_id and bi.product_id = p_product_id
  ) into v_existing;

  v_movement_type := case when v_existing then 'STOCK_ADDITION'::public.movement_type
                          else 'INITIAL_STOCK'::public.movement_type end;

  return public.apply_stock_change(
    p_branch_id, p_product_id, p_quantity, v_movement_type,
    p_unit_purchase_cost, p_reason, 'MANUAL', null, p_idempotency_key
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- F. adjust_stock — corrections: damage, manual adjustment, returns, other.
-- Signed delta; reason required; audit trail guaranteed by movement record.
-- ---------------------------------------------------------------------------
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
  if not public.can_access_branch(p_branch_id) then
    raise exception 'You do not have access to this branch'
      using errcode = 'insufficient_privilege';
  end if;
  if public.user_role() not in ('OWNER', 'BRANCH_MANAGER') then
    raise exception 'Only managers can adjust stock'
      using errcode = 'insufficient_privilege';
  end if;
  if p_quantity_change is null or p_quantity_change = 0 then
    raise exception 'Quantity change cannot be zero' using errcode = 'check_violation';
  end if;
  if p_movement_type not in ('DAMAGE', 'MANUAL_ADJUSTMENT', 'OTHER', 'SALE_RETURN') then
    raise exception 'Invalid movement type for adjustment'
      using errcode = 'check_violation';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required for stock adjustments'
      using errcode = 'check_violation';
  end if;

  if not exists (
    select 1 from public.products p
    where p.id = p_product_id
      and p.company_id = public.current_company_id()
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

-- ---------------------------------------------------------------------------
-- G. set_low_stock_threshold — per branch + product threshold management
-- ---------------------------------------------------------------------------
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
  if not public.can_access_branch(p_branch_id) then
    raise exception 'You do not have access to this branch'
      using errcode = 'insufficient_privilege';
  end if;
  if public.user_role() not in ('OWNER', 'BRANCH_MANAGER') then
    raise exception 'Only managers can change the low-stock threshold'
      using errcode = 'insufficient_privilege';
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

create or replace function public.upsert_inventory_row(
  p_branch_id uuid,
  p_product_id uuid,
  p_threshold integer
) returns public.branch_inventory
language sql security definer
set search_path = ''
as $$
  insert into public.branch_inventory (branch_id, product_id, quantity, low_stock_threshold)
  values (p_branch_id, p_product_id, 0, p_threshold)
  on conflict (branch_id, product_id)
  do update set low_stock_threshold = excluded.low_stock_threshold
  returning *;
$$;


-- ---------------------------------------------------------------------------
-- H. create_sale — THE critical transaction.
-- Atomic: validate → lock inventory rows (ordered by product_id) → compute
-- exact numeric totals → insert sale/items/movements → deduct stock.
-- Idempotent by p_idempotency_key (unique). Concurrent sales of the last
-- unit: row-level locks serialize; exactly one wins.
-- ---------------------------------------------------------------------------
create or replace function public.create_sale(
  p_branch_id uuid,
  p_items jsonb,
  p_payment_method text,
  p_discount_type text default 'NONE',
  p_discount_value numeric(12, 2) default 0,
  p_customer_id uuid default null,
  p_idempotency_key uuid default null
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_company_id uuid;
  v_sale public.sales;
  v_existing_sale public.sales;
  v_item jsonb;
  v_product_id uuid;
  v_quantity integer;
  v_ids uuid[];
  v_locked_record record;
  v_available integer;
  v_price numeric(12, 2);
  v_cost numeric(12, 2);
  v_name text;
  v_subtotal numeric(12, 2) := 0;
  v_discount_amount numeric(12, 2) := 0;
  v_total numeric(12, 2);
  v_discount_type public.discount_type;
  v_max_discount numeric(5, 2);
  v_sale_number text;
  v_branch_code text;
  v_sale_id uuid;
  v_items jsonb;
  v_line_total numeric(12, 2);
  v_idem uuid := coalesce(p_idempotency_key, gen_random_uuid());
begin
  -- 1. Identity & permission ------------------------------------------------
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile.id is null or not v_profile.is_active then
    raise exception 'Account is inactive' using errcode = 'insufficient_privilege';
  end if;
  if not public.can_access_branch(p_branch_id) then
    raise exception 'You do not have access to this branch'
      using errcode = 'insufficient_privilege';
  end if;
  if p_payment_method not in ('CASH', 'CARD', 'INSTAPAY') then
    raise exception 'Payment method must be CASH, CARD, or INSTAPAY'
      using errcode = 'check_violation';
  end if;

  select b.short_code into v_branch_code
  from public.branches b where b.id = p_branch_id;

  -- 2. Idempotency: already processed? --------------------------------------
  if p_idempotency_key is not null then
    select * into v_existing_sale from public.sales s
    where s.idempotency_key = v_idem;
    if found then
      return public.sale_payload(v_existing_sale.id);
    end if;
  end if;

  -- 3. Validate items shape --------------------------------------------------
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Sale must contain at least one item' using errcode = 'check_violation';
  end if;

  v_ids := array[]::uuid[];
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item ->> 'product_id')::uuid;
    v_quantity := (v_item ->> 'quantity')::int;
    if v_product_id is null then
      raise exception 'Each item needs a product_id' using errcode = 'check_violation';
    end if;
    if v_quantity is null or v_quantity <= 0 then
      raise exception 'Item quantity must be greater than zero'
        using errcode = 'check_violation';
    end if;
    if v_product_id = any (v_ids) then
      raise exception 'Duplicate product in sale items' using errcode = 'check_violation';
    end if;
    v_ids := array_append(v_ids, v_product_id);
  end loop;

  -- All products must be active and in caller's company; gather prices.
  create temp table sale_product_prices on commit drop as
    select p.id, p.name, p.selling_price, p.purchase_cost
    from public.products p
    where p.id = any (v_ids)
      and p.company_id = v_profile.company_id
      and p.is_active;

  if (select count(*) from sale_product_prices) <> array_length(v_ids, 1) then
    raise exception 'One or more products not found or inactive'
      using errcode = 'no_data_found';
  end if;

  -- 4. Lock inventory rows in deterministic order (deadlock avoidance) -------
  create temp table locked_inventory on commit drop as
    select bi.product_id, bi.quantity
    from public.branch_inventory bi
    where bi.branch_id = p_branch_id
      and bi.product_id = any (v_ids)
    order by bi.product_id
    for update;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item ->> 'product_id')::uuid;
    v_quantity := (v_item ->> 'quantity')::int;
    select coalesce(quantity, 0) into v_available
    from locked_inventory li where li.product_id = v_product_id;
    if v_available is null or v_quantity > v_available then
      select name into v_name from sale_product_prices where id = v_product_id;
      raise exception 'Insufficient stock for "%": requested %, available %',
        v_name, v_quantity, coalesce(v_available, 0)
        using errcode = 'check_violation';
    end if;
  end loop;

  -- 5. Compute totals with exact numeric math --------------------------------
  select coalesce(sum(round(spp.selling_price * it.qty, 2)), 0)
    into v_subtotal
  from sale_product_prices spp
  join (
    select (x ->> 'product_id')::uuid as product_id, (x ->> 'quantity')::int as qty
    from jsonb_array_elements(p_items) as x
  ) it on it.product_id = spp.id;

  v_discount_type := p_discount_type::public.discount_type;

  if v_discount_type = 'NONE' then
    if p_discount_value <> 0 then
      raise exception 'Discount value must be 0 for discount type NONE'
        using errcode = 'check_violation';
    end if;
    v_discount_amount := 0;
  elsif v_discount_type = 'FIXED' then
    if p_discount_value < 0 then
      raise exception 'Discount cannot be negative' using errcode = 'check_violation';
    end if;
    v_discount_amount := round(p_discount_value, 2);
  elsif v_discount_type = 'PERCENT' then
    if p_discount_value <= 0 or p_discount_value > 100 then
      raise exception 'Percentage discount must be between 0 and 100'
        using errcode = 'check_violation';
    end if;
    v_discount_amount := round(v_subtotal * p_discount_value / 100, 2);
  end if;

  if v_discount_amount > v_subtotal then
    raise exception 'Discount cannot exceed the subtotal'
      using errcode = 'check_violation';
  end if;

  -- Permission cap on discounts (owner unlimited)
  if v_discount_amount > 0 and v_profile.role <> 'OWNER' then
    select cs.max_discount_percent into v_max_discount
    from public.company_settings cs where cs.company_id = v_profile.company_id;
    if v_max_discount is not null
      and round(v_discount_amount / v_subtotal * 100, 2) > v_max_discount
    then
      raise exception 'Discount exceeds the maximum allowed'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  v_total := v_subtotal - v_discount_amount;

  -- Optional customer must belong to the company.
  if p_customer_id is not null and not exists (
    select 1 from public.customers c
    where c.id = p_customer_id and c.company_id = v_profile.company_id
  ) then
    raise exception 'Customer not found' using errcode = 'no_data_found';
  end if;

  -- 6. Insert sale FIRST (unique idempotency_key arbitrates concurrent retries)
  perform set_config('app.is_rpc', 'on', true);

  v_sale_number := v_branch_code || '-' || to_char(nextval('public.sale_number_seq'), 'FM000000');

  insert into public.sales (
    id, company_id, branch_id, customer_id, sale_number,
    subtotal, discount_type, discount_value, discount_amount, total_amount,
    payment_method, status, created_by, idempotency_key
  ) values (
    gen_random_uuid(), v_profile.company_id, p_branch_id, p_customer_id, v_sale_number,
    v_subtotal, v_discount_type, p_discount_value, v_discount_amount, v_total,
    p_payment_method::public.payment_method, 'COMPLETED', v_profile.id, v_idem
  )
  on conflict (idempotency_key) do nothing
  returning * into v_sale;

  if v_sale.id is null then
    -- Lost an idempotency race: another identical request already committed.
    select * into v_existing_sale from public.sales s
    where s.idempotency_key = v_idem;
    return public.sale_payload(v_existing_sale.id);
  end if;

  v_sale_id := v_sale.id;

  -- 7. Sale items with historical snapshots ----------------------------------
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item ->> 'product_id')::uuid;
    v_quantity := (v_item ->> 'quantity')::int;
    select name, selling_price, purchase_cost into v_name, v_price, v_cost
    from sale_product_prices where id = v_product_id;
    v_line_total := round(v_price * v_quantity, 2);

    insert into public.sale_items (
      sale_id, product_id, product_name_snapshot, quantity,
      unit_selling_price, unit_purchase_cost_snapshot, discount_amount, line_total
    ) values (
      v_sale_id, v_product_id, v_name, v_quantity,
      v_price, v_cost, 0, v_line_total
    );

    -- 8. Deduct stock (row already locked) + movement record
    perform public.apply_stock_change(
      p_branch_id, v_product_id, -v_quantity, 'SALE',
      v_cost, null, 'SALE', v_sale_id, null
    );
  end loop;

  return public.sale_payload(v_sale_id);
end;
$$;

-- Full sale payload (sale + items) for RPC responses.
-- Mirrors the sales RLS rule: owner sees everything, branch staff see their
-- branch. Non-visible sale -> null.
create or replace function public.sale_payload(p_sale_id uuid) returns jsonb
language sql security definer
set search_path = ''
as $$
  select case
    when public.can_access_branch(s.branch_id)
    then jsonb_build_object(
      'sale', to_jsonb(s),
      'items', coalesce((
        select jsonb_agg(to_jsonb(si) order by si.created_at, si.id)
        from public.sale_items si where si.sale_id = p_sale_id
      ), '[]'::jsonb)
    )
    else null
  end
  from public.sales s
  where s.id = p_sale_id;
$$;

-- ---------------------------------------------------------------------------
-- I. void_sale — compensating restock; original sale preserved (status only).
-- Permission: owner (any branch) or manager of the sale's branch.
-- ---------------------------------------------------------------------------
create or replace function public.void_sale(
  p_sale_id uuid,
  p_reason text
) returns jsonb
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
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required to void a sale'
      using errcode = 'check_violation';
  end if;

  select * into v_sale from public.sales s
  where s.id = p_sale_id
    and s.company_id = v_profile.company_id
  for update;

  if v_sale.id is null then
    raise exception 'Sale not found' using errcode = 'no_data_found';
  end if;
  if v_sale.status <> 'COMPLETED' then
    raise exception 'Sale has already been voided' using errcode = 'check_violation';
  end if;
  if v_profile.role <> 'OWNER'
    and not (v_profile.role = 'BRANCH_MANAGER' and v_profile.branch_id = v_sale.branch_id)
  then
    raise exception 'Only the owner or the branch manager can void a sale'
      using errcode = 'insufficient_privilege';
  end if;

  perform set_config('app.is_rpc', 'on', true);

  for v_item in
    select si.product_id, si.quantity, si.unit_purchase_cost_snapshot
    from public.sale_items si
    where si.sale_id = p_sale_id
    order by si.product_id
  loop
    perform public.apply_stock_change(
      v_sale.branch_id, v_item.product_id, v_item.quantity, 'SALE_RETURN',
      v_item.unit_purchase_cost_snapshot,
      'Void: ' || btrim(p_reason), 'SALE', p_sale_id, null
    );
  end loop;

  update public.sales s
  set status = 'VOIDED', void_reason = btrim(p_reason)
  where s.id = p_sale_id;

  insert into public.audit_logs (user_id, branch_id, action, entity_type, entity_id, old_values, new_values)
  values (
    auth.uid(), v_sale.branch_id, 'SALE_VOID', 'sale', p_sale_id,
    jsonb_build_object('status', 'COMPLETED'),
    jsonb_build_object('status', 'VOIDED', 'reason', btrim(p_reason))
  );

  return public.sale_payload(p_sale_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- J. Final function grants: authenticated only, nothing to anon/public.
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;

-- Sale numbering sequence: RPC-internal only.
revoke all on sequence public.sale_number_seq from anon, authenticated;
