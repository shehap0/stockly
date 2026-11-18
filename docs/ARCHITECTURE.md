# ARCHITECTURE — Stockly

## 1. System shape

```
BRANCH 1 ─┐
BRANCH 2 ─┼── Cloudflare Pages (React SPA) ── Supabase
...       ┘                                    ├─ Postgres (source of truth)
                                               ├─ Auth (JWT + RLS)
                                               ├─ Storage (product images)
                                               ├─ Realtime (change feed)
                                               └─ Edge Function: invite-user (service role)
```

- Single SPA. All branches hit the same deployment; branch scoping is data-level (RLS), not deployment-level.
- **Postgres is the single source of truth.** No browser-held inventory, no post-hoc sync.
- All critical business operations are **Postgres RPCs (SECURITY DEFINER)** — the browser can only request, never compute stock/sales semantics.

## 2. Technology decisions

| Decision | Choice | Rationale |
|---|---|---|
| SPA bundler | Vite 7 + React 19 + TS strict | Per spec. |
| Routing | React Router 7 | Per spec. |
| Server state | TanStack Query 5 | Cache + invalidation; realtime events only invalidate. |
| Validation | Zod 4 (client) + Postgres constraints/RPC (server) | Client validation is UX only; server is the boundary. |
| Forms | React Hook Form 7 | Per spec. |
| Money | `numeric(12,2)`; all arithmetic in SQL RPCs | Floats banned; generated types surface numerics as numbers (PostgREST JSON); display formatting only in TS. |
| User creation | Edge Function `invite-user` | Service-role key stays inside Supabase runtime; owner's JWT verified + role re-checked server-side. |
| Rounding | SQL `round(x, 2)` half-up | Documented in BUSINESS_RULES.md. |
| Idempotency | UUID `idempotency_key` UNIQUE on `sales` (+ optional on stock additions, stored on movements) | Safe retries after network timeout. |
| Concurrency | `SELECT … FOR UPDATE` on `branch_inventory` rows, ordered by `product_id` | Serializes conflicting writes; ordered locking avoids deadlocks. |
| Sale numbering | `BR{branch_code}-{global sequence}` | Readable, race-free (sequence). |
| Images | Storage bucket, path `products/{product_id}/{uuid}.webp`, canvas-compressed client-side ≤ 800px | No binaries in Postgres; bandwidth-safe. |

## 3. Data flow

### Reads
UI → TanStack Query → supabase-js (`select` with RLS applied). Scoped pagination everywhere; realtime events → `queryClient.invalidateQueries` → refetch.

### Writes (example: sale)
1. UI builds cart → Zod-validated → `createSaleRpc` mutation.
2. Client generates `idempotency_key` once per cart; retry reuses it.
3. `create_sale(branch_id, items, discount, payment, idempotency_key)` RPC:
   validate profile/branch/stock → lock rows → compute totals (numeric) → insert sale + items + movements + update inventory → commit.
4. On timeout, UI allows retry with the same key → RPC returns the already-committed sale.
5. Realtime broadcast → other branches' caches invalidated → refetch from Postgres.

### Realtime discipline
Events are **notifications**, never proof of commit; they trigger cache invalidation only.
Reconnect handling: on `CHANNEL_ERROR`/`SUBSCRIBED` cycles, refetch affected queries.
Failed realtime delivery never corrupts inventory (only reads are affected).

### Offline / network failure (online-only by design)
- TanStack Query uses `networkMode: 'online'`: queries pause and mutations are not
  sent while offline — nothing pretends to be saved.
- A persistent banner states the connection is down; on `online` we invalidate all
  queries and reconcile from PostgreSQL (idempotency keys make retries safe).
- Errors are normalized by `src/lib/errors.ts` (`describeError`) so connection
  failures never read like business failures.
- Retries: transient/network problems retry twice with backoff; deterministic
  failures (permission, validation, conflict) never retry.
- Realtime channels resubscribe automatically; `SUBSCRIBED` invalidates the
  affected caches so missed events are repaired by a refetch.

### Logging and crash safety
- `src/lib/logger.ts` centralizes client logging (console sink today; swap for a
  collector later). Global `error`/`unhandledrejection` handlers + query/mutation
  error hooks feed it.
- A React error boundary renders a recovery screen instead of a blank page.

## 4. Authorization model

- `profiles` (1:1 with `auth.users`) carries `role`, `branch_id` (null ⇒ owner scope), `company_id`, `is_active`.
- RLS helpers (SECURITY DEFINER, pinned `search_path`): `is_owner()`, `user_role()`, `can_access_branch(b)`, `is_active_user()`.
- Every table: SELECT scoped by company; branch-owned tables also scoped by `can_access_branch` where the doc requires it (sales, movements, customers) while `branch_inventory`/`products` remain company-readable (cross-branch availability is a product requirement).
- Mutations of stock/sales: **no direct INSERT/UPDATE policies** — only RPCs (security definer performs its own permission checks).
- `audit_logs`: INSERT via triggers only; no UPDATE/DELETE policies.
- Inactive users: every policy requires `is_active` ⇒ JWT may outlive deactivation but access is inert.
- No service-role key in the browser; anon key only. Public signup disabled.

## 5. Backend responsibilities split

| Layer | Owns |
|---|---|
| Postgres constraints | Types, NOT NULL, UNIQUE, CHECK, FK, non-negative stock, required-field minimums. |
| Postgres RPCs | Stock math, sale totals, discount caps, snapshots, movements, audit, locking, idempotency. |
| Postgres triggers | `updated_at`, audit log entries, attribute-value validation. |
| supabase-js client | Session handling, typed queries, file upload, realtime subscriptions, idempotency key generation. |
| React UI | Forms, caching UX, optimistic-free (always confirm via server response). |
