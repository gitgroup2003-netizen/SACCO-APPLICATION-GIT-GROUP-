# Amani SACCO — new loan system: setup (about 10 minutes)

Do the steps in order. Each one has a check so you know it worked.

## Step 1 — Database (Supabase → SQL Editor → New query, one file at a time)

Paste and run each file completely, in this order:

1. `supabase/migrations/01_loan_foundation.sql`
2. `supabase/migrations/02_loan_engine.sql`
3. `supabase/migrations/03_loan_hardening.sql`

All three are safe to run twice.

**Check:** run this:

    select
      (select count(*) from public.loan_products) as products,
      (select count(*) from pg_proc where pronamespace='public'::regnamespace
         and proname in ('apply_for_loan','set_loan_stage','disburse_loan','record_loan_payment',
                         'refresh_arrears','request_guarantor','respond_guarantee','add_collateral',
                         'liquidity_snapshot','my_loan_position','list_guarantee_requests',
                         'list_loan_guarantors','add_loan_note','remove_collateral','set_loan_setting')) as functions;

Expected: products = 1 (or more), functions = 15.

## Step 2 — App code (Codespaces terminal, from the project root)

1. Create the folder: `mkdir -p src/loans`
2. Create these 5 files in `src/loans/` and paste each file's contents:
   `kit.js`, `ui.jsx`, `pdf.js`, `MemberLoans.jsx`, `AdminLoans.jsx`
3. Create `apply_loan_patch.mjs` in the project root, paste it, then run:

       node apply_loan_patch.mjs

   It prints `Done. App.jsx went from 3027 to 2777 lines.` If it says STOP, nothing was changed.

## Step 3 — Verify before committing

    wc -l src/loans/*              # kit.js 133, ui.jsx 312, pdf.js 71, MemberLoans.jsx 635, AdminLoans.jsx 970
    grep -c "loans/kit.js" src/App.jsx    # 1
    grep -c "approveLoan\|ActiveLoanRow\|LoanApplyForm" src/App.jsx   # 0
    npx vite build                 # must end with "built"
    git status

## Step 4 — Deploy
Commit and push. Deploy the code soon after running the SQL: once step 1 is done, the old
loan screens stop working (that is intended — they wrote straight into the loan tables).
