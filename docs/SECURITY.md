# Security

## Identity and access

Supabase Auth provides email and phone + password sessions. Owner-entered staff phone numbers are marked
confirmed during provisioning, so phone/password sign-in does not send an SMS code. The `profiles` table associates Auth identities
with company, role, branch, phone and active status. RLS is enabled for application tables. Only
owners can list staff profiles and phone numbers; staff can read their own profile. SQL helper
functions and each privileged RPC recheck active status, company and branch access; frontend
route guards are not a security boundary. Inactive users lose data access even if a JWT has not
expired.

Only the owner can manage company catalog and privileged settings. Branch users are constrained
to their permitted branch for sales and movement history. Shared stock availability is an
intentional company-scoped read. Sale, stock, movement, and audit writes are restricted to
database functions/triggers. Audit rows have no client update/delete policy. Product image reads
require an authenticated session; writes are owner-only and constrained to product paths.

`invite-user` must verify the caller's JWT and owner profile before using the service role. It
invites staff by email, attaches a phone number for phone/password sign-in, and allows owners to update
existing staff phone numbers. Keep
`SUPABASE_SERVICE_ROLE_KEY` in Edge Function secrets only. The browser receives only the project
URL and anon key. Local demo users and passwords in the seed are disposable development data and
must never be reused for real accounts.

## Release checks

- Disable public signup in the hosted Auth configuration; users are created through the owner
  invite flow.
- Configure hosted email delivery for staff invitations and password recovery; use HTTPS.
- Enable MFA for owner accounts in the hosted project where available.
- Review RLS and storage policies after every schema change; test with anon, owner, and employee identities.
- Keep dependencies patched and do not log passwords, tokens, or service credentials.
- Restrict dashboard/database access to named operators and rotate secrets after exposure.
