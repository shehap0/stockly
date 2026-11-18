# Database reference

The schema is PostgreSQL 17 and is built by the ordered migrations in `supabase/migrations/`.
PostgreSQL is authoritative for inventory, sales totals, permissions, and audit history.

## Core tables

| Table | Purpose / key relationships |
|---|---|
| `companies` | Business tenant and company identity. |
| `branches` | Branches owned by a company; branch code is used in sale numbers. |
| `profiles` | One row per Auth user; company, role, phone, optional branch, active flag. Phone listing is owner-only through RLS. |
| `company_settings` | Company-wide discount and behavior settings. |
| `product_categories` | Optional same-company category tree. |
| `products` | Shared catalog, optional category and descriptive fields, prices and active flag. |
| `product_attribute_definitions` | Company-defined typed attributes and required/options metadata. |
| `product_attribute_values` | Product values associated with a definition. |
| `branch_inventory` | Unique `(branch_id, product_id)` quantity and low-stock threshold. |
| `inventory_movements` | Append-only stock ledger, including before/after quantities and reason. |
| `customers` | Optional company-scoped customer records. |
| `sales` | Branch transaction, payment, discount, totals, status, idempotency key. |
| `sale_items` | Immutable line snapshots for product name, quantity, price and known cost. |
| `audit_logs` | Append-only record of sensitive catalog and permission changes. |

Foreign keys, uniqueness, check constraints, and indexes are declared with the table definitions.
Notable invariants include nonnegative stock, positive sale quantities, unique branch/product
inventory, and unique sale idempotency keys.

## Authorization and operations

`00003_helpers.sql` defines security-definer helpers for current company, role, active status,
owner status, and branch access. `00004_rls.sql` enables row-level security and declares the
read/write policies. Staff may see shared catalog and cross-branch stock availability; branch
sales and movement history are scoped to permitted branches. Audit logs are owner-readable.
Inventory quantities and sales have no direct client write policy.

`00005_business_functions.sql` guards direct stock edits, validates attribute values, records
audits, and defines transactional `add_stock`, `adjust_stock`, `create_sale`, and `void_sale`
operations. Sale creation locks inventory rows in product order, validates discounts and stock,
stores snapshots, records movements, and uses an idempotency key. Voids preserve the original
sale and create compensating stock movements. `00006_realtime.sql` adds relevant tables to the
Realtime publication. `00007_storage.sql` defines the product image bucket policies.

Apply schema changes only through new, numbered migration files. `npm run db:reset` recreates
the local database and reloads development seed data; it is destructive to local database data.
