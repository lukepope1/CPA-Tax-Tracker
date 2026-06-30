# CPA Tax Tracker

A practice-management tool for a small CPA firm: track staff time and stay on
top of tax filing deadlines and estimated payment due dates for 1040, 1065,
1120-S, 1120, and 990 returns.

## Features

- **Clients** with a fiscal year end (defaults to calendar year, Dec 31).
- **Engagements** (returns) per client per tax year and form type. Creating
  an engagement automatically generates its filing deadlines and, where
  applicable, quarterly estimated tax payment due dates.
- **Due date tracking**: dashboard of overdue items, items due in the next
  7/30/90 days, and a full due-date list with completion checkboxes.
- **Time entry**: log hours against a client and/or specific return, billable
  or non-billable, with a running total.

## Due date rules implemented

| Form | Original deadline | Extended deadline | Estimated payments |
| --- | --- | --- | --- |
| 1040 (Individual) | 15th day of 4th month after year end (Apr 15 for calendar year) | +6 months (Oct 15) | Apr 15, Jun 15, Sep 15 of the tax year; Jan 15 of the following year |
| 1065 (Partnership) | 15th day of 3rd month after year end (Mar 15) | +6 months (Sep 15) | None (pass-through) |
| 1120-S (S Corp) | 15th day of 3rd month after year end (Mar 15) | +6 months (Sep 15) | None (pass-through) |
| 1120 (C Corp) | 15th day of 4th month after year end (Apr 15) | +6 months (Oct 15); +7 months for a June 30 fiscal year end | 15th day of the 4th, 6th, 9th, and 12th months of the tax year |
| 990 (Exempt Org) | 15th day of 5th month after year end (May 15) | +6 months (Nov 15) | None |

All rules are computed from each client's fiscal year end, so fiscal-year
filers get correctly shifted dates. The calculation logic lives in
[server/src/lib/dueDates.ts](server/src/lib/dueDates.ts).

## Tech stack

- **Server**: Node.js, Express, TypeScript, Prisma ORM, PostgreSQL, JWT auth
- **Client**: React + TypeScript (Vite), Tailwind CSS, React Router, TanStack Query

## Prerequisites

- Node.js 20+ and npm
- A PostgreSQL database (a `docker-compose.yml` is included for local development)

## Setup

### 1. Install dependencies

```bash
npm run install:all
```

### 2. Start a local PostgreSQL database (optional)

```bash
docker compose up -d
```

This starts Postgres on `localhost:5432` with database `cpa_tax_tracker`, user `cpa`, password `cpa`.

### 3. Configure environment variables

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

Edit `server/.env`:
- `DATABASE_URL` – if using the included docker-compose, set to:
  `postgresql://cpa:cpa@localhost:5432/cpa_tax_tracker?schema=public`
- `JWT_SECRET` – set to a long random string

`client/.env` defaults to `VITE_API_URL=http://localhost:4000/api`, which matches the server's default port.

### 4. Run database migrations and seed demo data

```bash
npm run prisma:migrate
npm run seed
```

The seed script creates a demo admin and staff user plus one sample client
per supported form type, each with auto-generated due dates.

**Demo logins:**
- Admin: `admin@cpataxtracker.com` / `password123`
- Staff: `staff@cpataxtracker.com` / `password123`

### 5. Run the app

```bash
npm run dev
```

- API server: http://localhost:4000
- Web app: http://localhost:5173

## Project structure

```
server/   Express API, Prisma schema, migrations, seed script
client/   React (Vite) frontend
```

### Server scripts (run from /server, or via root scripts)
- `npm run dev` – run API with hot reload
- `npm run build` / `npm run start` – production build & run
- `npm run prisma:migrate` – create/apply a migration
- `npm run prisma:deploy` – apply existing migrations (for production)
- `npm run seed` – seed demo data

### Client scripts (run from /client)
- `npm run dev` – run Vite dev server
- `npm run build` – production build (output in `client/dist`)
- `npm run preview` – preview the production build locally

## Data model overview

- **User** – firm staff (first registered user becomes ADMIN)
- **Client** – the firm's clients, with a fiscal year end
- **Engagement** – a specific return (form type + tax year) for a client,
  with status, assigned staff member, and extension flag
- **DueDate** – generated filing and estimated-payment deadlines for an
  engagement, each with a completion checkbox
- **TimeEntry** – hours logged by a user against a client and/or engagement
