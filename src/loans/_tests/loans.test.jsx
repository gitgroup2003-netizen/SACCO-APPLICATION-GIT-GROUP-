import React from 'react';
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Loader2 } from 'lucide-react';
import { KitContext } from '../src/loans/kit.js';
import MemberLoansTab from '../src/loans/MemberLoans.jsx';
import LoanDesk from '../src/loans/AdminLoans.jsx';
import { makeBackend, makeSb } from './pg.js';

const THEME = { mode: 'light', pine: '#0F3D3A', pineDark: '#0A2B29', gold: '#C08A2E', goldLight: '#E4B75E', paper: '#FAF7F0', surface: '#FFFFFF', ink: '#16241F', inkSoft: '#5B6B62', line: '#E4E0D4', success: '#2F7A4D', danger: '#B4453D' };
const fmt = n => 'UGX ' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
const fmtDate = d => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const fmtDateTime = d => fmtDate(d) + ' · time';
const shortId = id => (id ? id.slice(0, 8).toUpperCase() : '—');
const Badge = ({ children, color }) => <span style={{ color }}>{children}</span>;
const kitFor = (db, uid, desktop) => ({
  THEME, fmt, fmtDate, fmtDateTime, shortId, useIsDesktop: () => desktop, sb: makeSb(db, { uid }),
  Spinner: () => <div role="progressbar"><Loader2 /></div>, EmptyState: ({ text }) => <div>{text}</div>, Badge,
  Avatar: ({ name }) => <span>{name}</span>, GhostButton: ({ children, onClick }) => <button onClick={onClick}>{children}</button>,
});

const ID = { mgr: '00000000-0000-0000-0000-000000000001', off: '00000000-0000-0000-0000-000000000002', cash: '00000000-0000-0000-0000-000000000003',
  a: '00000000-0000-0000-0000-00000000000a', b: '00000000-0000-0000-0000-00000000000b' };
let db; const errors = [];
const prof = (k, role) => ({ id: ID[k], full_name: k.toUpperCase() + ' Person', role, status: 'active' });

beforeAll(async () => {
  const origErr = console.error;
  console.error = (...a) => { const m = a.map(String).join(' '); if (!/not wrapped in act|Not implemented: navigation/.test(m)) errors.push(m); origErr(...a); };
  db = await makeBackend();
  const phones = { mgr: '0700000001', off: '0700000002', cash: '0700000003', a: '0771111111', b: '0772222222' };
  for (const [k, id] of Object.entries(ID))
    await db.query(`insert into auth.users (id,email,raw_user_meta_data) values ($1,$2,$3)`, [id, k + '@t.com', JSON.stringify({ full_name: k.toUpperCase() + ' Person', phone: phones[k] })]);
  await db.exec(`update public.profiles set status='active';
    update public.profiles set role='loans_officer' where id='${ID.off}'; update public.profiles set role='cashier' where id='${ID.cash}';
    update public.savings_accounts set balance=2000000 where member_id='${ID.a}'; update public.shares set balance=500000 where member_id='${ID.a}';
    update public.savings_accounts set balance=1500000 where member_id='${ID.b}';
    update public.savings_accounts set balance=30000000 where member_id='${ID.mgr}';
    update public.loan_products set min_guarantors=0, max_term_months=24, processing_fee_pct=1, insurance_fee_pct=0.5, penalty_rate_pct=2;`);
});

const memberUI = (uid, role = 'member') => render(
  <KitContext.Provider value={kitFor(db, ID[uid], false)}>
    <MemberLoansTab profile={prof(uid, role)} token="t" onChanged={() => {}} />
  </KitContext.Provider>);
const deskUI = (uid, role, perms) => render(
  <KitContext.Provider value={kitFor(db, ID[uid], true)}>
    <LoanDesk profile={prof(uid, role)} token="t" perms={perms} savingsMap={{}} sharesMap={{}} onViewMember={() => {}} onChanged={() => {}} />
  </KitContext.Provider>);
const OFFICER = { manageLoans: true, recordCash: false, viewLoans: true };
const MANAGER = { manageLoans: true, recordCash: true, viewLoans: true };

describe('loan system, driven through the real screens', () => {
  it('member sees an empty state, then applies with the calculator', async () => {
    const user = userEvent.setup();
    memberUI('a');
    expect(await screen.findByText('Your loans')).toBeTruthy();
    expect(await screen.findByText('No loans yet')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /apply for a loan/i }));
    expect(await screen.findByText('estimated first monthly payment')).toBeTruthy();
    expect(screen.getByText('Total to repay')).toBeTruthy();
    expect(screen.getByText(/Your borrowing limit/)).toBeTruthy();
    // type an exact amount and a purpose
    const amount = screen.getByLabelText(/type an exact amount/i);
    fireEvent.change(amount, { target: { value: '1200000' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. School fees'), { target: { value: 'School fees' } });
    await waitFor(() => expect(screen.getAllByText(/1,200,000/).length).toBeGreaterThan(0));
    await user.click(screen.getByRole('button', { name: /submit application/i }));
    expect(await screen.findByText(/Application sent/)).toBeTruthy();
    expect(screen.getByRole('list', { name: /loan stage/i })).toBeTruthy();
    const row = (await db.query(`select principal::float p, stage, status, purpose from public.loans where member_id=$1`, [ID.a])).rows[0];
    expect(row).toMatchObject({ p: 1200000, stage: 'application', status: 'pending', purpose: 'School fees' });
  });

  it('member cannot start a second application', async () => {
    memberUI('a');
    expect(await screen.findByText('Your loans')).toBeTruthy();
    const btn = await screen.findByRole('button', { name: /apply for a loan/i });
    expect(btn.disabled).toBe(true);
    expect(screen.getByText(/already have an application in progress/i)).toBeTruthy();
  });

  it('member asks B to guarantee; B accepts from the inbox', async () => {
    const user = userEvent.setup();
    const a = memberUI('a');
    await user.click(await screen.findByText(/Application sent|Special|Standard Loan|Loan/, { selector: 'div' }).catch(() => screen.getByText('Standard Loan')));
    expect(await screen.findByText('Guarantors')).toBeTruthy();
    await user.type(screen.getByPlaceholderText(/phone number or email/i), '0772222222');
    await user.type(screen.getByPlaceholderText(/Amount they guarantee/i), '300000');
    await user.click(screen.getByRole('button', { name: /ask to guarantee/i }));
    expect(await screen.findByText(/Request sent to B PERSON|Request sent to B Person/i)).toBeTruthy();
    a.unmount();

    const b = memberUI('b');
    expect(await screen.findByText(/1 guarantee request waiting/)).toBeTruthy();
    await user.click(screen.getByText(/guarantee request waiting/));
    expect(await screen.findByText(/They ask you to guarantee/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /accept/i }));
    await waitFor(async () => {
      const r = (await db.query(`select status from public.loan_guarantors`)).rows[0];
      expect(r.status).toBe('approved');
    });
    b.unmount();
  });

  it('officer works the application through every stage and disburses', async () => {
    const user = userEvent.setup();
    deskUI('off', 'loans_officer', OFFICER);
    await user.click(await screen.findByRole('tab', { name: /Applications/ }));
    const card = await screen.findByText('A Person');
    await user.click(card);
    expect(await screen.findByText('What happens next')).toBeTruthy();
    expect(screen.getByText('Credit checks')).toBeTruthy();
    expect(screen.getByText('Borrowing limit')).toBeTruthy();
    expect(screen.getAllByText('Collateral').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: /start appraisal/i }));
    await user.click(await screen.findByRole('button', { name: /send to committee/i }));
    await user.click(await screen.findByRole('button', { name: /approve…/i }));
    const amt = await screen.findByLabelText(/amount to approve/i);
    expect(amt.value).toBe('1200000');
    await user.click(screen.getByRole('button', { name: /confirm approval/i }));
    await user.click(await screen.findByRole('button', { name: /disburse…/i }));
    expect(await screen.findByText(/installments of about/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /confirm disbursement/i }));
    expect(await screen.findByText(/Loan disbursed and schedule created/)).toBeTruthy();
    expect(await screen.findByText('Repayment schedule')).toBeTruthy();

    const loan = (await db.query(`select stage,status,approved_amount::float a,outstanding_balance::float o from public.loans`)).rows[0];
    expect(loan).toMatchObject({ stage: 'disbursed', status: 'active', a: 1200000 });
    expect(loan.o).toBeGreaterThan(1200000);
    const n = (await db.query(`select count(*)::int n from public.loan_schedule`)).rows[0].n;
    expect(n).toBeGreaterThan(0);
  });

  it('officer cannot record payments on screen without cash rights? (loans officer may)', async () => {
    const user = userEvent.setup();
    deskUI('off', 'loans_officer', OFFICER);
    await user.click(await screen.findByRole('tab', { name: /Portfolio/ }));
    await user.click(await screen.findByText('A Person'));
    expect(await screen.findByText('Record a payment')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /Next installment/ }));
    const before = Number((await db.query(`select outstanding_balance::float o from public.loans`)).rows[0].o);
    await user.click(screen.getByRole('button', { name: /record payment/i }));
    expect(await screen.findByText('Payment recorded.')).toBeTruthy();
    const after = Number((await db.query(`select outstanding_balance::float o from public.loans`)).rows[0].o);
    expect(after).toBeLessThan(before);
    const tx = (await db.query(`select count(*)::int n from public.transactions where type='loan_repayment'`)).rows[0].n;
    expect(tx).toBe(1);
  });

  it('overpaying shows the server error on screen and changes nothing', async () => {
    const user = userEvent.setup();
    deskUI('off', 'loans_officer', OFFICER);
    await user.click(await screen.findByRole('tab', { name: /Portfolio/ }));
    await user.click(await screen.findByText('A Person'));
    await screen.findByText('Record a payment');
    fireEvent.change(screen.getByPlaceholderText('Amount (UGX)'), { target: { value: '99999999' } });
    await user.click(screen.getByRole('button', { name: /record payment/i }));
    expect(await screen.findByText(/higher than what is owed/)).toBeTruthy();
  });

  it('member sees the schedule, the next payment and the timeline', async () => {
    const user = userEvent.setup();
    memberUI('a');
    expect(await screen.findByText('Active loans')).toBeTruthy();
    expect(screen.getByText('Total you owe')).toBeTruthy();
    expect(screen.getByText('Next payment')).toBeTruthy();
    await user.click(screen.getByText('Details'));
    expect(await screen.findByText('Payment schedule')).toBeTruthy();
    expect(screen.getByText('Activity')).toBeTruthy();
    expect(screen.getByText(/Disbursed UGX/)).toBeTruthy();
    expect(screen.queryByText(/internal/)).toBeNull();
    expect(screen.getByRole('button', { name: /how to pay/i })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /how to pay/i }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
  });

  it('overdue installments move the loan into collections with a WhatsApp reminder', async () => {
    const user = userEvent.setup();
    await db.exec(`update public.loan_schedule set due_date = current_date - 40 where installment_no = (select min(installment_no) from public.loan_schedule where status <> 'paid')`);
    deskUI('off', 'loans_officer', OFFICER);
    const tab = await screen.findByRole('tab', { name: /Collections/ });
    await user.click(tab);
    expect(await screen.findByText(/PAR 31-60 days/)).toBeTruthy();
    const wa = await screen.findByRole('link', { name: /whatsapp reminder/i });
    expect(wa.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/256771111111\?text=/);
    expect(decodeURIComponent(wa.getAttribute('href'))).toMatch(/overdue/);
    expect(screen.getByText(/days overdue/)).toBeTruthy();
  });

  it('manager edits the limits and sees the liquidity gauge; officer cannot', async () => {
    const user = userEvent.setup();
    const m = deskUI('mgr', 'manager', MANAGER);
    await user.click(await screen.findByRole('tab', { name: /Limits/ }));
    expect(await screen.findByText('Liquidity')).toBeTruthy();
    expect(await screen.findByText('Room for new loans')).toBeTruthy();
    const input = screen.getAllByRole('spinbutton')[0];
    fireEvent.change(input, { target: { value: '7000000' } });
    await user.click(screen.getAllByRole('button', { name: 'Save' })[0]);
    expect(await screen.findByText('Saved.')).toBeTruthy();
    const v = (await db.query(`select value::float v from public.sacco_settings where key='officer_approval_limit'`)).rows[0].v;
    expect(v).toBe(7000000);
    m.unmount();

    deskUI('off', 'loans_officer', OFFICER);
    await user.click(await screen.findByRole('tab', { name: /Limits/ }));
    expect(await screen.findByText(/Only a manager can change these/)).toBeTruthy();
  });

  it('manager creates a product; it validates inputs', async () => {
    const user = userEvent.setup();
    deskUI('mgr', 'manager', MANAGER);
    await user.click(await screen.findByRole('tab', { name: /Products/ }));
    await user.click(await screen.findByRole('button', { name: /new loan product/i }));
    await user.click(await screen.findByRole('button', { name: /save product/i }));
    expect(await screen.findByText(/Give the product a name/)).toBeTruthy();
    await user.type(screen.getByPlaceholderText(/School fees loan/), 'Emergency Loan');
    await user.click(screen.getByRole('button', { name: /save product/i }));
    await waitFor(async () => {
      const r = (await db.query(`select count(*)::int n from public.loan_products where name='Emergency Loan'`)).rows[0].n;
      expect(r).toBe(1);
    });
  });

  it('screens logged no React errors', () => {
    expect(errors).toEqual([]);
  });
});
