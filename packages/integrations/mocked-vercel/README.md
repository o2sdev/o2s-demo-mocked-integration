# @o2s/integrations.mocked-vercel

Drop-in replacement for the `@o2s/integrations.mocked` **carts**, **orders**, and **checkout** modules that persists data in PostgreSQL instead of in-memory. Designed for Vercel's serverless infrastructure where each request may hit a different instance, causing in-memory state to be lost.

All other modules (products, payments, CMS, etc.) remain unchanged from the base `mocked` integration.

## Why this exists

The base `mocked` integration stores carts and placed orders in-memory. On Vercel (serverless), this causes two problems:

1. **Carts disappear** — adding items to a cart works on one invocation, but a subsequent request may hit a different instance where that cart doesn't exist.
2. **Orders are lost** — after checkout, the placed order is pushed to an in-memory array. Viewing the order on the confirmation page or in the order list fails if the request lands on a different instance.

Additionally, because the demo app has a single shared user account, all visitors would see each other's cart items. This integration creates **session-isolated carts** — each browser session gets its own cart via `localStorage`, so carts are never shared between visitors.

## How it works

### Carts
- Uses [Drizzle ORM](https://orm.drizzle.team/) with [`@vercel/postgres`](https://vercel.com/docs/storage/vercel-postgres) for connection pooling
- Tables: `carts` and `cart_items` (with cascade delete)
- Product data is denormalized as a JSONB snapshot in `cart_items`
- **Session-isolated**: `addCartItem` always creates a new cart when no `cartId` is provided (instead of looking up by `customerId`), so each browser session gets its own cart stored in `localStorage`
- `getCurrentCart` returns `undefined` — cart identity is managed client-side to prevent sharing between sessions

### Orders
- Tables: `orders` and `order_items` (with cascade delete)
- `getOrder` checks PostgreSQL first (for orders placed via checkout), then falls back to deterministic mock data
- `getOrderList` merges DB orders with mock data, applies filtering/sorting/pagination
- Mock data uses a seeded PRNG for deterministic results across serverless invocations

### Checkout
- `placeOrder` persists the order to PostgreSQL (instead of pushing to an in-memory array) and deletes the cart from the database
- All other checkout operations (`setAddresses`, `setShippingMethod`, `setPayment`, etc.) delegate to the cart service as before

### Data anonymization
Since this is a public demo app, personal data entered during checkout (names, addresses, emails, phone numbers) is **anonymized before being stored** in the database. The `anonymizeOrder` function replaces PII with random placeholder values while preserving the data structure so the order renders correctly. The original data is returned to the user in the API response (for the order confirmation page) but never persisted.

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

This applies the SQL migrations in `drizzle/` that create the `carts`, `cart_items`, `orders`, and `order_items` tables.

### 4. Enable the integration

In the following config files under `packages/configs/integrations/src/models/`, swap the import to use the mocked-vercel integration:

- `carts.ts`
- `orders.ts`
- `checkout.ts`

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

Test cart and checkout operations in the browser — add items, refresh the page, verify the cart persists, complete a checkout, and verify the order appears on the confirmation page and in the order list.

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

## Reverting to in-memory storage

Change the imports in `packages/configs/integrations/src/models/carts.ts`, `orders.ts`, and `checkout.ts` back to `@o2s/integrations.mocked/integration` and rebuild. No database cleanup is required — the tables can be left in place or dropped manually.
