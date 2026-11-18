# TESTING — Stockly

Runner: **Vitest** (unit + DB integration in one runner).

## Commands

```bash
npm test          # full suite (requires local Supabase running)
npm run test:watch
npm run db:start  # supabase start (first run downloads ~2GB images)
npm run db:reset  # re-apply migrations + seed (wipes local data)
```

The suite expects the local Supabase stack (`supabase start`). `tests/global-setup.mjs`
polls `supabase status` up to 180s, verifies the REST endpoint is healthy, and writes
`tests/.supabase-env.json` (gitignored) with the real local URL/keys. Test clients read
that file — not `.env` — so stale env files can never produce false results.

The CLI must be able to access Docker and write its user configuration. If its home directory is
read-only, point `HOME` at a writable temporary directory for the command, for example
`env HOME=/tmp/stockly-home npm test`. This does not replace Docker access or a running local
stack.

## Test client model

| Client | Auth | Purpose |
|---|---|---|
| `anonClient()` | anon JWT | RLS default-deny checks |
| `clientFor('owner' \| 'managerBr1' \| …)` | seeded user via real `signInWithPassword` | policy checks under real JWTs; legacy helper names map to employees |
| `adminClient()` | service role | setup/teardown only (never an assertion subject) |

Every client gets an **isolated auth storage** — supabase-js polyfills a global
in-memory storage in Node that would otherwise leak sessions between clients.

Seeded users use password `Demo1234!` and can sign in with either their email or phone:

- Owner: `owner@demo.test` or `+201000000001`
- Branch employees: `manager.br1@demo.test` / `+201000000002`, `manager.br2@demo.test` / `+201000000003`, `employee.br1@demo.test` / `+201000000004`, and `employee.br2@demo.test` / `+201000000005` (the first two are legacy email names; all four roles are employees).

## Coverage status

### M1 — auth, RLS, guards (tests/db/001_rls_smoke.test.ts) ✅ 14 tests
- All 5 seeded users sign in with correct password in database integration tests; wrong password rejected.
- Employee can read company-wide profiles but cannot change own role/branch
  (guard trigger raises); self-rename allowed.
- Deactivating a user cuts off all data access instantly (RLS requires active profile).
- Cross-branch visibility: all staff see branches + inventory (availability
  requirement); staff see only own-branch sales; owner sees all.
- Stock guard: direct quantity UPDATE rejected by guard trigger; direct INSERT of
  movements rejected by RLS (no insert policy).
- Audit logs immutable: no UPDATE/DELETE policies; statements affect 0 rows.
- Movement history branch-scoped for branch staff.
- Anon sees nothing.

### M2 — catalog (tests/db/002_catalog.test.ts)
- Product CRUD with mandatory-only fields; optional fields; invalid prices rejected.
- Custom attribute values type-checked; dropdown option membership; required
  attributes enforced; deactivated attribute values frozen.
- Categories: parent in same company; deletion blocked when referenced.
- Owner-only writes enforced against employees.

### M3 — inventory (tests/db/003_inventory.test.ts)
- add_stock: initial stock auto-typed, quantities accumulate, unauthorized branch
  rejected, negative quantity rejected, movements recorded, idempotency retry.
- adjust_stock: signed delta, reason required, below-zero rejected.
- Aggregations: per-branch, company total; low-stock detection.

### M4 — sales (tests/db/004_sales.test.ts)
- Cash/card sales; fixed/percentage discounts; discount caps for non-owners;
  invalid discounts rejected; insufficient stock rejected; historical snapshots
  (name/price/cost) immutable after price changes; anonymous + customer sales;
  void restores stock with SALE_RETURN movements; double-void rejected.
- Concurrency: two parallel last-unit sales → exactly one succeeds; stock never
  negative; no partial records.
- Idempotency: retry with same key returns the original sale.

### M5 — reports (tests/db/005_reports.test.ts + src/features/reports/aggregate.test.ts)
- Seeded ledger truth: 4 seeded sales (3 completed = 1,170 EGP; 1 voided),
  snapshot fields, branch scoping for staff.
- Pure aggregator unit tests: completed-only revenue, payment split, discounts,
  per-branch comparison, top products, daily series; gross profit from purchase
  cost snapshots with `unknownCostUnits` surfaced — never invented.

### M6 — security (tests/db/006_security.test.ts)
- Employees cannot change roles/branches/activation or settings; owner changes
  are audited as PERMISSION_CHANGE; owner cannot demote/deactivate themselves
  (lockout guard; non-privileged self edits still allowed).
- Audit log owner-only. Cross-company isolation: no writing rows tagged with
  another company, no touching foreign companies/branches/settings, no reading
  foreign catalog or branches.
- `invite-user` verifies owner authorization and provisions email/password accounts with a
  confirmed phone login; hosted invitation email delivery depends on the project's email setup.
- Covered elsewhere: employee adjust/void product/price writes (M1–M4).

## Local Edge Function gotcha (path with spaces + SELinux)

`supabase functions serve` computes a broken container mount when the project
path contains a space (observed with CLI 3.2.0: `--main-service=/root` and a
same-path bind mount). On Fedora/SELinux the bind mount is additionally
unreadable from the container (Permission denied even as root). Workarounds used
locally: `chcon -Rt container_file_t supabase/functions`, then symlink
`/root/<function>` inside the container to the function directory. Deployment
(no space in checkout path) is unaffected; see DEPLOYMENT notes in M7.

## Concurrency testing note

Concurrency tests use real parallel RPC calls through supabase-js (no mocks).
