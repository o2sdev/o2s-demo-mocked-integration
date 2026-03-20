# @o2s/integrations.mocked-vercel

Drop-in replacement for the `@o2s/integrations.mocked` **carts** module that persists cart data in PostgreSQL instead of in-memory. Designed for Vercel's serverless infrastructure where each request may hit a different instance, causing in-memory state to be lost.

All other modules (products, checkout, payments, CMS, etc.) remain unchanged from the base `mocked` integration.

## How it works

- Uses [Drizzle ORM](https://orm.drizzle.team/) with [`@vercel/postgres`](https://vercel.com/docs/storage/vercel-postgres) for connection pooling
- Two tables: `carts` and `cart_items` (with cascade delete)
- Product data is denormalized as a JSONB snapshot in `cart_items`
- Same auth checks and business logic as the base mocked integration

## Prerequisites

A PostgreSQL database accessible via a connection string. On Vercel this is typically a [Vercel Postgres](https://vercel.com/docs/storage/vercel-postgres) store; locally you can use any Postgres instance.

## Setup

### 1. Install dependencies

From the monorepo root:

```bash
npm install
```

### 2. Set the `POSTGRES_URL` environment variable

The connection string must be available at build time (for migrations) and at runtime. For local development, create a `.env.local` file in the package directory — all `db:*` scripts load it automatically via `dotenv-cli`:

```bash
# packages/integrations/mocked-vercel/.env.local
POSTGRES_URL=postgres://user:password@host:5432/dbname
```

On Vercel, set this in your project's environment variables instead.

### 3. Run the database migration

```bash
cd packages/integrations/mocked-vercel
npm run db:migrate
```

This applies the SQL migration in `drizzle/` that creates the `carts` and `cart_items` tables.

### 4. Enable the integration

In `packages/configs/integrations/src/models/carts.ts`, swap the import:

```typescript
// Before (in-memory):
import { Config, Integration } from '@o2s/integrations.mocked/integration';

// After (PostgreSQL):
import { Config, Integration } from '@o2s/integrations.mocked-vercel/integration';
```

Then rebuild:

```bash
npm run build
```

## Deploying to Vercel

1. Create a [Vercel Postgres](https://vercel.com/docs/storage/vercel-postgres) store in your Vercel project dashboard.
2. Link it to your project — Vercel will automatically set `POSTGRES_URL` (and related env vars).
3. Run the migration as part of your build or as a one-time step:
   ```bash
   cd packages/integrations/mocked-vercel && npm run db:migrate
   ```
4. Deploy as usual. Cart state will now persist across serverless function invocations.

## Local development

You can test against a local PostgreSQL instance (e.g. via Docker):

```bash
# Start a local Postgres container
docker run --name o2s-postgres \
  -e POSTGRES_USER=o2s \
  -e POSTGRES_PASSWORD=o2s \
  -e POSTGRES_DB=o2s \
  -p 5432:5432 \
  -d postgres:16

# Create .env.local with the connection string
cd packages/integrations/mocked-vercel
echo "POSTGRES_URL=postgres://o2s:o2s@localhost:5432/o2s" > .env.local

# Run the migration
npm run db:migrate

# Start the dev server from the monorepo root
cd ../../..
npm run dev
```

Test cart operations in the browser — add items, refresh the page, and verify the cart persists.

## Drizzle commands

All commands must be run from `packages/integrations/mocked-vercel/`. They load `POSTGRES_URL` from `.env.local` automatically.

```bash
# Apply pending migrations
npm run db:migrate

# Generate a new migration after changing src/db/schema.ts
npm run db:generate

# Push schema directly to the database (quick local dev, skips migration files)
npm run db:push

# Open Drizzle Studio to browse/edit data
npm run db:studio
```

## Reverting to in-memory carts

Change the import in `packages/configs/integrations/src/models/carts.ts` back to `@o2s/integrations.mocked/integration` and rebuild. No database cleanup is required — the tables can be left in place or dropped manually.
