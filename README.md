# 🌾 Digital Kilimo Hub

Tanzania agricultural digital ecosystem — Node.js 20 + Express + PostgreSQL API,
serving a farmer-facing web app from the same service.

## What's here

```
kilimo-hub-node/
├── src/
│   ├── server.js          ← entry point (npm start)
│   ├── db/
│   │   ├── schema.sql      ← full schema, auto-applied on every boot
│   │   └── pool.js         ← Postgres connection pool
│   ├── middleware/auth.js  ← JWT verification + role guards
│   ├── utils/               ← phone/password validation, user serialization
│   └── routes/
│       ├── auth.js          ← register / login / me / logout
│       ├── users.js         ← profile, password change, admin user management
│       ├── groups.js        ← Social Collective Buying
│       ├── logistics.js     ← Dynamic Logistics Link (backhaul matching)
│       ├── markets.js       ← Agri-Intelligence: live crop prices
│       ├── loans.js         ← Credit Scoring Engine
│       ├── alerts.js        ← Agri-Intelligence: pest/weather/market alerts
│       └── admin.js         ← dashboard stats, user/transaction summaries
└── public/
    └── app.html             ← farmer-facing app (wired to the API above)
```

Not yet in this repo: the admin dashboard and marketing site (still static
mockups in the uploaded files, not yet wired), and API routes for the
business-buyer marketplace (`products`/`orders` tables exist in the schema,
no routes built yet — no uploaded frontend needs them yet either).

## Local setup

```bash
npm install
cp .env.example .env      # then fill in DATABASE_URL, SECRET_KEY, etc.
npm start
```

Visit `http://localhost:8000/health` to confirm it's running, and
`http://localhost:8000/app.html` for the farmer app. The schema is created
automatically on boot — there's no separate migration step.

## Deploying on Render

1. Push this repo to GitHub.
2. On Render: **New → PostgreSQL** — create a database, then copy its
   **Internal Database URL**.
3. On Render: **New → Web Service** — connect the GitHub repo.
   - Environment: Node
   - Build command: `npm install`
   - Start command: `npm start`
4. Under the web service's **Environment** tab, add:
   - `DATABASE_URL` — the Internal Database URL from step 2
   - `SECRET_KEY` — a long random string (never reuse the one in `.env.example`)
   - `ALLOWED_ORIGINS` — your Render URL once you have it (comma-separated if more than one)
   - `FIRST_ADMIN_PHONE` / `FIRST_ADMIN_PASSWORD` — set once to create your
     admin account, then you can delete these two variables and redeploy
5. Deploy. Watch the logs for `✓ Mfumo uko tayari!`.

Render assigns `PORT` automatically — the app already reads `process.env.PORT`.

## API endpoints

| Module | Base | Notes |
|---|---|---|
| Auth | `/auth` | `POST /register`, `POST /login`, `GET /me`, `POST /logout` |
| Users | `/users` | self-service profile + admin user management |
| Groups | `/groups` | list/create/join/delete — collective buying |
| Logistics | `/logistics` | list/create/book/status/delete — backhaul matching |
| Markets | `/markets` | list (public) / create / update / delete (admin) |
| Loans | `/loans` | apply, list, approve/reject (admin) — approval raises trust score |
| Alerts | `/alerts` | list (public, region-scoped) / create / delete (admin) |
| Admin | `/admin` | `/stats`, `/users/all`, `/transactions/all`, `/seed-markets` |

All write endpoints require `Authorization: Bearer <token>` from `/auth/login`.
Role gates match the original design: only `admin` can create groups, prices,
alerts, or approve loans; only `mkulima` (or admin) can join groups.

## Security notes

- Passwords are hashed with bcrypt — nobody, including an admin, can see them.
- No default admin password ships in this repo. Set `FIRST_ADMIN_PHONE` /
  `FIRST_ADMIN_PASSWORD` as Render environment variables, not in code.
- `SECRET_KEY` must be a real random value set on Render — the placeholder in
  `.env.example` is intentionally unusable in production.
- Real mobile-money integration (M-Pesa, Tigo Pesa, Airtel Money) is **not**
  wired in yet — that needs business API credentials from each provider.
  Transactions are recorded in the database when actions happen (joining a
  group, booking a trip), but no money actually moves yet.
