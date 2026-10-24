# Supabase migration guide

The app now uses **Supabase Auth + Postgres** instead of Firebase Auth + Firestore. All business data is accessed through Next.js API routes with the **service role** key (RLS stays on for direct client access).

## 1. Env vars

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...   # Dashboard → Project Settings → API
```

Add `SUPABASE_SERVICE_ROLE_KEY` to `.env`, `.env.local`, and Vercel.

## 2. Apply schema

In **Supabase Dashboard → SQL Editor**, paste and run:

`supabase/migrations/001_init_schema.sql`

This creates tables, indexes, FKs, RLS, and the `profiles` trigger.

## 3. Migrate existing Firebase data

When Firestore quota allows:

```bash
npx tsx scripts/migrate-firebase-to-supabase.ts --dry-run
npx tsx scripts/migrate-firebase-to-supabase.ts
```

Optional: `MIGRATE_TEMP_PASSWORD=...` for newly created Auth users.

## 4. Architecture

| Layer | Responsibility |
|---|---|
| Browser | Supabase Auth session cookies only (`@supabase/ssr`) |
| `src/proxy.ts` | Refresh session via `getClaims()` |
| API routes | `requireAuth` then `supabaseAdmin()` queries |
| Postgres | Relational tables with real foreign keys |

Clients should **not** query inventory tables directly — keep going through `/api/*`.

## 5. Packages

```bash
npm install @supabase/supabase-js @supabase/ssr
```
