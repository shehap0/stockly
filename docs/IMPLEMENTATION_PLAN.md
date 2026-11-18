# IMPLEMENTATION_PLAN — Stockly

Milestone plan (doc.txt §16). Each milestone ends with a summary: files, tests run,
results, known issues — then continue.

## M0 — Repository & scaffold ✅ (this commit-ish)
- Docs: PROJECT_SPEC, ARCHITECTURE, IMPLEMENTATION_PLAN.
- Vite + React 19 + TS strict scaffold, Vitest wired.
- `supabase init`, `.env.example`, `.gitignore`.
- Install Supabase CLI; bring up local stack (`supabase start`).

## M1 — Infrastructure & database ✅
- Migrations (numbered, reproducible):
  1. Extensions (pgcrypto, pg_trgm).
  2. Enums, tables, constraints, indexes, triggers (`updated_at`).
  3. RLS helper functions (`user_role`, `is_owner`, `can_access_branch`, `is_active_user`).
  4. RLS enablement + policies for all tables.
  5. RPCs: `add_stock`, `adjust_stock`, `create_sale`, `void_sale` (+ locking, idempotency).
  6. Attribute validation trigger, audit triggers, sale numbering sequence.
  7. Realtime publication.
- `seed.sql`: demo company, two named branches (owner-expandable), users (owner/employee with known dev
  passwords), categories, products, attributes, inventory, sales, customers.
- Frontend: supabase client, types, TanStack Query setup, email-or-phone/password login, logout/session,
  role-guarded route shell.
- Tests: DB access + authorization smoke tests.

## M2 — Product catalog ✅
- Products CRUD (name+price mandatory), categories, custom attribute defs/values,
  image upload (canvas-compressed WebP) with storage policies, search/filter/pagination.
- Tests: CRUD validation, invalid prices, invalid attribute values, deactivation.

## M3 — Inventory ✅
- Add stock / adjust stock screens, movement history, low-stock (per branch+product),
  cross-branch availability, realtime cache invalidation.
- Tests: branch isolation, aggregate totals, negative-quantity rejection, movement
  audit trail, unauthorized changes fail.

## M4 — Sales ✅
- Sale screen (cart, discounts, CASH/CARD/INSTAPAY), `create_sale` RPC, history + filters,
  optional customer, `void_sale` RPC with compensating movements, idempotency,
  concurrency (two simultaneous last-unit sales → one wins).

## M5 — Dashboard & reports ✅
- Dashboard metrics, branch comparison, inventory & sales reports, gross profit from
  cost snapshots ("unknown cost" honored), date filters. Verify against known seed data.

## M6 — System administration ✅
- User management via `invite-user` Edge Function, roles/branch assignment,
  activation/deactivation, settings, audit log viewer.

## M7 — Production readiness ⚠️ partial
- Error/loading/empty/network-failure states, reconnection handling, DEPLOYMENT.md
  (Supabase remote + Cloudflare Pages), backup/recovery strategy, free-tier limits,
  security review, full test suite green.
- Operations and security references are documented. Production provider setup, backup
  restore drills, hosted Auth/SMTP settings, and hosted end-to-end checks still require a
  configured project and operator verification.

## Definition of done
Core application milestones M1–M6 are implemented. The overall project is not production
complete until the M7 operator checks above and `doc.txt` §20 acceptance checklist are verified
against a configured hosted project. See TESTING.md for automated coverage and environment needs.
