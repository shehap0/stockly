# Database API reference

The SPA calls Supabase PostgREST using the typed client in `src/lib/supabase.ts`. Reads and
permitted catalog/settings changes use table queries subject to RLS. Business-critical stock and
sale writes call PostgreSQL RPCs; do not implement these calculations in the browser.

## RPC operations

| RPC | Purpose | Important behavior |
|---|---|---|
| `add_stock` | Record initial or additional stock for a branch/product. | Validates branch access and positive quantity; retries use the same movement idempotency key. |
| `adjust_stock` | Apply a signed manual quantity delta. | Requires a reason and rejects a negative resulting quantity. |
| `create_sale` | Complete a multi-line cash, card, or InstaPay sale. | Validates discount and stock, locks rows, snapshots prices/costs, deducts stock atomically, and returns the prior result for an idempotent retry. |
| `void_sale` | Void a completed sale. | Requires permission and reason; rejects repeat voids and writes compensating restock movements. |

The authoritative argument and return types are the signatures in
`supabase/migrations/00005_business_functions.sql` and the generated types in
`src/lib/database.types.ts`. The API layer in `src/features/{inventory,sales}/api.ts` owns RPC
calls and cache invalidation. Supabase errors are normalized by `src/lib/errors.ts`; validation,
authorization, conflict, and network failures must remain distinguishable to the UI.

The `invite-user` Edge Function accepts an authenticated owner's email and phone invite request,
sends a password setup invitation by email, and performs server-side role checks before using the
service role to create a user. It also supports the owner-only `set-phone` action for existing
staff. Configure email delivery and function secrets in Supabase; never put the service-role key
in a `VITE_` variable.
