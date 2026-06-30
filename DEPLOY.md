# Deploying to Render

This app deploys as three Render resources:

1. **PostgreSQL** — managed database
2. **Web Service** — the API (`server/`)
3. **Static Site** — the React frontend (`client/`)

> Local development still uses **SQLite** (no change). The Render build swaps the
> Prisma datasource to **PostgreSQL** automatically, so production uses Postgres.

---

## Option A — One-click Blueprint (recommended)

A `render.yaml` blueprint is included at the repo root.

1. Push this repo to GitHub.
2. In Render: **New → Blueprint**, pick the repo. Render reads `render.yaml` and
   proposes the database + two services. Click **Apply**.
3. Wait for the first deploy. Then set the two cross-URL env vars (Render can't
   know the URLs until the services exist):
   - On **cpa-tax-tracker-api** → Environment → set `CLIENT_ORIGIN` to the static
     site URL, e.g. `https://cpa-tax-tracker-web.onrender.com`
   - On **cpa-tax-tracker-web** → Environment → set `VITE_API_URL` to the API URL
     **plus `/api`**, e.g. `https://cpa-tax-tracker-api.onrender.com/api`
4. Trigger a redeploy of the static site so the new `VITE_API_URL` is baked into
   the build (Vite env vars are read at build time).
5. Open the site → **"Need to set up the first admin account?"** → register. The
   first user becomes ADMIN, after which registration locks down.

---

## Option B — Manual setup (dashboard)

**1. Database:** New → PostgreSQL → create. Copy its **Internal Database URL**.

**2. API (Web Service):** New → Web Service → this repo.
- Root directory: `server`
- Build command:
  ```
  npm install && sed -i 's/provider = "sqlite"/provider = "postgresql"/' prisma/schema.prisma && npx prisma generate && npx prisma db push --accept-data-loss && npm run build
  ```
- Start command: `npm run start`
- Health check path: `/api/health`
- Environment variables:
  - `DATABASE_URL` = the Postgres Internal URL
  - `JWT_SECRET` = a long random string
  - `CLIENT_ORIGIN` = the static site URL (from step 3)
  - `NODE_VERSION` = `20`

**3. Frontend (Static Site):** New → Static Site → this repo.
- Root directory: `client`
- Build command: `npm install && npm run build`
- Publish directory: `dist`
- Add a **Rewrite** rule: source `/*` → destination `/index.html` (SPA routing)
- Environment variable:
  - `VITE_API_URL` = the API URL + `/api`

Register the first admin as in Option A, step 5.

---

## Notes

- **Free tier** services sleep after ~15 min idle; the first request then takes
  ~30–60s to wake. A paid instance stays warm.
- **Free Postgres** on Render expires after 90 days — upgrade the database to a
  paid plan before then to keep your data.
- **Schema changes:** the build uses `prisma db push`, which syncs the live DB to
  `schema.prisma` on every deploy. For stricter change control later, switch to
  Prisma migrations (`prisma migrate deploy`) with Postgres-generated migrations.
- **Local dev is unaffected** — `schema.prisma` stays on SQLite in the repo; only
  the Render build rewrites it.
