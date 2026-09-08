# SecondChance — Proxy & Phone Number Management Dashboard

Internal dashboard for managing residential/mobile proxies and phone numbers across four Vinted markets: France, Belgium, UK, and Germany.

## Tech Stack

- **Next.js 14+** (App Router, TypeScript)
- **Firebase** — Auth (email/password) + Firestore (Admin SDK server-side only)
- **Tailwind CSS + shadcn/ui** — Linear/Vercel-style admin aesthetic
- **TanStack Query** — client-side data fetching with optimistic updates
- **react-hook-form + zod** — forms validated client *and* server-side

## Architecture

**The browser never calls Firestore directly.** Every read/write goes through Next.js API routes (`/app/api/**`) using the Firebase Admin SDK. Firestore security rules deny all direct client access as an additional safety layer.

## Roles

| Role | Label in UI | Permissions |
|---|---|---|
| `admin` | Admin | Everything — user management, audit log, system settings |
| `manager` | Manager/Director | Full inventory, import, approve/reject requests, manual assign/revoke |
| `salesman` | Salesman | Own proxies/numbers only, request new ones, flag broken ones |

> **Assumption**: Manager and Director are treated as the same permission level (role enum: `manager`). If they need separate permissions in the future, add a `director` role to the `Role` type and update the middleware/API guards accordingly.

## Setup

### 1. Firebase Project

1. Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
2. Enable **Authentication** → Email/Password
3. Enable **Firestore** in production mode
4. Create a **Service Account** (Project Settings → Service accounts → Generate new private key)

### 2. Environment Variables

Copy `.env.local.example` to `.env.local` and fill in your values:

```
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=your-service-account@...
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...

AUTH_COOKIE_SECRET=<openssl rand -hex 32>
CRON_SECRET=<openssl rand -hex 32>
NEXT_PUBLIC_BASE_URL=http://localhost:3000

# Optional — Proxy-Cheap auto-sync (daily 9:30 PM Pakistan / 16:30 UTC). One account per country.
PROXY_CHEAP_UK_API_KEY=...
PROXY_CHEAP_UK_API_SECRET=...
PROXY_CHEAP_BE_API_KEY=...
PROXY_CHEAP_BE_API_SECRET=...
PROXY_CHEAP_FR_API_KEY=...
PROXY_CHEAP_FR_API_SECRET=...
# Optional per-account order IDs:
# PROXY_CHEAP_UK_ORDER_IDS=123,456
# PROXY_CHEAP_BE_ORDER_IDS=...
# PROXY_CHEAP_FR_ORDER_IDS=...
```

### 3. Firestore Security Rules

Deploy these rules to lock out all direct client access:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

### 4. Firestore Indexes

Create composite indexes for the following queries (or deploy the `firestore.indexes.json` if provided):

- `proxies`: `country ASC, status ASC, purchasedAt ASC`
- `proxies`: `assignedTo ASC, status ASC, assignedAt DESC`
- `phoneNumbers`: same as proxies
- `requests`: `requestedBy ASC, createdAt DESC`
- `notifications`: `uid ASC, createdAt DESC`

### 5. Install & Run

```bash
npm install
npm run dev
```

### 6. Seed Development Data

```bash
npm run seed
```

Creates 4 test users, 24 proxies, 16 phone numbers, and 2 sample requests.

**Test accounts:**

| Email | Password | Role |
|---|---|---|
| admin@secondchance.test | Admin123! | Admin |
| manager@secondchance.test | Manager123! | Manager/Director |
| salesman1@secondchance.test | Sales123! | Salesman (Omar) |
| salesman2@secondchance.test | Sales123! | Salesman (Laila) |

## CSV Import Format

### Proxies
```
host, port, username, password, country, provider, purchasedAt, expiresAt
1.2.3.4, 8000, user1, pass1, FR, BrightData, 2026-07-01, 2026-08-01
```

### Phone Numbers
```
number, country, provider, purchasedAt, expiresAt
+33612345678, FR, SMSPVA, 2026-07-01, 2026-08-01
```

Both accept comma or semicolon delimiters. `purchasedAt` and `expiresAt` default to today and +30 days if omitted.

## Cron Jobs

### Expiry

The `/api/cron/expire-items` route runs daily (configured in `vercel.json` for Vercel Cron). It sets `status: 'expired'` on any proxy/number whose `expiresAt` has passed.

### Proxy-Cheap sync

The `/api/cron/sync-proxy-cheap` route runs once daily at **9:30 PM Pakistan time** (`30 16 * * *` UTC). It fetches ACTIVE proxies from **three** Proxy-Cheap accounts (UK / BE / FR), forces `country` from the account used, and stores `host`, `port`, `username`, `password`, `status` (`fresh`), `country`, and `proxyCheapId`.

Matching is by **`proxyCheapId`** (the Proxy-Cheap proxy id) only: if that id already exists → skip (existing docs are never updated); if new → insert.

Requires at least one account key pair:
`PROXY_CHEAP_UK_API_KEY` + `PROXY_CHEAP_UK_API_SECRET`,
`PROXY_CHEAP_BE_API_KEY` + `PROXY_CHEAP_BE_API_SECRET`,
and/or `PROXY_CHEAP_FR_API_KEY` + `PROXY_CHEAP_FR_API_SECRET`.

Dry-run (no DB write): `GET /api/cron/sync-proxy-cheap?dryRun=true` with `x-cron-secret`.

On cron-job.org (free alternative / Hobby plan):

- `POST https://your-domain/api/cron/expire-items` daily with header `x-cron-secret: <your CRON_SECRET>`
- `POST https://your-domain/api/cron/sync-proxy-cheap` daily at 9:30 PM Pakistan time with the same header

Vercel Cron may call with `GET` and `Authorization: Bearer <CRON_SECRET>`; the sync route accepts both.

## Pages

| Path | Role | Description |
|---|---|---|
| `/login` | Public | Email/password sign-in |
| `/dashboard` | All | Role-aware landing page |
| `/proxies` | Admin/Manager | Full proxy inventory with filters |
| `/proxies/my` | All | Salesman's own proxies with copy/flag actions |
| `/phone-numbers` | Admin/Manager | Full phone number inventory |
| `/phone-numbers/my` | All | Salesman's own phone numbers |
| `/import` | Admin/Manager | CSV bulk import with preview |
| `/requests` | Admin/Manager | Pending queue + history |
| `/requests/my` | All | Salesman's own request history |
| `/users` | Admin | Create/manage user accounts |
| `/audit-log` | Admin | Full audit trail |
| `/notifications` | All | In-app notifications |

## Deployment

```bash
npm run build
```

Deploy to Vercel. Set all environment variables in the Vercel dashboard. Vercel Cron will automatically call the expire-items route daily at 02:00 UTC (configured in `vercel.json`).
