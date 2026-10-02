import { makeDb, migrate, as } from './harness.mjs';
process.on('uncaughtException', e => { console.log('CRASH:', String(e.message).slice(0,300)); process.exit(2); });
const db = await makeDb();
const M = '00000000-0000-0000-0000-000000000001', A = '00000000-0000-0000-0000-00000000000a', C = '00000000-0000-0000-0000-000000000003';
for (const [id, k] of [[M,'mgr'],[A,'a'],[C,'cash']]) await db.query(`insert into auth.users (id,email,raw_user_meta_data) values ($1,$2,$3)`, [id, k+'@t.com', JSON.stringify({full_name:k+' user',phone:'07000000'+k.length})]);
await db.exec(`update public.profiles set status='active'; update public.profiles set role='cashier' where id='${C}';
  update public.savings_accounts set balance=900000 where member_id='${A}';`);
// loans that exist BEFORE the new system (old flow: pending / active / completed / rejected)
await db.exec(`insert into public.loans (member_id, principal, term_months, status, outstanding_balance) values
  ('${A}', 500000, 6, 'active', 320000), ('${A}', 100000, 3, 'completed', 0), ('${A}', 50000, 3, 'rejected', 0), ('${A}', 70000, 3, 'pending', 0)`);
await migrate(db, ['01_loan_foundation.sql','02_loan_engine.sql','03_loan_hardening.sql']);
const st = (await db.query(`select status, stage from public.loans order by status`)).rows.map(r => r.status + '→' + r.stage).join(', ');
console.log('stage mapping:', st);
const legacy = (await db.query(`select id from public.loans where status='active'`)).rows[0].id;
const v = (await as(db, M, `select stage, outstanding_balance, days_in_arrears, par_bucket, next_due_date from public.loan_portfolio where loan_id='${legacy}'`)).rows[0];
console.log('legacy loan in portfolio:', JSON.stringify(v));
await as(db, M, `select public.refresh_arrears()`); console.log('refresh_arrears ok with legacy loan');
await as(db, C, `select public.record_loan_payment('${legacy}', 20000, 'cash')`);
console.log('legacy payment ok →', (await db.query(`select outstanding_balance from public.loans where id='${legacy}'`)).rows[0].outstanding_balance);
try { await as(db, C, `select public.record_loan_payment('${legacy}', 999999, 'cash')`); console.log('FAIL overpay allowed'); } catch (e) { console.log('legacy overpay refused:', e.message); }
await as(db, C, `select public.record_loan_payment('${legacy}', 300000, 'cash')`);
console.log('legacy closed →', JSON.stringify((await db.query(`select status, stage from public.loans where id='${legacy}'`)).rows[0]));
const pos = (await as(db, A, `select public.my_loan_position() as p`)).rows[0].p;
console.log('member position:', JSON.stringify(pos));
