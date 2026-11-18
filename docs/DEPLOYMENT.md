# Deployment and recovery

## Local development

1. Install Node.js (current LTS), Docker, and the Supabase CLI.
2. Run `npm ci` and `npm run db:start`.
3. Copy `.env.example` to `.env` and set `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY` from `supabase status -o env`.
4. Run `npm run dev`. Demo accounts accept either their seeded email or phone number with the same password.
5. `npm run db:reset` reapplies migrations and seed data and deletes existing local DB data.

## Hosted Supabase and Cloudflare Pages

1. Create a hosted Supabase project and keep its database password and service-role key in a
   password manager/secret store.
2. Link the repository with the Supabase CLI and review every migration before applying it.
   Apply migrations with `supabase db push`; do not run the development seed against production.
3. Deploy the `invite-user` Edge Function and set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
   `SUPABASE_SERVICE_ROLE_KEY` as function secrets. The service role is server-side only.
4. In Auth, keep public signup disabled, configure email delivery for invitations and password
   recovery, and establish owner access. Staff phone numbers are owner-assigned and confirmed
   during provisioning, so phone/password login does not use SMS verification. Create the first owner through a controlled operator flow;
   never use the demo seed in a live project.
5. In Storage, verify product bucket limits and allowed MIME types. Configure appropriate
   production CORS and database network restrictions for the deployment/operator network.
6. Configure Cloudflare Pages with the repository root, build command `npm run build`, output
   directory `dist`, and environment variables `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY`. Add SPA fallback routing so deep links serve `index.html`.
7. Deploy a preview first and verify email/phone password login, invitations, storage, RLS, RPCs, and realtime
   against a non-production project before promoting.

## Backup and recovery

Treat a hosted free tier as having limited recovery guarantees. Before launch, choose a paid
database backup/PITR arrangement or schedule encrypted logical exports to storage controlled by
the business. Keep encryption keys separate, restrict access, and document retention. At least
quarterly, restore an export into a separate project and verify row counts, auth recovery steps,
storage object recovery, migrations, and application sign-in. Before a risky migration, export a
fresh snapshot and verify rollback/recovery steps. Database exports do not necessarily include
Auth users or Storage objects; back those up through their supported export paths as well.

## Cost and limits

Cloudflare Pages static hosting and Supabase free allowances may be sufficient for evaluation,
but quotas, inactivity behavior, backup, database size, storage and egress
can change. Check current provider pricing and limits before launch. Budget for a paid Supabase
plan and off-platform encrypted backups if the business depends on the service.
No fixed cost estimate is stated here because provider pricing and chosen region/usage change.
