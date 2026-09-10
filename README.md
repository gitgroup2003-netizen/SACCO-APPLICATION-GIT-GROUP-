# Amani SACCO

A savings, shares, and loans management app for a SACCO (savings and credit
co-operative), built with React + Vite and backed by Supabase.

Members can view savings/share balances, apply for loans, and track their
transaction history. Admins can manage members, approve/reject loans, record
deposits/withdrawals/share purchases, and declare year-end dividends.

## 1. Set up Supabase

1. Create a free project at [supabase.com](https://supabase.com).
2. In the Supabase dashboard, open **SQL Editor**, paste in the contents of
   [`supabase/schema.sql`](./supabase/schema.sql), and run it. This creates
   all tables, the signup trigger, and Row Level Security policies.
3. Go to **Settings → API** and copy your **Project URL** and **anon public**
   key.
4. Copy `.env.example` to `.env` and paste those two values in:

   ```
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-public-key
   ```

> The first person who signs up in the app automatically becomes an
> **admin**. Everyone who signs up after that is a regular **member**. You
> can promote/demote later, from the SQL editor:
> ```sql
> update public.profiles set role = 'admin' where id = '<user-uuid>';
> ```

## 2. Run locally

```bash
npm install
npm run dev
```

Open the printed local URL, sign up, and you're in.

## 3. Deploy

This is a static Vite build, so it deploys anywhere that serves static
files. Two easy options:

**Vercel**
1. Push this repo to GitHub.
2. Import it at [vercel.com/new](https://vercel.com/new).
3. Add the two `VITE_SUPABASE_*` environment variables in the project
   settings.
4. Deploy — Vercel auto-detects the Vite build.

**Netlify**
1. Push this repo to GitHub.
2. Import it at [app.netlify.com](https://app.netlify.com).
3. Build command: `npm run build`, publish directory: `dist`.
4. Add the two `VITE_SUPABASE_*` environment variables in site settings.

## Project structure

```
amani-sacco/
├── index.html
├── package.json
├── vite.config.js
├── .env.example          # copy to .env with your Supabase credentials
├── supabase/
│   └── schema.sql        # run once in the Supabase SQL editor
└── src/
    ├── main.jsx           # React entry point
    └── App.jsx            # the whole app (auth, member view, admin view)
```

## Scope note

This covers member/admin accounts, savings, shares, loans with an automated
loan-ceiling rule (savings + shares × 3), repayments, a unified transaction
ledger, and dividend declarations — all backed by Supabase with Row Level
Security.

It does **not** yet include mobile money (M-Pesa/MTN/Airtel) webhooks, a
USSD gateway, payroll CSV ingestion, guarantor fund-locking, government KYC
lookups, an immutable audit log, or a maker-checker approval workflow —
those need real third-party credentials/infrastructure and are best added
as Supabase Edge Functions once you have them.
