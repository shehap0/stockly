# Business rules

## Inventory

- The catalog is shared; quantities belong to a branch.
- Quantity cannot be negative. All quantity changes go through database RPCs and produce a
  movement ledger entry in the same transaction.
- Stock additions and adjustments are explicit operations. A manual adjustment requires a
  reason. Thresholds are per branch and product.
- Availability reads can include all branches for authorized company users. There are no stock
  transfers in scope.

## Sales and discounts

- A completed sale is one atomic database transaction. The database locks inventory, validates
  quantity and discount rules, snapshots item data, writes the sale and movement rows, and
  decrements stock together.
- Payment method records CASH or CARD; there is no payment processor.
- Fixed discounts cannot exceed the subtotal. Percentage discounts and role-specific caps are
  checked server-side against company settings. Monetary arithmetic uses PostgreSQL `numeric`
  and rounds to two decimal places.
- Clients create one idempotency UUID per sale attempt and reuse it on a retry.
- Historical sale lines retain the product name, selling price and purchase cost known when sold.
- A void is a compensating transaction with a reason and restock movements. The original sale is
  retained. Partial returns are out of scope.

## Reports

- Revenue and counts include completed sales; voided transactions are excluded from sales totals.
- Gross profit uses cost snapshots only. Unknown costs are counted and surfaced as incomplete;
  no cost or profit is fabricated.
- Inventory value is an estimate based only on available purchase costs.

## Access

- Owners have company-wide access. Managers and employees are limited to their assigned branch
  for branch operations, with cross-branch inventory visibility for availability.
- PostgreSQL RLS and RPC permission checks are authoritative; UI guards are for navigation only.
- Inactive profiles are denied by the database helpers and policies.
