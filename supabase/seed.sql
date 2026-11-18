-- Stockly seed: demo data for LOCAL DEVELOPMENT ONLY. All credentials are fake.
-- Dev login: password for every seeded user is "Demo1234!"
--   owner@demo.test          OWNER
--   manager.br1@demo.test    BRANCH_EMPLOYEE (legacy demo email, BR1)
--   manager.br2@demo.test    BRANCH_EMPLOYEE (legacy demo email, BR2)
--   employee.br1@demo.test   BRANCH_EMPLOYEE (BR1)
--   employee.br2@demo.test   BRANCH_EMPLOYEE (BR2)

do $seed$
declare
  v_company uuid;
  v_br1 uuid; v_br2 uuid;
  v_owner uuid; v_mgr1 uuid; v_mgr2 uuid;
  v_emp1 uuid; v_emp2 uuid;
  v_cat_filters uuid; v_cat_brakes uuid; v_cat_engine uuid;
  v_cat_electrical uuid; v_cat_body uuid; v_cat_fluids uuid;
  v_of uuid; v_af uuid; v_ff uuid; v_bp uuid; v_bd uuid;
  v_bt uuid; v_sp uuid; v_ws uuid; v_tb uuid; v_wf uuid;
  v_bf uuid; v_eo uuid; v_hl uuid; v_radio uuid;
  v_attr_engine uuid; v_attr_trans uuid; v_attr_gen uuid;
  v_attr_warranty uuid; v_attr_color uuid;
  v_cust1 uuid; v_cust2 uuid;
  v_sale1 uuid; v_sale2 uuid; v_sale3 uuid; v_sale4 uuid;
  v_pw text := crypt('Demo1234!', gen_salt('bf'));
begin
  -- The seed bypasses the RPC-only stock guard intentionally (bootstrap data):
  perform set_config('app.is_rpc', 'on', true);

  -- 1. Company + branches + settings ---------------------------------------
  insert into public.companies (name) values ('Demo Auto Parts Co.')
  returning id into v_company;

  insert into public.branches (company_id, short_code, name, address, phone)
  values
    (v_company, 'BR1', 'العرب', null, null),
    (v_company, 'BR2', 'زرزاره', null, null);

  select id into v_br1 from public.branches where short_code = 'BR1';
  select id into v_br2 from public.branches where short_code = 'BR2';

  insert into public.company_settings (company_id, currency, max_discount_percent, default_low_stock_threshold)
  values (v_company, 'EGP', 25.00, 5);

  -- 2. Users (auth.users + identities + profiles) ---------------------------
  create temp table seed_users (
    id uuid default gen_random_uuid(),
    email text not null,
    phone text not null,
    full_name text not null,
    role public.user_role not null,
    branch_short_code text
  ) on commit drop;

  insert into seed_users (email, phone, full_name, role, branch_short_code) values
    ('owner@demo.test',        '+201000000001', 'Mostafa Kamel',   'OWNER',           null),
    ('manager.br1@demo.test',   '+201000000002', 'Ali Fahmy',      'BRANCH_EMPLOYEE', 'BR1'),
    ('manager.br2@demo.test',   '+201000000003', 'Nour El-Sayed',  'BRANCH_EMPLOYEE', 'BR2'),
    ('employee.br1@demo.test',  '+201000000004', 'Omar Zeidan',    'BRANCH_EMPLOYEE', 'BR1'),
    ('employee.br2@demo.test',  '+201000000005', 'Kareem Adel',    'BRANCH_EMPLOYEE', 'BR2');

  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone, phone_confirmed_at, phone_change, phone_change_token,
    reauthentication_token
  )
  select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    u.email, v_pw, now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', u.full_name),
    now() - interval '40 days', now(), '', '', '', '', '', u.phone, now(), '', '', ''
  from seed_users u;

  insert into auth.identities (user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
  select u.id, u.phone, 'phone',
    jsonb_build_object('sub', u.id::text, 'phone', u.phone, 'phone_verified', true),
    now(), now(), now()
  from seed_users u;

  insert into auth.identities (user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
  select u.id, u.id, 'email',
    jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
    now(), now(), now()
  from seed_users u;

  insert into public.profiles (id, company_id, phone, full_name, role, branch_id, is_active)
  select u.id, v_company, u.phone, u.full_name, u.role, b.id, true
  from seed_users u
  left join public.branches b on b.short_code = u.branch_short_code;

  select id into v_owner from seed_users where email = 'owner@demo.test';
  select id into v_mgr1 from seed_users where email = 'manager.br1@demo.test';
  select id into v_mgr2 from seed_users where email = 'manager.br2@demo.test';
  select id into v_emp1 from seed_users where email = 'employee.br1@demo.test';
  select id into v_emp2 from seed_users where email = 'employee.br2@demo.test';

  -- 3. Categories ------------------------------------------------------------
  insert into public.product_categories (company_id, name, description)
  values (v_company, 'Filters', 'All filter types') returning id into v_cat_filters;
  insert into public.product_categories (company_id, name)
  values (v_company, 'Brakes') returning id into v_cat_brakes;
  insert into public.product_categories (company_id, name)
  values (v_company, 'Engine Components') returning id into v_cat_engine;
  insert into public.product_categories (company_id, name)
  values (v_company, 'Batteries & Electrical') returning id into v_cat_electrical;
  insert into public.product_categories (company_id, name)
  values (v_company, 'Body Parts') returning id into v_cat_body;
  insert into public.product_categories (company_id, name)
  values (v_company, 'Fluids & Lubricants') returning id into v_cat_fluids;

  insert into public.product_categories (company_id, name, parent_category_id) values
    (v_company, 'Oil Filters',   v_cat_filters),
    (v_company, 'Air Filters',   v_cat_filters),
    (v_company, 'Fuel Filters',  v_cat_filters),
    (v_company, 'Brake Pads',    v_cat_brakes),
    (v_company, 'Brake Discs',   v_cat_brakes),
    (v_company, 'Spark Plugs',   v_cat_engine),
    (v_company, 'Timing Belts',  v_cat_engine);

  -- 4. Custom attribute definitions ------------------------------------------
  insert into public.product_attribute_definitions (company_id, name, data_type, options, display_order)
  values (v_company, 'Engine Size', 'NUMBER', null, 1) returning id into v_attr_engine;
  insert into public.product_attribute_definitions (company_id, name, data_type, options, display_order)
  values (v_company, 'Transmission', 'DROPDOWN', array['Manual', 'Automatic', 'CVT'], 2)
  returning id into v_attr_trans;
  insert into public.product_attribute_definitions (company_id, name, data_type, options, display_order)
  values (v_company, 'Compatible Generation', 'TEXT', null, 3) returning id into v_attr_gen;
  insert into public.product_attribute_definitions (company_id, name, data_type, options, display_order)
  values (v_company, 'Warranty Months', 'NUMBER', null, 4) returning id into v_attr_warranty;
  insert into public.product_attribute_definitions (company_id, name, data_type, options, display_order)
  values (v_company, 'Color', 'TEXT', null, 5) returning id into v_attr_color;

  -- 5. Products (shared catalog) ---------------------------------------------
  insert into public.products (company_id, name, category_id, manufacturer, brand,
    car_make, car_model, manufacturing_year, selling_price, purchase_cost,
    sku, oem_number, condition, is_active)
  values (v_company, 'Oil Filter OF-1001',
    (select id from public.product_categories where company_id = v_company and name = 'Oil Filters'),
    'Mann Filter', 'Mann', 'Toyota', 'Corolla', 2018, 120.00, 85.00,
    'OF-1001', '041-0032', 'NEW', true)
  returning id into v_of;

  insert into public.products (company_id, name, category_id, brand, car_make, car_model,
    selling_price, purchase_cost, sku, condition)
  values (v_company, 'Air Filter AF-1002',
    (select id from public.product_categories where company_id = v_company and name = 'Air Filters'),
    'Bosch', 'Toyota', 'Camry', 90.00, 60.00, 'AF-1002', 'NEW')
  returning id into v_af;

  insert into public.products (company_id, name, category_id, car_make, car_model,
    selling_price, purchase_cost, sku, condition)
  values (v_company, 'Fuel Filter FF-1003',
    (select id from public.product_categories where company_id = v_company and name = 'Fuel Filters'),
    'Hyundai', 'Tucson', 150.00, 110.00, 'FF-1003', 'NEW')
  returning id into v_ff;

  insert into public.products (company_id, name, category_id, brand, car_make, car_model,
    selling_price, purchase_cost, sku, condition)
  values (v_company, 'Brake Pads BP-2001',
    (select id from public.product_categories where company_id = v_company and name = 'Brake Pads'),
    'TRW', 'Hyundai', 'Elantra', 350.00, 260.00, 'BP-2001', 'NEW')
  returning id into v_bp;

  insert into public.products (company_id, name, category_id, brand, car_make,
    selling_price, purchase_cost, sku, condition)
  values (v_company, 'Brake Discs BD-2002',
    (select id from public.product_categories where company_id = v_company and name = 'Brake Discs'),
    'Brembo', 'Kia Sportage', 700.00, 520.00, 'BD-2002', 'NEW')
  returning id into v_bd;

  insert into public.products (company_id, name, category_id, brand,
    selling_price, purchase_cost, sku, condition)
  values (v_company, 'Car Battery 70Ah BT-3001',
    (select id from public.product_categories where company_id = v_company and name = 'Batteries & Electrical'),
    'Chloride Egypt', 900.00, 650.00, 'BT-3001', 'NEW')
  returning id into v_bt;

  insert into public.products (company_id, name, category_id, brand, car_make,
    selling_price, purchase_cost, sku, condition)
  values (v_company, 'Spark Plug Set SP-4001',
    (select id from public.product_categories where company_id = v_company and name = 'Spark Plugs'),
    'NGK', 'Nissan Sunny', 45.00, 30.00, 'SP-4001', 'NEW')
  returning id into v_sp;

  insert into public.products (company_id, name, selling_price, purchase_cost, sku)
  values (v_company, 'Wiper Blade Set WS-5001', 75.00, 50.00, 'WS-5001')
  returning id into v_ws;

  insert into public.products (company_id, name, category_id, brand, car_make, car_model,
    selling_price, purchase_cost, sku, condition)
  values (v_company, 'Timing Belt TB-6001',
    (select id from public.product_categories where company_id = v_company and name = 'Timing Belts'),
    'Gates', 'Toyota', 'Corolla', 480.00, 360.00, 'TB-6001', 'NEW')
  returning id into v_tb;

  -- Incomplete-info products (only name + price mandatory)
  insert into public.products (company_id, name, selling_price)
  values (v_company, 'Universal Washer Fluid', 35.00) returning id into v_wf;
  insert into public.products (company_id, name, category_id, selling_price, purchase_cost)
  values (v_company, 'Brake Fluid DOT-4 1L', v_cat_fluids, 65.00, 45.00) returning id into v_bf;
  insert into public.products (company_id, name, category_id, selling_price, purchase_cost)
  values (v_company, 'Engine Oil 5W-30 4L', v_cat_fluids, 320.00, 240.00) returning id into v_eo;
  insert into public.products (company_id, name, category_id, selling_price, purchase_cost)
  values (v_company, 'Headlight Assembly LH', v_cat_body, 1200.00, 900.00) returning id into v_hl;

  -- Inactive product demo
  insert into public.products (company_id, name, selling_price, purchase_cost, is_active)
  values (v_company, 'Legacy Radio Unit', 400.00, 250.00, false) returning id into v_radio;

  -- 6. Attribute values --------------------------------------------------------
  insert into public.product_attribute_values (product_id, attribute_id, value_number)
  values (v_sp, v_attr_engine, 1.6000);
  insert into public.product_attribute_values (product_id, attribute_id, value_number)
  values (v_bt, v_attr_warranty, 24.0000);
  insert into public.product_attribute_values (product_id, attribute_id, value_text)
  values (v_tb, v_attr_gen, 'E170');
  insert into public.product_attribute_values (product_id, attribute_id, value_text)
  values (v_hl, v_attr_color, 'Chrome');

  -- 7. Customers ---------------------------------------------------------------
  insert into public.customers (company_id, name, phone, notes)
  values (v_company, 'Ahmed Hassan', '01012345678', 'Regular taxi fleet customer')
  returning id into v_cust1;
  insert into public.customers (company_id, name, phone)
  values (v_company, 'Sara Mostafa', '01098765432') returning id into v_cust2;

  -- 8. Inventory ledger: rows + movements (hand-verified chain) -----------------
  -- Inventory rows (final quantities)
  insert into public.branch_inventory (branch_id, product_id, quantity, low_stock_threshold) values
    (v_br1, v_of, 8, null),
    (v_br1, v_bp, 1, 5),        -- low-stock demo (1 < threshold 5)
    (v_br1, v_sp, 20, null),
    (v_br2, v_of, 4, null),
    (v_br2, v_bp, 9, null),
    (v_br2, v_bt, 1, null),
    (v_br2, v_ws, 15, null),
    (v_br2, v_sp, 10, null),
    (v_br2, v_tb, 5, null);

  -- Sales references (inserted below with matching ids)
  insert into public.sales (
    id, company_id, branch_id, sale_number, subtotal, discount_type,
    discount_value, discount_amount, total_amount, payment_method, status,
    created_by, created_at, idempotency_key
  ) values
    (gen_random_uuid(), v_company, v_br1, 'BR1-000001', 240.00, 'NONE', 0, 0, 240.00,
     'CASH', 'COMPLETED', v_emp1, date_trunc('day', now()) + interval '10 hours', gen_random_uuid())
  returning id into v_sale1;

  insert into public.sales (
    id, company_id, branch_id, sale_number, subtotal, discount_type,
    discount_value, discount_amount, total_amount, payment_method, status,
    created_by, created_at, idempotency_key
  ) values
    (gen_random_uuid(), v_company, v_br2, 'BR2-000002', 120.00, 'NONE', 0, 0, 120.00,
     'CASH', 'COMPLETED', v_mgr2, now() - interval '1 day', gen_random_uuid())
  returning id into v_sale2;

  insert into public.sales (
    id, company_id, branch_id, customer_id, sale_number, subtotal, discount_type,
    discount_value, discount_amount, total_amount, payment_method, status,
    created_by, created_at, idempotency_key
  ) values
    (gen_random_uuid(), v_company, v_br2, v_cust1, 'BR2-000003', 900.00, 'PERCENT', 10.00,
     90.00, 810.00, 'CARD', 'COMPLETED', v_mgr2, now() - interval '3 days', gen_random_uuid())
  returning id into v_sale3;

  insert into public.sales (
    id, company_id, branch_id, sale_number, subtotal, discount_type,
    discount_value, discount_amount, total_amount, payment_method, status,
    void_reason, created_by, created_at, idempotency_key
  ) values
    (gen_random_uuid(), v_company, v_br1, 'BR1-000004', 90.00, 'NONE', 0, 0, 90.00,
     'CARD', 'VOIDED', 'Wrong item scanned', v_emp1, now() - interval '7 days', gen_random_uuid())
  returning id into v_sale4;

  insert into public.sale_items (
    sale_id, product_id, product_name_snapshot, quantity, unit_selling_price,
    unit_purchase_cost_snapshot, discount_amount, line_total, created_at
  ) values
    (v_sale1, v_of, 'Oil Filter OF-1001', 2, 120.00, 85.00, 0, 240.00,
     date_trunc('day', now()) + interval '10 hours'),
    (v_sale2, v_of, 'Oil Filter OF-1001', 1, 120.00, 85.00, 0, 120.00, now() - interval '1 day'),
    (v_sale3, v_bt, 'Car Battery 70Ah BT-3001', 1, 900.00, 650.00, 0, 900.00, now() - interval '3 days'),
    (v_sale4, v_sp, 'Spark Plug Set SP-4001', 2, 45.00, 30.00, 0, 90.00, now() - interval '7 days');

  -- Movement history (previous/new quantities verified against rows above)
  insert into public.inventory_movements (
    branch_id, product_id, movement_type, quantity_change, previous_quantity,
    new_quantity, unit_purchase_cost, reason, reference_type, reference_id,
    created_by, created_at
  ) values
    -- opening stock
    (v_br1, v_of, 'INITIAL_STOCK', 10, 0, 10, 85.00, 'Opening stock', 'MANUAL', null, v_owner, now() - interval '30 days'),
    (v_br1, v_bp, 'INITIAL_STOCK', 6, 0, 6, 260.00, 'Opening stock', 'MANUAL', null, v_owner, now() - interval '30 days'),
    (v_br1, v_sp, 'INITIAL_STOCK', 20, 0, 20, 30.00, 'Opening stock', 'MANUAL', null, v_owner, now() - interval '30 days'),
    (v_br2, v_of, 'INITIAL_STOCK', 5, 0, 5, 85.00, 'Opening stock', 'MANUAL', null, v_owner, now() - interval '25 days'),
    (v_br2, v_bp, 'INITIAL_STOCK', 8, 0, 8, 260.00, 'Opening stock', 'MANUAL', null, v_owner, now() - interval '25 days'),
    (v_br2, v_bt, 'INITIAL_STOCK', 2, 0, 2, 650.00, 'Opening stock', 'MANUAL', null, v_owner, now() - interval '25 days'),
    (v_br2, v_ws, 'INITIAL_STOCK', 15, 0, 15, null, 'Opening stock', 'MANUAL', null, v_owner, now() - interval '25 days'),
    (v_br2, v_sp, 'INITIAL_STOCK', 10, 0, 10, 30.00, 'Opening stock', 'MANUAL', null, v_owner, now() - interval '20 days'),
    (v_br2, v_tb, 'INITIAL_STOCK', 5, 0, 5, 360.00, 'Opening stock', 'MANUAL', null, v_owner, now() - interval '20 days'),
    -- adjustments
    (v_br1, v_bp, 'DAMAGE', -5, 6, 1, null, 'Damaged in storage — torn packaging', 'MANUAL', null, v_emp1, now() - interval '10 days'),
    (v_br2, v_bp, 'MANUAL_ADJUSTMENT', 1, 8, 9, null, 'Physical count correction', 'MANUAL', null, v_mgr2, now() - interval '2 days'),
    -- sales
    (v_br1, v_of, 'SALE', -2, 10, 8, 85.00, null, 'SALE', v_sale1, v_emp1, date_trunc('day', now()) + interval '10 hours'),
    (v_br2, v_of, 'SALE', -1, 5, 4, 85.00, null, 'SALE', v_sale2, v_mgr2, now() - interval '1 day'),
    (v_br2, v_bt, 'SALE', -1, 2, 1, 650.00, null, 'SALE', v_sale3, v_mgr2, now() - interval '3 days'),
    -- voided sale: deduction + compensating return
    (v_br1, v_sp, 'SALE', -2, 20, 18, 30.00, null, 'SALE', v_sale4, v_emp1, now() - interval '7 days'),
    (v_br1, v_sp, 'SALE_RETURN', 2, 18, 20, 30.00, 'Void: Wrong item scanned', 'SALE', v_sale4, v_emp1, now() - interval '7 days' + interval '5 minutes');

  -- 9. Sale numbering continues after seeded sales
  perform setval('public.sale_number_seq', 4, true);
end;
$seed$;
