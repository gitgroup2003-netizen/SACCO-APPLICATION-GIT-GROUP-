# Amani SACCO

A savings, shares and loans management app for a SACCO, built with React + Vite on Supabase.

Members see their savings, shares, loans and statements. Staff (manager, cashier, loans officer,
supervisor, board) record transactions, run the loan desk, approve members and declare dividends.

**Before going live read [`docs/GO_LIVE.md`](./docs/GO_LIVE.md).** It has the exact order of steps.

## How money is protected

| Rule | Where it is enforced |
|---|---|
| A balance and its ledger entry change together or not at all | Database functions (`supabase/migrations/04`) |
| Two cashiers working at once cannot overwrite each other | Row locks inside those functions |
| No overdrafts, no zero/negative/NaN amounts, no future dates | Database functions |
| The browser cannot write balances or the ledger directly | Triggers (`05`) |
| Ledger rows cannot be edited or deleted from the app | Triggers (`05`) |
| Only a manager can change roles or approve/suspend accounts; nobody changes their own role | Trigger (`05`) |
| Deposits/withdrawals at or above the approval limit entered by a cashier wait for a manager | `pending_transactions` (`04`) |
| Mobile money / bank / cheque references must be entered and can never be used twice | `payment_references` (`04`) |
| Every change to money tables is written to `audit_log` | Triggers (`05`) |
| The service worker never caches API data | `public/sw.js` |

## Project layout

```
.github/workflows/ci.yml   checks on every push: undefined names, build, database tests
.eslintrc.ci.json          the undefined-name check
docs/GO_LIVE.md            go-live runbook, backups, monitoring, rollback
public/                    PWA files (sw.js, manifest, icons)
src/App.jsx                auth, member app, admin app
src/loans/                 loan screens (member + admin), PDF statements, shared UI
supabase/migrations/       04_ledger_integrity.sql, 05_security_hardening.sql
supabase/tests/            database tests (npm i --no-save @electric-sql/pglite && node supabase/tests/ledger.test.mjs)
supabase/verify_security.sql   run in Supabase after the migrations; every row should say OK
```

The base schema and loan migrations 01-03 live in your Supabase project; see `supabase/README.md`
for how to export them into this repo so the database can be rebuilt from scratch.

## Run locally

```bash
cp .env.example .env     # fill in a TEST Supabase project, not the live one
npm install
npm run dev
```

## What is not included (by design, needs outside accounts)

- Automatic mobile money collection (MTN MoMo / Airtel Money API). Today staff record the payment and
  enter the transaction ID; the system refuses duplicates. See `docs/GO_LIVE.md`, "Mobile money".
- USSD, payroll file import, government KYC lookups.
