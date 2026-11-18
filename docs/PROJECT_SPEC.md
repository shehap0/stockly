# PROJECT_SPEC — Stockly

Multi-branch auto parts inventory & sales management system for a small automotive
spare-parts business with two initial physical branches, one shared product catalog, and
one centralized database.

**Currency:** EGP (ج.م) — displayed only; stored as plain `numeric(12,2)`.

## 1. Business requirements

- One company starts with two active branches, العرب and زرزاره. Owners can add branches as the
  business grows. All branches share one product catalog and central Postgres database.
- Branch-specific inventory quantities; real-time visibility of availability across branches.
- Employees record sales (CASH/CARD as a **payment record**, no gateway) and manually add
  locally purchased stock.
- Owner manages the whole business from one application.

## 2. Functional requirements

| Area | Requirements |
|---|---|
| **Auth** | Email or phone number + password login, logout, session management, user activation/deactivation, role-based + branch-based permissions enforced by Postgres RLS. |
| **Users** | OWNER (company-wide) and BRANCH_EMPLOYEE (own branch). Created only by the owner (via Edge Function). No self-signup. |
| **Catalog** | Shared products: only `name` + `selling_price` mandatory. Optional: description, category, image, manufacturer, brand, car_make, car_model, year, sku, barcode, oem_number, condition. Prices `numeric(12,2)`. |
| **Custom attributes** | Owner-defined per-company attributes (text/number/boolean/dropdown/date), optional by default, `is_required` enforceable, type-validated, values preserved on edits, deactivated attrs handled safely. |
| **Categories** | Optional hierarchy (parent_category_id). Deletion blocked when referenced. |
| **Inventory** | `branch_inventory(branch_id, product_id)` UNIQUE, `quantity >= 0` enforced, per-branch `low_stock_threshold`. Every stock change writes an `inventory_movements` record (INITIAL_STOCK, STOCK_ADDITION, SALE, SALE_RETURN, DAMAGE, MANUAL_ADJUSTMENT, OTHER). No transfers. |
| **Sales** | Multi-line sale, fixed/percentage discounts (validated server-side, ≤ subtotal, % capped by settings for non-owners), CASH/CARD, COMPLETED/VOIDED, full void with compensating restock movements, historical price/cost snapshots immutable, idempotent retries, atomic transaction with row locking — concurrent sales of the last unit: exactly one wins. |
| **Customers** | Optional; anonymous/walk-in sales allowed; owner views customer sales history. |
| **Images** | Supabase Storage; client-compressed WebP; validated type/size; product works with no image. |
| **Realtime** | Supabase Realtime events **invalidate TanStack Query caches only**; Postgres is the single source of truth. Online-only; failed ops surface real errors; retries reuse idempotency keys. |
| **Reports** | Dashboard metrics (sales today/week/month, tx count, stock value, gross profit from cost snapshots), branch comparison, inventory reports (low/out-of-stock, movements, top sellers, stale products), sales reports (daily/weekly/monthly, cash/card, discounts, best sellers). Unknown purchase cost ⇒ no invented profit. |
| **Audit** | Append-only `audit_logs` for catalog/price/attribute/user/permission changes; not user-modifiable; no secrets recorded. |

## 3. Non-functional requirements

- Strict TypeScript; no `any`; business logic separate from UI; all money math in SQL (`numeric`).
- Database indexes, pagination, no N+1, scoped realtime subscriptions, cached reads with
  post-mutation invalidation.
- Supabase Free → Cloudflare Pages; upgradeable without architecture changes.
- Versioned, reproducible migrations; seed data for dev only; no secrets in repo.

## 4. Explicit exclusions

Branch-to-branch transfers · supplier management · purchase orders · purchase workflows ·
employee surveillance/monitoring/attendance · payment gateways/online payments ·
ecommerce · delivery · warehouse logistics · full accounting/payroll · multi-currency
accounting · enterprise multi-tenancy · offline-first sync.

Partial sale returns (line-level refunds) are **deferred to v2** — full-void refunds are in
scope and implemented.
