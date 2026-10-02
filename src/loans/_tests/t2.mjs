import { makeDb, migrate, as, expectFail } from './harness.mjs';
process.on('uncaughtException', e => { console.log('CRASH:', String(e.message).slice(0,400)); process.exit(2); });
const db = await makeDb();
await migrate(db, ['01_loan_foundation.sql','02_loan_engine.sql','03_loan_hardening.sql']);

const asU = (uid, sql, p) => as(db, uid, sql, p);
let pass = 0, fail = 0;
const ok = (c, label, extra='') => { if (c) { pass++; console.log('  ✓', label); } else { fail++; console.log('  ✗ FAIL:', label, extra); } };
const must = async (uid, sql, p, label) => { try { const r = await as(db, uid, sql, p); ok(true, label); return r; } catch (e) { ok(false, label, e.message); return null; } };
const denied = async (uid, sql, p, label, needle) => { const r = await expectFail(db, uid, sql, p, label); ok(r.ok && (!needle || r.msg.includes(needle)), label, r.ok ? `got: ${r.msg}` : r.why); };

const U = { mgr: '00000000-0000-0000-0000-000000000001', off: '00000000-0000-0000-0000-000000000002',
  cash: '00000000-0000-0000-0000-000000000003', a: '00000000-0000-0000-0000-00000000000a',
  b: '00000000-0000-0000-0000-00000000000b', c: '00000000-0000-0000-0000-00000000000c' };
const phones = { mgr:'0700000001', off:'0700000002', cash:'0700000003', a:'0771111111', b:'0772222222', c:'0773333333' };
for (const [k, id] of Object.entries(U))
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1,$2,$3)`, [id, k + '@t.com', JSON.stringify({ full_name: k.toUpperCase() + ' User', phone: phones[k] })]);
await db.exec(`
  update public.profiles set status='active';
  update public.profiles set role='loans_officer' where id='${U.off}';
  update public.profiles set role='cashier' where id='${U.cash}';
  update public.savings_accounts set balance = 2000000 where member_id='${U.a}';
  update public.shares set balance = 500000 where member_id='${U.a}';
  update public.savings_accounts set balance = 1500000 where member_id='${U.b}';
  update public.savings_accounts set balance = 100000 where member_id='${U.c}';
  update public.savings_accounts set balance = 20000000 where member_id='${U.mgr}';
`);
const prod = (await db.query(`select id from public.loan_products limit 1`)).rows[0].id;
await db.exec(`update public.loan_products set penalty_rate_pct = 2, grace_days = 0, processing_fee_pct = 1, insurance_fee_pct = 0.5, min_guarantors = 0, max_term_months = 24 where id = '${prod}'`);

console.log('\n[1] Applying');
const app = await must(U.a, `select public.apply_for_loan($1, 1200000, 6, 'School fees', null) as id`, [prod], 'member A applies for 1.2M / 6 months');
const loanA = app?.rows[0].id;
let row = (await db.query(`select * from public.loans where id=$1`, [loanA])).rows[0];
ok(row.stage === 'application' && row.status === 'pending' && Number(row.outstanding_balance) === 0, 'new loan is stage=application, status=pending');
ok(row.flagged_over_ceiling === false, 'within ceiling is not flagged');
await denied(U.a, `select public.apply_for_loan($1, 500000, 6, null, null)`, [prod], 'cannot open a second application', 'already have an application');
await denied(U.b, `select public.apply_for_loan($1, 1000000, 99, null, null)`, [prod], 'term above product max rejected', 'runs for');
await denied(U.c, `select public.apply_for_loan($1, 900000, 6, null, null)`, [prod], 'amount > 2x savings needs a repayment plan', 'repayment plan');

console.log('\n[2] Direct API attacks by a member');
await denied(U.b, `insert into public.loans (member_id, principal, term_months, status, stage, outstanding_balance, approved_amount) values ('${U.b}', 99999999, 6, 'active', 'disbursed', 0, 99999999)`, [], 'a forged "active/disbursed" loan cannot be inserted through the API', 'row-level security');
await denied(U.b, `insert into public.loans (member_id, principal, term_months) values ('${U.a}', 1000, 6)`, [], 'cannot insert a loan for someone else', 'yourself');
const patchA = await asU(U.a, `update public.loans set status='active', outstanding_balance=0 where id='${loanA}'`);
ok(patchA.affectedRows === 0, 'member PATCH on a loan changes 0 rows', 'rows=' + patchA.affectedRows);
const patchO = await asU(U.off, `update public.loans set stage='approved' where id='${loanA}'`);
ok(patchO.affectedRows === 0, 'even staff PATCH on loans changes 0 rows', 'rows=' + patchO.affectedRows);
const still = (await db.query(`select stage, status from public.loans where id=$1`, [loanA])).rows[0];
ok(still.stage === 'application' && still.status === 'pending', 'the loan is untouched after those attempts');
await denied(U.a, `insert into public.loan_repayments (loan_id, amount) values ('${loanA}', 1)`, [], 'cannot insert a repayment directly');
await denied(U.a, `insert into public.loan_guarantors (loan_id, guarantor_member_id, amount) values ('${loanA}', '${U.b}', 1000)`, [], 'cannot insert a guarantor directly');
await denied(U.a, `insert into public.loan_schedule (loan_id, installment_no, due_date, principal_due, interest_due) values ('${loanA}', 1, now(), 1, 1)`, [], 'cannot forge a schedule');
await denied(U.a, `select public.set_loan_stage('${loanA}', 'approved')`, [], 'member cannot approve', 'Only a loans officer');
await denied(U.a, `select public.disburse_loan('${loanA}')`, [], 'member cannot disburse', 'Only a loans officer');
await denied(U.cash, `select public.set_loan_stage('${loanA}', 'appraisal')`, [], 'cashier cannot process loans', 'Only a loans officer');
await denied(U.a, `select public.set_loan_setting('officer_approval_limit', 999999999)`, [], 'member cannot change settings', 'manager');
await denied(U.off, `select public.set_loan_setting('officer_approval_limit', 999999999)`, [], 'officer cannot change settings', 'manager');

console.log('\n[3] Visibility');
const aSees = (await asU(U.a, `select count(*)::int n from public.loan_portfolio`)).rows[0].n;
const bSees = (await asU(U.b, `select count(*)::int n from public.loan_portfolio`)).rows[0].n;
const offSees = (await asU(U.off, `select count(*)::int n from public.loan_portfolio`)).rows[0].n;
ok(aSees === 1 && bSees === 0 && offSees >= 1, `member A sees ${aSees}, member B sees ${bSees}, officer sees ${offSees}`);

console.log('\n[4] Workflow');
await denied(U.off, `select public.set_loan_stage('${loanA}', 'approved')`, [], 'cannot jump application -> approved', 'cannot move');
await must(U.off, `select public.set_loan_stage('${loanA}', 'appraisal')`, [], 'officer starts appraisal');
await denied(U.off, `select public.set_loan_stage('${loanA}', 'rejected')`, [], 'reject needs a reason', 'reason');
await must(U.off, `select public.set_loan_stage('${loanA}', 'committee')`, [], 'send to committee');
await denied(U.off, `select public.set_loan_stage('${loanA}', 'approved', null, 2000000)`, [], 'cannot approve more than requested', 'more than');
await must(U.off, `select public.set_loan_stage('${loanA}', 'approved', null, 1000000)`, [], 'officer approves 1.0M (under the limit)');
await denied(U.a, `select public.disburse_loan('${loanA}')`, [], 'applicant cannot disburse own loan');
await must(U.off, `select public.disburse_loan('${loanA}', current_date + 10)`, [], 'officer disburses');
const sched = (await db.query(`select * from public.loan_schedule where loan_id=$1 order by installment_no`, [loanA])).rows;
const sumP = sched.reduce((x, r) => x + Number(r.principal_due), 0), sumI = sched.reduce((x, r) => x + Number(r.interest_due), 0);
ok(sched.length === 6, '6 installments generated');
ok(sumP === 1000000, 'principal in the schedule adds up to exactly 1,000,000', 'got ' + sumP);
// independent check of the reducing-balance maths
let bal = 1000000, r = 0.10 / 12, pmt = 1000000 * r / (1 - Math.pow(1 + r, -6)), expI = 0;
for (let i = 1; i <= 6; i++) { const it = Math.round(bal * r); expI += it; const pr = i === 6 ? bal : Math.round(pmt - it); bal -= pr; }
ok(sumI === expI, `interest total ${sumI} matches independent calculation ${expI}`);
row = (await db.query(`select * from public.loans where id=$1`, [loanA])).rows[0];
ok(row.stage === 'disbursed' && row.status === 'active' && Number(row.outstanding_balance) === sumP + sumI, 'loan active, outstanding = principal + interest', `${row.outstanding_balance}`);
ok(Number(row.processing_fee) === 10000 && Number(row.insurance_fee) === 5000, 'fees computed (1% + 0.5%)');
const tx = (await db.query(`select type, amount from public.transactions where member_id=$1 order by created_at, type`, [U.a])).rows;
ok(tx.some(t => t.type === 'loan_disbursement' && Number(t.amount) === 1000000), 'ledger row for the disbursement');
ok(tx.some(t => t.type === 'loan_fee' && Number(t.amount) === 15000), 'ledger row for the fees');
await denied(U.off, `select public.disburse_loan('${loanA}')`, [], 'cannot disburse twice', 'approved');

console.log('\n[5] Repayments');
const first = Number(sched[0].principal_due) + Number(sched[0].interest_due);
await denied(U.cash, `select public.record_loan_payment('${loanA}', 0, 'cash')`, [], 'zero payment refused', 'above zero');
await denied(U.cash, `select public.record_loan_payment('${loanA}', 100, 'bitcoin')`, [], 'bad payment mode refused', 'how the payment');
await denied(U.a, `select public.record_loan_payment('${loanA}', 100, 'cash')`, [], 'member cannot record a payment', 'not allowed');
await db.exec(`update public.profiles set role='loans_officer' where id='${U.a}'`);
await denied(U.a, `select public.record_loan_payment('${loanA}', 100, 'cash')`, [], 'staff cannot record a payment on their own loan', 'own loan');
await db.exec(`update public.profiles set role='member' where id='${U.a}'`);
await must(U.cash, `select public.record_loan_payment('${loanA}', ${first / 2}, 'cash')`, [], 'cashier records a half installment');
let s1 = (await db.query(`select * from public.loan_schedule where loan_id=$1 and installment_no=1`, [loanA])).rows[0];
ok(s1.status === 'partial' && Number(s1.interest_paid) === Number(s1.interest_due), 'interest is cleared first, installment marked partial', JSON.stringify(s1));
await must(U.cash, `select public.record_loan_payment('${loanA}', ${first / 2}, 'mobile_money')`, [], 'second half completes installment 1');
s1 = (await db.query(`select * from public.loan_schedule where loan_id=$1 and installment_no=1`, [loanA])).rows[0];
ok(s1.status === 'paid', 'installment 1 is paid');
const beforeOverpay = (await db.query(`select outstanding_balance from public.loans where id=$1`, [loanA])).rows[0].outstanding_balance;
await denied(U.cash, `select public.record_loan_payment('${loanA}', 99999999, 'cash')`, [], 'overpayment refused', 'too much');
const afterOverpay = (await db.query(`select outstanding_balance from public.loans where id=$1`, [loanA])).rows[0].outstanding_balance;
const repCount = (await db.query(`select count(*)::int n from public.loan_repayments where loan_id=$1`, [loanA])).rows[0].n;
ok(beforeOverpay === afterOverpay && repCount === 2, 'refused overpayment changed nothing (atomic)');
const txBefore = tx.length;

console.log('\n[6] Arrears and penalties');
await db.exec(`update public.loan_schedule set due_date = current_date - 45 where loan_id='${loanA}' and installment_no = 2;
               update public.loan_schedule set due_date = current_date - 15 where loan_id='${loanA}' and installment_no = 3;`);
await must(U.off, `select public.refresh_arrears()`, [], 'refresh arrears');
row = (await db.query(`select * from public.loans where id=$1`, [loanA])).rows[0];
ok(row.days_in_arrears === 45, 'days in arrears = 45', 'got ' + row.days_in_arrears);
const p2 = (await db.query(`select * from public.loan_schedule where loan_id=$1 and installment_no=2`, [loanA])).rows[0];
const base2 = Number(p2.principal_due) + Number(p2.interest_due);
ok(p2.status === 'overdue' && Number(p2.penalty_due) === Math.round(base2 * 0.02 * 2), `penalty = 2% x 2 months on ${base2} = ${p2.penalty_due}`);
const owedNow = Number((await db.query(`select outstanding_balance from public.loans where id=$1`, [loanA])).rows[0].outstanding_balance);
await must(U.off, `select public.refresh_arrears()`, [], 'refresh twice');
const owedAgain = Number((await db.query(`select outstanding_balance from public.loans where id=$1`, [loanA])).rows[0].outstanding_balance);
ok(owedNow === owedAgain, 'refresh is idempotent (penalty does not compound on re-run)');
const par = (await asU(U.off, `select par_bucket, overdue_amount from public.loan_portfolio where loan_id='${loanA}'`)).rows[0];
ok(par.par_bucket === '31-60' && Number(par.overdue_amount) > 0, 'portfolio shows PAR bucket 31-60');
await denied(U.a, `select public.apply_for_loan($1, 100000, 3, null, null)`, [prod], 'member in arrears cannot apply again', 'overdue');
await must(U.cash, `select public.record_loan_payment('${loanA}', ${Number(p2.penalty_due)}, 'cash')`, [], 'pay exactly the penalty');
const p2b = (await db.query(`select * from public.loan_schedule where loan_id=$1 and installment_no=2`, [loanA])).rows[0];
ok(Number(p2b.penalty_paid) === Number(p2b.penalty_due) && Number(p2b.interest_paid) === 0, 'penalty is paid before interest');

console.log('\n[7] Guarantors and locks');
const g = await must(U.b, `select public.apply_for_loan($1, 2500000, 12, 'Business stock', 'Repay 250k monthly from shop income') as id`, [prod], 'member B applies (special request)');
const loanB = g?.rows[0].id;
await denied(U.b, `select public.request_guarantor('${loanB}', '0772222222', 100000)`, [], 'cannot guarantee yourself', 'own loan');
await denied(U.b, `select public.request_guarantor('${loanB}', '0799999999', 100000)`, [], 'unknown guarantor', 'No active member');
const rg = await must(U.b, `select public.request_guarantor('${loanB}', '+256 771 111 111', 800000) as r`, [], 'request guarantor by phone (format-insensitive)');
const gid = rg?.rows[0].r.id;
await denied(U.b, `select public.request_guarantor('${loanB}', 'a@t.com', 800000)`, [], 'asking the same person twice', 'already been asked');
await denied(U.c, `select public.respond_guarantee('${gid}', true)`, [], 'someone else cannot answer the request', 'not found');
await db.exec(`update public.savings_accounts set balance = 500000 where member_id='${U.a}'`);
await denied(U.a, `select public.respond_guarantee('${gid}', true)`, [], 'refuses when free savings are too low', 'free savings');
await db.exec(`update public.savings_accounts set balance = 2000000 where member_id='${U.a}'`);
await must(U.a, `select public.respond_guarantee('${gid}', true)`, [], 'guarantor accepts');
const lk = (await db.query(`select public.member_locked($1) as n`, [U.a])).rows[0].n;
ok(Number(lk) === 800000, 'savings of 800,000 are locked');
await denied(U.mgr, `update public.savings_accounts set balance = 700000 where member_id='${U.a}'`, [], 'savings cannot drop below the pledge', 'pledged');
await db.exec(`update public.savings_accounts set balance = 1500000 where member_id='${U.a}'`);
ok(true, 'savings can still drop while staying above the pledge');
const list = (await asU(U.a, `select * from public.list_guarantee_requests()`)).rows;
ok(list.length === 1 && list[0].borrower_name === 'B User', 'guarantor sees the request with the borrower name');
const gl = (await asU(U.b, `select * from public.list_loan_guarantors('${loanB}')`)).rows;
ok(gl.length === 1 && gl[0].status === 'approved', 'borrower sees accepted guarantor');
await denied(U.c, `select * from public.list_loan_guarantors('${loanB}')`, [], 'unrelated member cannot list guarantors', 'Not allowed');

console.log('\n[8] Product rules, approval limit, liquidity');
await db.exec(`update public.loan_products set min_guarantors = 2 where id='${prod}'`);
await must(U.off, `select public.set_loan_stage('${loanB}', 'appraisal')`, [], 'B -> appraisal');
await denied(U.off, `select public.set_loan_stage('${loanB}', 'approved', null, 2000000)`, [], 'product needs 2 guarantors, B has 1', 'guarantor');
await db.exec(`update public.loan_products set min_guarantors = 0 where id='${prod}'`);
await db.exec(`update public.sacco_settings set value = 1000000 where key='officer_approval_limit'`);
await denied(U.off, `select public.set_loan_stage('${loanB}', 'approved', null, 2000000)`, [], 'officer over limit needs a manager', 'manager');
await must(U.mgr, `select public.set_loan_stage('${loanB}', 'approved', null, 2000000)`, [], 'manager approves 2.0M');
// total funds = 2.0M+0.5M(A savings/shares now 1.5M+0.5M) ...; force a breach
await db.exec(`update public.sacco_settings set value = 90 where key='min_liquidity_pct'`);
await denied(U.off, `select public.disburse_loan('${loanB}')`, [], 'disbursement blocked when it breaks the liquidity reserve', 'liquidity');
await db.exec(`update public.sacco_settings set value = 20 where key='min_liquidity_pct'; update public.savings_accounts set balance = 30000000 where member_id='${U.mgr}'`);
await must(U.off, `select public.disburse_loan('${loanB}')`, [], 'disburses once the reserve is satisfied');

console.log('\n[9] Cancel / reject');
const cc = await must(U.c, `select public.apply_for_loan($1, 150000, 3, 'Fees', 'Salary') as id`, [prod], 'member C applies');
const loanC = cc?.rows[0].id;
await denied(U.a, `select public.cancel_application('${loanC}')`, [], 'another member cannot cancel it', 'not found');
await must(U.c, `select public.cancel_application('${loanC}')`, [], 'applicant withdraws');
row = (await db.query(`select stage, status from public.loans where id=$1`, [loanC])).rows[0];
ok(row.stage === 'rejected' && row.status === 'rejected', 'withdrawn loan is rejected');
await must(U.c, `select public.apply_for_loan($1, 120000, 3, 'Fees', 'Salary')`, [prod], 'C can apply again after withdrawing');

console.log('\n[10] Full repayment closes the loan and frees the guarantor');
const owed = Number((await db.query(`select outstanding_balance from public.loans where id=$1`, [loanB])).rows[0].outstanding_balance);
await must(U.cash, `select public.record_loan_payment('${loanB}', ${owed}, 'bank_transfer')`, [], 'pay the whole loan');
row = (await db.query(`select stage, status, outstanding_balance from public.loans where id=$1`, [loanB])).rows[0];
ok(row.stage === 'closed' && row.status === 'completed' && Number(row.outstanding_balance) === 0, 'loan closed');
const rel = (await db.query(`select status from public.loan_guarantors where loan_id=$1`, [loanB])).rows[0];
ok(rel.status === 'released', 'guarantee released on closure');
const ev = (await asU(U.b, `select kind, visibility from public.loan_events where loan_id='${loanB}'`)).rows;
ok(ev.length > 0 && ev.every(e => e.visibility === 'member'), `member sees only member-visible events (${ev.length})`);
await must(U.off, `select public.add_loan_note('${loanA}', 'Visited the shop, stock looks healthy', false)`, [], 'officer adds an internal note');
const ev2 = (await asU(U.a, `select message from public.loan_events where loan_id='${loanA}' and kind='note'`)).rows;
ok(ev2.length === 0, 'internal notes are hidden from the member');

console.log('\n[11] Collateral');
await must(U.off, `select public.add_collateral('${loanA}', 'vehicle', 'Toyota Probox UBA 123X', 'Logbook 4455', 12000000, 0.3476, 32.5825)`, [], 'record collateral with GPS');
const col = (await asU(U.a, `select * from public.loan_collateral where loan_id='${loanA}'`)).rows;
ok(col.length === 1, 'the owner can see the collateral on their loan');
const colB = (await asU(U.b, `select * from public.loan_collateral where loan_id='${loanA}'`)).rows;
ok(colB.length === 0, 'another member cannot');
await denied(U.a, `select public.add_collateral('${loanA}', 'land', 'Plot 1', null, 1)`, [], 'member cannot add collateral', 'Only a loans officer');

console.log('\n[12] Liquidity snapshot');
const snap = (await asU(U.off, `select public.liquidity_snapshot() as s`)).rows[0].s;
ok(Number(snap.reserve_pct) === 20 && Number(snap.funds) > 0 && Number(snap.room) >= 0, 'staff can read the liquidity snapshot', JSON.stringify(snap));
await denied(U.a, `select public.liquidity_snapshot()`, [], 'members cannot read it', 'Not allowed');

console.log(`\n==== ${pass} passed, ${fail} failed ====`);
process.exit(fail ? 1 : 0);
