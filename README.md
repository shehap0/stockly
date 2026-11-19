# Stockly

Stockly is a bilingual (Arabic/English), multi-branch inventory and sales app for an automotive parts business. It provides a shared product catalog with branch-level stock, checkout and sales history, customer records, and owner-managed staff, branches, and reports.

## Features

- Owner and employee accounts with branch-based access.
- Arabic (default) and English interface, with light and dark themes.
- Product catalog, categories, and optional product attributes.
- Stock levels and movement history by branch, with low-stock alerts.
- Sales with cash, card, or InstaPay payment records and optional discounts.
- Customer records, sales history, and business reports.
- Supabase Auth, Postgres, Row Level Security, Storage, and Edge Functions.

## Tech stack

- React 19, TypeScript, Vite, and React Router
- TanStack Query and Zod
- Supabase (Postgres, Auth, Storage, and Edge Functions)
- Cloudflare Pages for static frontend hosting

## Local development

Requirements: Node.js (LTS), Docker, and the Supabase CLI.

```bash
npm ci
npm run db:start
cp .env.example .env
```

Get the local Supabase URL and anon key:

```bash
supabase status -o env
```

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env` to the local `API_URL` and `ANON_KEY`, then start the app:

```bash
npm run db:reset
npm run dev
```

`npm run db:reset` reapplies migrations **and replaces the local database with development seed data**. Never run the development seed against production. Demo accounts and their shared password are listed in [docs/TESTING.md](docs/TESTING.md); they are for local development only.

## Available commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start the Vite development server |
| `npm run build` | Type-check and create the production build in `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm test` | Run the unit tests |
| `npm run lint` | Run ESLint |
| `npm run db:start` | Start the local Supabase stack |
| `npm run db:stop` | Stop the local Supabase stack |
| `npm run db:reset` | Reapply local migrations and seed development data |
| `npm run db:push` | Apply migrations to the linked Supabase project |

## Deployment

The frontend is a Vite static site; deploy it with **Cloudflare Pages**, not as a Wrangler Worker. Configure:

- Build command: `npm run build`
- Build output directory: `dist`
- Build environment variables: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`

Create a hosted Supabase project, review and apply migrations, deploy the `invite-user` Edge Function, and configure its secrets. Set up Auth email delivery (custom SMTP for real users), allowed site/redirect URLs, and product image Storage. The browser uses only the project URL and anon/publishable key. **Never expose the service-role key, database password, or SMTP credentials in frontend variables or source control.**

Creating the first user in Supabase Auth alone is not enough: Stockly also needs a matching owner profile associated with the company. Establish the first owner through a controlled operator setup before signing in. Keep public sign-up disabled, and do not run `supabase/seed.sql` against production.

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for deployment, recovery, and backup guidance, and [docs/SECURITY.md](docs/SECURITY.md) for security notes.

## Project documentation

- [Project specification](docs/PROJECT_SPEC.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Database](docs/DATABASE.md)
- [Business rules](docs/BUSINESS_RULES.md)
- [API reference](docs/API_REFERENCE.md)
- [Testing guide](docs/TESTING.md)
- [Deployment and recovery](docs/DEPLOYMENT.md)
