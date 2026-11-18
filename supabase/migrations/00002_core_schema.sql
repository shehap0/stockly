-- Stockly migration 00002: core schema
-- Money: numeric(12,2), exact. Arithmetic happens only inside SQL functions (see 00005).
-- Quantities: integers. Stock never negative.

-- ---------------------------------------------------------------------------
-- Companies / branches
-- ---------------------------------------------------------------------------
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete restrict,
  short_code text not null unique,
  name text not null,
  address text,
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, short_code),
  unique (company_id, id)
);

create table public.company_settings (
  company_id uuid primary key references public.companies (id) on delete cascade,
  currency text not null default 'EGP',
  max_discount_percent numeric(5, 2) not null default 100.00
    check (max_discount_percent between 0 and 100),
  default_low_stock_threshold integer
    check (default_low_stock_threshold is null or default_low_stock_threshold >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete restrict,
  full_name text not null,
  role public.user_role not null,
  branch_id uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Owner is company-wide (branch_id null); managers/employees must belong to a branch.
  constraint profiles_role_branch_chk check (
    (role = 'OWNER' and branch_id is null) or (role <> 'OWNER' and branch_id is not null)
  ),
  -- Branch must belong to the same company as the profile.
  foreign key (company_id, branch_id)
    references public.branches (company_id, id) on delete restrict
);

-- ---------------------------------------------------------------------------
-- Catalog: categories, products, custom attributes
-- ---------------------------------------------------------------------------
create table public.product_categories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete restrict,
  name text not null,
  description text,
  parent_category_id uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, name),
  -- parent must exist in the same company
  unique (company_id, id),
  foreign key (company_id, parent_category_id)
    references public.product_categories (company_id, id) on delete set null
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete restrict,
  name text not null,
  description text,
  category_id uuid,
  image_path text,
  manufacturer text,
  brand text,
  car_make text,
  car_model text,
  manufacturing_year integer,
  selling_price numeric(12, 2) not null
    check (selling_price >= 0),
  purchase_cost numeric(12, 2)
    check (purchase_cost is null or purchase_cost >= 0),
  sku text,
  barcode text,
  oem_number text,
  condition public.product_condition,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (company_id, category_id)
    references public.product_categories (company_id, id) on delete restrict,
  constraint products_manufacturing_year_chk check (
    manufacturing_year is null or manufacturing_year between 1900 and 2100
  )
);

create index products_company_active_idx on public.products (company_id, is_active);
create index products_name_trgm_idx on public.products using gin (name gin_trgm_ops);
create index products_sku_idx on public.products (sku) where sku is not null;
create index products_barcode_idx on public.products (barcode) where barcode is not null;
create index products_oem_idx on public.products (oem_number) where oem_number is not null;
create index products_car_make_model_idx on public.products (car_make, car_model)
  where car_make is not null;

create table public.product_attribute_definitions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete restrict,
  name text not null,
  data_type public.attribute_data_type not null,
  is_required boolean not null default false,
  is_active boolean not null default true,
  options text[],
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pad_dropdown_options_chk check (
    data_type <> 'DROPDOWN' or (options is not null and array_length(options, 1) >= 1)
  ),
  constraint pad_options_only_dropdown_chk check (
    data_type = 'DROPDOWN' or options is null
  )
);

create index pad_company_idx on public.product_attribute_definitions (company_id, is_active, display_order);

create table public.product_attribute_values (
  product_id uuid not null references public.products (id) on delete cascade,
  attribute_id uuid not null references public.product_attribute_definitions (id) on delete restrict,
  value_text text,
  value_number numeric(14, 4),
  value_boolean boolean,
  value_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (product_id, attribute_id),
  -- exactly one typed column holds the value
  constraint pav_single_value_chk check (
    (case when value_text is null then 0 else 1 end
      + case when value_number is null then 0 else 1 end
      + case when value_boolean is null then 0 else 1 end
      + case when value_date is null then 0 else 1 end) = 1
  )
);

create index pav_attribute_idx on public.product_attribute_values (attribute_id);

-- ---------------------------------------------------------------------------
-- Inventory
-- ---------------------------------------------------------------------------
create table public.branch_inventory (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete restrict,
  product_id uuid not null references public.products (id) on delete cascade,
  quantity integer not null default 0 check (quantity >= 0),
  low_stock_threshold integer check (low_stock_threshold is null or low_stock_threshold >= 0),
  updated_at timestamptz not null default now(),
  unique (branch_id, product_id)
);

create index branch_inventory_branch_idx on public.branch_inventory (branch_id);
create index branch_inventory_product_idx on public.branch_inventory (product_id);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete restrict,
  product_id uuid not null references public.products (id) on delete restrict,
  movement_type public.movement_type not null,
  quantity_change integer not null,
  previous_quantity integer not null,
  new_quantity integer not null check (new_quantity >= 0),
  unit_purchase_cost numeric(12, 2),
  reason text,
  reference_type text,
  reference_id uuid,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  idempotency_key uuid unique,
  constraint movements_delta_chk check (new_quantity - previous_quantity = quantity_change),
  constraint movements_new_nonneg_chk check (previous_quantity >= 0)
);

create index movements_branch_created_idx on public.inventory_movements (branch_id, created_at desc);
create index movements_product_created_idx on public.inventory_movements (product_id, created_at desc);
create index movements_reference_idx on public.inventory_movements (reference_type, reference_id)
  where reference_id is not null;

-- ---------------------------------------------------------------------------
-- Customers
-- ---------------------------------------------------------------------------
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete restrict,
  name text not null,
  phone text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index customers_company_idx on public.customers (company_id);
create index customers_phone_idx on public.customers (phone) where phone is not null;

-- ---------------------------------------------------------------------------
-- Sales
-- ---------------------------------------------------------------------------
create sequence public.sale_number_seq;

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete restrict,
  branch_id uuid not null references public.branches (id) on delete restrict,
  customer_id uuid references public.customers (id) on delete set null,
  sale_number text not null unique,
  subtotal numeric(12, 2) not null check (subtotal >= 0),
  discount_type public.discount_type not null default 'NONE',
  discount_value numeric(12, 2) not null default 0 check (discount_value >= 0),
  discount_amount numeric(12, 2) not null default 0 check (discount_amount >= 0),
  total_amount numeric(12, 2) not null check (total_amount >= 0),
  payment_method public.payment_method not null,
  status public.sale_status not null default 'COMPLETED',
  void_reason text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  idempotency_key uuid not null unique,
  constraint sales_total_chk check (total_amount = subtotal - discount_amount),
  constraint sales_discount_le_subtotal_chk check (discount_amount <= subtotal),
  constraint sales_void_reason_chk check (status <> 'VOIDED' or void_reason is not null)
);

create index sales_branch_created_idx on public.sales (branch_id, created_at desc);
create index sales_company_created_idx on public.sales (company_id, created_at desc);
create index sales_created_by_idx on public.sales (created_by, created_at desc);
create index sales_customer_idx on public.sales (customer_id) where customer_id is not null;

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,
  product_name_snapshot text not null,
  quantity integer not null check (quantity > 0),
  unit_selling_price numeric(12, 2) not null check (unit_selling_price >= 0),
  unit_purchase_cost_snapshot numeric(12, 2),
  discount_amount numeric(12, 2) not null default 0 check (discount_amount >= 0),
  line_total numeric(12, 2) not null check (line_total >= 0),
  created_at timestamptz not null default now(),
  constraint sale_items_line_total_chk check (
    line_total = round(quantity * unit_selling_price, 2) - discount_amount
  )
);

create index sale_items_sale_idx on public.sale_items (sale_id);
create index sale_items_product_idx on public.sale_items (product_id);

-- ---------------------------------------------------------------------------
-- Audit log (append-only; written by triggers / privileged RPCs, see 00005)
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  branch_id uuid references public.branches (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);
create index audit_logs_user_idx on public.audit_logs (user_id, created_at desc);
