import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, BookOpen, Check, Download, FileSpreadsheet, FileText, Plus, ShieldCheck, Trash2, Wallet, X } from 'lucide-react';
import { useKit, rpc, useLoader } from './loans/kit.js';
import { LoanStyles, Pill, Seg, Sheet, ErrorNote, OkNote, Row, Kpi, Bar, useInputStyle } from './loans/ui.jsx';
import { exportPdf, exportXlsx } from './financeExports.js';

/* ------------------------------ small helpers ------------------------------ */
const todayStr = () => new Date().toISOString().slice(0, 10);
const monthStartStr = () => todayStr().slice(0, 8) + '01';
const yearStartStr = () => todayStr().slice(0, 4) + '-01-01';
const n2 = v => Math.round(Number(v || 0) * 100) / 100;
const KIND_LABEL = { system: 'Automatic', manual: 'Manual', opening: 'Opening balances', closing: 'Year-end close', reversal: 'Reversal', accrual: 'Interest accrual', provision: 'Provision' };

function useCall(token) {
  const kit = useKit();
  return useCallback((name, args) => rpc(kit, token, name, args), [kit, token]);
}

// Runs an action, keeps a success or error message, never leaves a silent failure.
function useAction() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const run = useCallback(async (fn, okText) => {
    setBusy(true); setErr(''); setOk('');
    try { const r = await fn(); if (okText) setOk(typeof okText === 'function' ? okText(r) : okText); return r === undefined ? true : r; }
    catch (e) { setErr((e && e.message) || 'Something went wrong. Nothing was changed.'); return null; }
    finally { setBusy(false); }
  }, []);
  return { busy, err, ok, run, clear: () => { setErr(''); setOk(''); } };
}

function Panel({ title, sub, right, children, style }) {
  const { THEME } = useKit();
  return (
    <div style={{ background: THEME.surface, border: `1px solid ${THEME.line}`, borderRadius: 20, padding: 16, minWidth: 0, ...style }}>
      {(title || right) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: sub ? 2 : 10 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: THEME.ink }}>{title}</div>{right}
        </div>
      )}
      {sub && <div style={{ fontSize: 12, color: THEME.inkSoft, marginBottom: 10, lineHeight: 1.45 }}>{sub}</div>}
      {children}
    </div>
  );
}
function Field({ label, children, hint }) {
  const { THEME } = useKit();
  return (
    <label style={{ display: 'block', minWidth: 0 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: THEME.inkSoft, marginBottom: 5 }}>{label}</div>
      {children}
      {hint && <div style={{ fontSize: 11, color: THEME.inkSoft, marginTop: 4 }}>{hint}</div>}
    </label>
  );
}
function statusColor(THEME, s) { return s === 'green' ? THEME.success : s === 'amber' ? THEME.gold : s === 'red' ? THEME.danger : THEME.inkSoft; }
function Dot({ status }) { const { THEME } = useKit(); return <span aria-hidden style={{ width: 10, height: 10, borderRadius: 99, background: statusColor(THEME, status), display: 'inline-block', flexShrink: 0 }} />; }
function Money({ v, strong, colorize }) {
  const { THEME, fmt } = useKit();
  const num = Number(v || 0);
  return <span style={{ fontWeight: strong ? 700 : 500, whiteSpace: 'nowrap', color: colorize && num < 0 ? THEME.danger : THEME.ink }}>{num < 0 ? '-' : ''}{fmt(Math.abs(num)).replace('UGX ', '')}</span>;
}
function Table({ head, rows, foot, right = [] }) {
  const { THEME } = useKit();
  const cell = (i, extra) => ({ padding: '8px 8px', textAlign: right.includes(i) ? 'right' : 'left', borderBottom: `1px solid ${THEME.line}`, fontSize: 12.5, ...extra });
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 360 }}>
        <thead><tr>{head.map((h, i) => <th key={i} style={cell(i, { fontSize: 11.5, color: THEME.inkSoft, fontWeight: 700 })}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, ri) => <tr key={ri} className="ln-row">{r.map((c, i) => <td key={i} style={cell(i)}>{c}</td>)}</tr>)}</tbody>
        {foot && <tfoot>{foot.map((r, ri) => <tr key={ri}>{r.map((c, i) => <td key={i} style={cell(i, { fontWeight: 700, borderTop: `2px solid ${THEME.line}` })}>{c}</td>)}</tr>)}</tfoot>}
      </table>
    </div>
  );
}
function Notes({ a }) { return <>{a.err && <ErrorNote msg={a.err} onClose={a.clear} />}{a.ok && <OkNote msg={a.ok} />}</>; }
function Loading() { const { Spinner } = useKit(); return <Spinner />; }
function ErrorBox({ msg, onRetry }) { const { GhostButton } = useKit(); return <div style={{ display: 'grid', gap: 10 }}><ErrorNote msg={msg || 'Could not load.'} /><GhostButton onClick={onRetry}>Try again</GhostButton></div>; }

function useAccounts(token) {
  const kit = useKit();
  return useLoader(() => kit.sb('/rest/v1/gl_accounts?select=*&order=code', { token }), [token]);
}
const nameOf = (members, id) => ((members || []).find(m => m.id === id) || {}).full_name || 'Staff';

/* =============================== the hub =============================== */
export default function FinanceHub({ profile, token, perms, members, cashDesk, onChanged }) {
  const { THEME } = useKit();
  const role = profile.role;
  const isFin = ['manager', 'accountant', 'supervisor', 'board'].includes(role);
  const canPost = role === 'manager' || role === 'accountant';
  const sections = [
    isFin && { value: 'overview', label: 'Overview' },
    cashDesk && { value: 'cashdesk', label: 'Cash desk' },
    isFin && { value: 'journals', label: 'Journals' },
    isFin && { value: 'reports', label: 'Reports' },
    ['manager', 'accountant', 'cashier'].includes(role) && { value: 'count', label: 'Cash count' },
    isFin && { value: 'compliance', label: 'Compliance' },
    isFin && { value: 'provision', label: 'Provisioning' },
    canPost && { value: 'interest', label: 'Savings interest' },
    canPost && { value: 'setup', label: 'Setup' },
  ].filter(Boolean);
  const [sec, setSec] = useState(role === 'cashier' || !isFin ? 'cashdesk' : 'overview');
  const accounts = useAccounts(token);
  const common = { token, role, canPost, members, profile, accounts: (accounts.data || []), reloadAccounts: accounts.reload, go: setSec, onChanged };

  return (
    <div style={{ display: 'grid', gap: 14, minWidth: 0 }}>
      <LoanStyles />
      <Seg value={sec} onChange={setSec} options={sections} />
      {sec === 'overview' && isFin && <Overview {...common} />}
      {sec === 'cashdesk' && cashDesk}
      {sec === 'journals' && isFin && <Journals {...common} />}
      {sec === 'reports' && isFin && <Reports {...common} />}
      {sec === 'count' && <CashCount {...common} />}
      {sec === 'compliance' && isFin && <Compliance {...common} />}
      {sec === 'provision' && isFin && <Provisioning {...common} />}
      {sec === 'interest' && canPost && <SavingsInterest {...common} />}
      {sec === 'setup' && canPost && <Setup {...common} />}
      <div style={{ fontSize: 11, color: THEME.inkSoft, textAlign: 'center', padding: '4px 0 10px' }}>Figures update automatically. Every entry is logged with who made it and when.</div>
    </div>
  );
}

/* =============================== overview =============================== */
function Gauge({ label, m, unit = '%', higherIsBetter = true, hint }) {
  const { THEME } = useKit();
  const v = m && m.value != null ? Number(m.value) : null;
  const col = statusColor(THEME, m ? m.status : 'na');
  const scale = Math.max(Number(m && m.limit) * 2, v || 0, 1);
  return (
    <div style={{ border: `1px solid ${THEME.line}`, borderRadius: 16, padding: 14, flex: '1 1 200px', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 700 }}><Dot status={m ? m.status : 'na'} />{label}</div>
      <div style={{ fontFamily: 'Fraunces, serif', fontSize: 28, marginTop: 6, color: col }}>{v == null ? 'n/a' : `${v}${unit}`}</div>
      <div style={{ margin: '8px 0 6px' }}><Bar pct={v == null ? 0 : Math.min(100, (v / scale) * 100)} color={col} /></div>
      <div style={{ fontSize: 11.5, color: THEME.inkSoft }}>{higherIsBetter ? 'Minimum' : 'Maximum'} {m ? m.limit : '-'}{unit}{hint ? ` · ${hint}` : ''}</div>
    </div>
  );
}

function Overview({ token, canPost, go }) {
  const kit = useKit(); const { THEME, fmt, fmtDate } = kit;
  const call = useCall(token);
  const L = useLoader(() => call('finance_overview'), [token], { every: 30000 });
  if (L.loading && !L.data) return <Loading />;
  if (!L.data) return <ErrorBox msg={L.error} onRetry={L.reload} />;
  const d = L.data, bs = d.balance_sheet, att = d.attention, comp = d.compliance;
  const integ = d.integrity;
  const items = [
    att.pending_journals > 0 && { t: `${att.pending_journals} journal${att.pending_journals > 1 ? 's' : ''} waiting for approval`, to: 'journals' },
    att.pending_member_transactions > 0 && { t: `${att.pending_member_transactions} large transaction${att.pending_member_transactions > 1 ? 's' : ''} waiting for a manager`, to: 'cashdesk' },
    att.open_cash_variances > 0 && { t: `${att.open_cash_variances} cash count difference${att.open_cash_variances > 1 ? 's' : ''} not resolved`, to: 'count' },
    Number(att.accrued_interest_unpaid) > 0 && { t: `${fmt(att.accrued_interest_unpaid)} of savings interest accrued but not yet paid to members`, to: 'interest' },
    d.gl_active && Math.abs(Number(integ.suspense)) > 0.01 && { t: `${fmt(integ.suspense)} sits in "Suspense and clearing" - allocate it`, to: 'reports' },
    d.gl_active && integ.issues > 0 && { t: 'The books and the member records do not agree (see below)', to: null },
  ].filter(Boolean);
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {!d.gl_active && (
        <Panel title="The accounting ledger is not switched on yet" sub="Until it is, balances, trial balance and statements cannot be produced. Member savings, shares and loans keep working as normal in the meantime.">
          {canPost ? <Pill tone="sun" onClick={() => go('setup')}>Set up the ledger</Pill> : <div style={{ fontSize: 12.5, color: THEME.inkSoft }}>A manager or the accountant needs to complete the setup.</div>}
        </Panel>
      )}
      {comp.worst !== 'green' && d.gl_active && (
        <Panel title={comp.worst === 'red' ? 'Compliance limit breached' : 'Compliance - approaching a limit'} right={<Dot status={comp.worst} />}>
          {comp.alerts.map((a, i) => <div key={i} style={{ fontSize: 13, padding: '3px 0', color: THEME.ink }}>{a}</div>)}
          <div style={{ marginTop: 8 }}><Pill tone="ghost" onClick={() => go('compliance')}>Open compliance</Pill></div>
        </Panel>
      )}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Kpi tone="mint" icon={Wallet} label="Total assets" value={fmt(bs.total_assets)} sub={`as at ${fmtDate(bs.as_of)}`} />
        <Kpi tone="sky" icon={BookOpen} label="Total liabilities" value={fmt(bs.total_liabilities)} sub="members' savings and payables" />
        <Kpi tone="butter" icon={ShieldCheck} label="Total equity" value={fmt(bs.total_equity)} sub="shares, reserves and surplus" />
        <Kpi icon={FileText} label="Surplus this month" value={fmt(d.month.surplus)} sub={`Income ${fmt(d.month.total_income)}`} />
        <Kpi icon={FileText} label="Surplus this year" value={fmt(d.year.surplus)} sub={`Costs ${fmt(d.year.total_expenses)}`} />
      </div>
      {items.length > 0 && (
        <Panel title="Needs attention">
          {items.map((it, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: i ? `1px solid ${THEME.line}` : 'none', fontSize: 13 }}>
              <span style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 }}><AlertTriangle size={15} color={THEME.gold} style={{ flexShrink: 0 }} />{it.t}</span>
              {it.to && <Pill tone="ghost" onClick={() => go(it.to)}>Open</Pill>}
            </div>
          ))}
        </Panel>
      )}
      <Panel title="Books vs member records" sub="Every figure in the accounting books is checked against what the member records, loan schedules and share register say. They must agree to the shilling."
        right={<span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700 }}><Dot status={!d.gl_active ? 'na' : integ.ok ? 'green' : 'red'} />{!d.gl_active ? 'Not active' : integ.ok ? 'Agrees' : 'Does not agree'}</span>}>
        <Table head={['Item', 'Books', 'Member records', 'Difference']} right={[1, 2, 3]}
          rows={integ.rows.map(r => [r.name, <Money key="a" v={r.gl} />, <Money key="b" v={r.sub} />, <span key="c" style={{ color: Math.abs(r.diff) > 0.01 ? THEME.danger : THEME.success, fontWeight: 700 }}>{Math.abs(r.diff) > 0.01 ? <Money v={r.diff} /> : 'OK'}</span>])} />
      </Panel>
      <Panel title="Cash, bank and mobile money" sub="What the books say you should have in each place. Count the real thing in 'Cash count' to confirm.">
        <Table head={['Account', 'Balance', 'Last count']} right={[1]}
          rows={d.cash.map(c => [c.name, <Money key="m" v={c.balance} strong />,
            c.last_count ? <span key="l" style={{ fontSize: 12, color: c.last_count.status === 'variance' || c.last_count.status === 'investigating' ? THEME.danger : THEME.inkSoft }}>{fmtDate(c.last_count.date)} · {c.last_count.status === 'ok' || c.last_count.status === 'recorded' ? 'matched' : c.last_count.status === 'written_off' ? 'written off' : 'difference'}</span> : <span key="l" style={{ fontSize: 12, color: THEME.inkSoft }}>never counted</span>])} />
      </Panel>
      <Panel title="Regulatory ratios">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Gauge label="Liquidity" m={comp.liquidity} />
          <Gauge label="Equity to assets" m={comp.equity} />
          <Gauge label="External borrowing" m={comp.borrowing} higherIsBetter={false} />
        </div>
      </Panel>
    </div>
  );
}

/* =============================== journals =============================== */
function Journals({ token, role, canPost, accounts, members, profile }) {
  const kit = useKit(); const { THEME, fmtDate, fmtDateTime } = kit; const call = useCall(token); const act = useAction();
  const [from, setFrom] = useState(monthStartStr()); const [to, setTo] = useState(todayStr()); const [q, setQ] = useState('');
  const [open, setOpen] = useState(null); const [form, setForm] = useState(false);
  const input = useInputStyle();
  const J = useLoader(() => call('gl_journal_list', { p_from: from, p_to: to, p_search: q || null }), [token, from, to, q], { every: 30000 });
  const P = useLoader(() => kit.sb('/rest/v1/gl_pending_journals?status=eq.pending&select=*&order=requested_at', { token }), [token], { every: 15000 });
  const accName = useMemo(() => Object.fromEntries(accounts.map(a => [a.code, a.name])), [accounts]);
  const refresh = () => { J.reload(); P.reload(); };
  const decide = (p, approve) => act.run(async () => { await call('decide_journal', { p_id: p.id, p_approve: approve, p_reason: null }); refresh(); }, approve ? 'Journal approved and posted.' : 'Journal rejected. Nothing was posted.');
  const reverse = j => { const reason = window.prompt('Why is this journal being reversed?'); if (reason === null) return; act.run(async () => { await call('reverse_journal', { p_journal: j.id, p_date: todayStr(), p_reason: reason }); refresh(); }, 'Reversal sent for approval by a second person.'); };
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <Notes a={act} />
      {(P.data || []).length > 0 && (
        <Panel title={`Waiting for approval (${P.data.length})`} sub="A journal is only posted after a second person approves it. Nobody can approve their own entry.">
          <div style={{ display: 'grid', gap: 10 }}>
            {P.data.map(p => (
              <div key={p.id} style={{ border: `1px solid ${THEME.line}`, borderRadius: 14, padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, fontWeight: 700 }}><span>{p.description}</span><span style={{ color: THEME.inkSoft, fontWeight: 500, fontSize: 12 }}>{fmtDate(p.entry_date)}</span></div>
                <div style={{ fontSize: 11.5, color: THEME.inkSoft, margin: '3px 0 8px' }}>{KIND_LABEL[p.reverses_id ? 'reversal' : p.kind] || p.kind} · prepared by {nameOf(members, p.requested_by)} · {fmtDateTime(p.requested_at)}</div>
                <Table head={['Account', 'Debit', 'Credit']} right={[1, 2]} rows={(p.lines || []).map(l => [`${l.account} ${accName[l.account] || ''}`, Number(l.debit) ? <Money v={l.debit} /> : '', Number(l.credit) ? <Money v={l.credit} /> : ''])} />
                {canPost && (p.requested_by === profile.id
                  ? <div style={{ fontSize: 12, color: THEME.gold, fontWeight: 600, marginTop: 8 }}>Waiting for someone else to approve</div>
                  : <div style={{ display: 'flex', gap: 8, marginTop: 10 }}><Pill disabled={act.busy} onClick={() => decide(p, true)}><Check size={14} /> Approve</Pill><Pill tone="ghost" disabled={act.busy} onClick={() => decide(p, false)}><X size={14} /> Reject</Pill></div>)}
              </div>
            ))}
          </div>
        </Panel>
      )}
      <Panel title="Journal register" right={canPost && <Pill tone="sun" onClick={() => setForm(true)}><Plus size={14} /> New journal</Pill>}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8, marginBottom: 12 }}>
          <Field label="From"><input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} style={input} /></Field>
          <Field label="To"><input type="date" value={to} min={from} onChange={e => setTo(e.target.value)} style={input} /></Field>
          <Field label="Search"><input value={q} onChange={e => setQ(e.target.value)} placeholder="Words or journal no." style={input} /></Field>
        </div>
        {J.loading && !J.data ? <Loading /> : J.error && !J.data ? <ErrorBox msg={J.error} onRetry={J.reload} /> : (J.data || []).length === 0 ? <kit.EmptyState text="No journals in this period." /> : (
          <div style={{ display: 'grid', gap: 8 }}>
            {J.data.map(j => (
              <div key={j.id} style={{ border: `1px solid ${THEME.line}`, borderRadius: 14, padding: '10px 12px' }}>
                <div role="button" tabIndex={0} onClick={() => setOpen(open === j.id ? null : j.id)} onKeyDown={e => { if (e.key === 'Enter') setOpen(open === j.id ? null : j.id); }} style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis' }}>#{j.journal_no} · {j.description}</div>
                    <div style={{ fontSize: 11.5, color: THEME.inkSoft }}>{fmtDate(j.entry_date)} · {KIND_LABEL[j.kind] || j.kind}{j.reversed ? ' · reversed' : ''}</div>
                  </div>
                  <Money v={(j.lines || []).reduce((s, l) => s + Number(l.debit), 0)} strong />
                </div>
                {open === j.id && (
                  <div style={{ marginTop: 10 }}>
                    <Table head={['Account', 'Debit', 'Credit']} right={[1, 2]} rows={(j.lines || []).map(l => [`${l.account} ${l.name}`, Number(l.debit) ? <Money v={l.debit} /> : '', Number(l.credit) ? <Money v={l.credit} /> : ''])} />
                    <div style={{ fontSize: 11.5, color: THEME.inkSoft, marginTop: 6 }}>Entered by {nameOf(members, j.created_by)}{j.approved_by ? ` · approved by ${nameOf(members, j.approved_by)}` : ' · posted automatically'} · {fmtDateTime(j.created_at)}</div>
                    {canPost && !j.reversed && j.kind !== 'reversal' && <div style={{ marginTop: 8 }}><Pill tone="ghost" disabled={act.busy} onClick={() => reverse(j)}>Reverse this journal</Pill></div>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Panel>
      {form && <JournalForm accounts={accounts} onClose={() => setForm(false)} onDone={() => { setForm(false); refresh(); }} call={call} />}
    </div>
  );
}

function JournalForm({ accounts, onClose, onDone, call }) {
  const { THEME, fmt } = useKit(); const input = useInputStyle(); const act = useAction();
  const [date, setDate] = useState(todayStr()); const [desc, setDesc] = useState('');
  const [lines, setLines] = useState([{ account: '', debit: '', credit: '' }, { account: '', debit: '', credit: '' }]);
  const set = (i, k, v) => setLines(ls => ls.map((l, j) => (j === i ? { ...l, [k]: v, ...(k === 'debit' && v ? { credit: '' } : {}), ...(k === 'credit' && v ? { debit: '' } : {}) } : l)));
  const d = n2(lines.reduce((s, l) => s + Number(l.debit || 0), 0)); const c = n2(lines.reduce((s, l) => s + Number(l.credit || 0), 0));
  const filled = lines.filter(l => l.account && (Number(l.debit) > 0 || Number(l.credit) > 0));
  const valid = desc.trim() && filled.length >= 2 && d === c && d > 0 && date <= todayStr();
  return (
    <Sheet title="New journal" onClose={onClose} width={640}>
      <div style={{ display: 'grid', gap: 10 }}>
        <Notes a={act} />
        <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 8 }}>
          <Field label="Date"><input type="date" value={date} max={todayStr()} onChange={e => setDate(e.target.value)} style={input} /></Field>
          <Field label="What is this for?"><input value={desc} onChange={e => setDesc(e.target.value)} placeholder="e.g. October office rent" style={input} /></Field>
        </div>
        {lines.map((l, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr) minmax(0,1fr) 28px', gap: 6, alignItems: 'end' }}>
            <select aria-label={`Account ${i + 1}`} value={l.account} onChange={e => set(i, 'account', e.target.value)} style={input}>
              <option value="">Account…</option>{accounts.filter(a => a.active).map(a => <option key={a.code} value={a.code}>{a.code} {a.name}</option>)}
            </select>
            <input aria-label={`Debit ${i + 1}`} type="number" min="0" placeholder="Debit" value={l.debit} onChange={e => set(i, 'debit', e.target.value)} style={input} />
            <input aria-label={`Credit ${i + 1}`} type="number" min="0" placeholder="Credit" value={l.credit} onChange={e => set(i, 'credit', e.target.value)} style={input} />
            <button aria-label="Remove line" disabled={lines.length <= 2} onClick={() => setLines(ls => ls.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: THEME.inkSoft, minHeight: 0, padding: 0 }}><Trash2 size={16} /></button>
          </div>
        ))}
        <div><Pill tone="ghost" onClick={() => setLines(ls => [...ls, { account: '', debit: '', credit: '' }])}><Plus size={14} /> Add line</Pill></div>
        <Row label="Total debits" value={fmt(d)} /><Row label="Total credits" value={fmt(c)} />
        <div style={{ fontSize: 13, fontWeight: 700, color: d === c && d > 0 ? THEME.success : THEME.danger }}>{d === c && d > 0 ? 'Balanced' : `Difference ${fmt(Math.abs(d - c))} - debits and credits must be equal`}</div>
        <div style={{ fontSize: 11.5, color: THEME.inkSoft }}>This is sent for approval. It is only posted when a different person approves it, and cannot be edited afterwards - only reversed.</div>
        <Pill tone="sun" disabled={!valid || act.busy} onClick={async () => {
          const r = await act.run(() => call('submit_journal', { p_date: date, p_description: desc.trim(), p_lines: filled.map(l => ({ account: l.account, debit: Number(l.debit || 0), credit: Number(l.credit || 0) })) }));
          if (r) onDone();
        }}>Send for approval</Pill>
      </div>
    </Sheet>
  );
}

/* =============================== reports =============================== */
function Reports({ token, accounts }) {
  const kit = useKit(); const { THEME, fmt, fmtDate } = kit; const call = useCall(token); const input = useInputStyle();
  const [type, setType] = useState('tb'); const [asOf, setAsOf] = useState(todayStr());
  const [from, setFrom] = useState(yearStartStr()); const [to, setTo] = useState(todayStr()); const [acct, setAcct] = useState('1010');
  const L = useLoader(() => {
    if (type === 'tb') return call('gl_trial_balance', { p_as_of: asOf });
    if (type === 'is') return call('gl_income_statement', { p_from: from, p_to: to });
    if (type === 'bs') return call('gl_balance_sheet', { p_as_of: asOf });
    return call('gl_account_ledger', { p_account: acct, p_from: from, p_to: to });
  }, [token, type, asOf, from, to, acct]);
  const d = L.data;
  const title = { tb: 'Trial balance', is: 'Income statement', bs: 'Balance sheet', led: 'Account ledger' }[type];
  const sub = type === 'tb' || type === 'bs' ? `As at ${fmtDate(asOf)}` : `${fmtDate(from)} to ${fmtDate(to)}`;

  // one flat table model drives the screen, Excel and PDF so they can never disagree
  const model = useMemo(() => {
    if (!d || L.loading) return null;
    if (type === 'tb') return { head: ['Code', 'Account', 'Debit', 'Credit'], rows: d.rows.map(r => [r.code, r.name, Number(r.debit) || '', Number(r.credit) || '']), foot: [['', 'Total', d.total_debit, d.total_credit]], money: [2, 3], ok: d.balanced };
    if (type === 'is') return { head: ['Code', 'Line', 'Amount'], money: [2], ok: true,
      rows: [['', 'INCOME', ''], ...d.income.map(r => [r.code, r.name, r.amount]), ['', 'EXPENSES', ''], ...d.expenses.map(r => [r.code, r.name, r.amount])],
      foot: [['', 'Total income', d.total_income], ['', 'Total expenses', d.total_expenses], ['', 'Surplus / (deficit)', d.surplus]] };
    if (type === 'bs') return { head: ['Code', 'Line', 'Amount'], money: [2], ok: d.balanced,
      rows: [['', 'ASSETS', ''], ...d.assets.map(r => [r.code, r.name, r.amount]), ['', 'LIABILITIES', ''], ...d.liabilities.map(r => [r.code, r.name, r.amount]), ['', 'EQUITY', ''], ...d.equity.map(r => [r.code, r.name, r.amount]), ['', 'Surplus for the year to date', d.current_surplus]],
      foot: [['', 'Total assets', d.total_assets], ['', 'Total liabilities', d.total_liabilities], ['', 'Total equity', d.total_equity]] };
    const cn = d.credit_normal;
    return { head: ['Date', 'No.', 'Description', 'Debit', 'Credit', 'Balance'], money: [3, 4, 5], ok: true,
      rows: [['', '', 'Opening balance', '', '', cn ? -d.opening : d.opening], ...d.rows.map(r => [r.date, '#' + r.journal_no, r.description, Number(r.debit) || '', Number(r.credit) || '', cn ? -r.balance : r.balance])],
      foot: [['', '', 'Closing balance', '', '', d.rows.length ? (cn ? -d.rows[d.rows.length - 1].balance : d.rows[d.rows.length - 1].balance) : (cn ? -d.opening : d.opening)]] };
  }, [d, type, L.loading]);

  const fileBase = `${title.replace(/ /g, '_')}_${type === 'tb' || type === 'bs' ? asOf : from + '_to_' + to}`;
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <Seg value={type} onChange={setType} options={[{ value: 'tb', label: 'Trial balance' }, { value: 'is', label: 'Income statement' }, { value: 'bs', label: 'Balance sheet' }, { value: 'led', label: 'Account ledger' }]} />
      <Panel title={title} sub={sub} right={model && (
        <div style={{ display: 'flex', gap: 6 }}>
          <Pill tone="ghost" title="Download Excel" onClick={() => exportXlsx(fileBase, title, [model.head, ...model.rows, ...(model.foot || [])])}><FileSpreadsheet size={14} /> Excel</Pill>
          <Pill tone="ghost" title="Download PDF" onClick={() => exportPdf({ filename: fileBase, title, subtitle: sub, head: model.head, body: model.rows, foot: model.foot, moneyColumns: model.money })}><Download size={14} /> PDF</Pill>
        </div>)}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: 12 }}>
          {(type === 'tb' || type === 'bs') && <Field label="As at"><input type="date" value={asOf} max={todayStr()} onChange={e => setAsOf(e.target.value)} style={input} /></Field>}
          {(type === 'is' || type === 'led') && <><Field label="From"><input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} style={input} /></Field><Field label="To"><input type="date" value={to} min={from} onChange={e => setTo(e.target.value)} style={input} /></Field></>}
          {type === 'led' && <Field label="Account"><select value={acct} onChange={e => setAcct(e.target.value)} style={input}>{accounts.map(a => <option key={a.code} value={a.code}>{a.code} {a.name}</option>)}</select></Field>}
        </div>
        {L.loading && !model ? <Loading /> : L.error && !model ? <ErrorBox msg={L.error} onRetry={L.reload} /> : model && (
          <>
            {(type === 'tb' || type === 'bs') && <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8, color: model.ok ? THEME.success : THEME.danger }}>{model.ok ? (type === 'tb' ? 'Debits equal credits' : 'Assets equal liabilities plus equity') : 'Does not balance - contact support'}</div>}
            {model.rows.length === 0 ? <kit.EmptyState text="Nothing to show for this period." /> : (
              <Table head={model.head} right={model.money}
                rows={model.rows.map(r => r.map((c, i) => (model.money.includes(i) && c !== '' ? <Money key={i} v={c} colorize /> : (r[1] === c && /^[A-Z ]+$/.test(String(c)) && c !== '' ? <b key={i}>{c}</b> : c))))}
                foot={model.foot && model.foot.map(r => r.map((c, i) => (model.money.includes(i) ? <Money key={i} v={c} strong colorize /> : c)))} />
            )}
          </>
        )}
      </Panel>
    </div>
  );
}

/* =============================== cash count =============================== */
function CashCount({ token, role, canPost, profile }) {
  const kit = useKit(); const { THEME, fmt, fmtDate, fmtDateTime } = kit; const call = useCall(token); const input = useInputStyle(); const act = useAction();
  const A = useLoader(() => call('list_cash_accounts'), [token]);
  const H = useLoader(() => (canPost ? kit.sb('/rest/v1/cash_counts?select=*&order=created_at.desc&limit=40', { token }) : call('my_cash_counts')), [token, canPost], { every: 20000 });
  const [vals, setVals] = useState({}); const [notes, setNotes] = useState({}); const [reason, setReason] = useState({});
  const accName = useMemo(() => Object.fromEntries((A.data || []).map(a => [a.code, a.name])), [A.data]);
  const submit = a => act.run(async () => { const r = await call('submit_cash_count', { p_account: a.code, p_counted: Number(vals[a.code]), p_note: notes[a.code] || null }); setVals(v => ({ ...v, [a.code]: '' })); H.reload(); return r; },
    r => (r.status === 'ok' || r.status === 'recorded' ? `${a.name}: count recorded.` : `${a.name}: count recorded. A difference has been flagged for review.`));
  const resolve = (c, action) => act.run(async () => { await call('resolve_cash_count', { p_id: c.id, p_action: action, p_note: reason[c.id] || null }); H.reload(); }, action === 'write_off' ? 'Difference written off and posted.' : 'Marked as under investigation.');
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <Notes a={act} />
      <Panel title="End-of-day count" sub="Count what is physically there (cash drawer, or the balance shown by the bank / mobile money account) and enter it. You are not shown the expected figure, so the count stays honest.">
        {A.loading && !A.data ? <Loading /> : A.error && !A.data ? <ErrorBox msg={A.error} onRetry={A.reload} /> : (
          <div style={{ display: 'grid', gap: 12 }}>
            {(A.data || []).map(a => (
              <div key={a.code} style={{ border: `1px solid ${THEME.line}`, borderRadius: 14, padding: 12, display: 'grid', gap: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>{a.name}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 8 }}>
                  <input aria-label={`Counted amount for ${a.name}`} type="number" min="0" placeholder="Amount counted (UGX)" value={vals[a.code] || ''} onChange={e => setVals(v => ({ ...v, [a.code]: e.target.value }))} style={input} />
                  <input aria-label={`Note for ${a.name}`} placeholder="Note (optional)" value={notes[a.code] || ''} onChange={e => setNotes(v => ({ ...v, [a.code]: e.target.value }))} style={input} />
                </div>
                <div><Pill disabled={act.busy || vals[a.code] === undefined || vals[a.code] === '' || Number(vals[a.code]) < 0} onClick={() => submit(a)}>Submit count</Pill></div>
              </div>
            ))}
          </div>
        )}
      </Panel>
      <Panel title={canPost ? 'Counts and differences' : 'My recent counts'}>
        {H.loading && !H.data ? <Loading /> : (H.data || []).length === 0 ? <kit.EmptyState text="No counts yet." /> : (
          <div style={{ display: 'grid', gap: 10 }}>
            {H.data.map(c => {
              const flagged = c.status === 'variance' || c.status === 'investigating' || c.status === 'under review';
              return (
                <div key={c.id} style={{ border: `1px solid ${flagged ? THEME.danger + '66' : THEME.line}`, borderRadius: 14, padding: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, fontWeight: 700 }}><span>{accName[c.account_code] || c.account_code}</span><span>{fmt(c.counted)}</span></div>
                  <div style={{ fontSize: 11.5, color: THEME.inkSoft, marginTop: 2 }}>{fmtDateTime(c.created_at)} · {String(c.status).replace('_', ' ')}{canPost && c.expected != null ? ` · books ${fmt(c.expected)} · difference ${fmt(c.variance)}` : ''}{c.note ? ` · ${c.note}` : ''}</div>
                  {canPost && (c.status === 'variance' || c.status === 'investigating') && (
                    c.counted_by === profile.id
                      ? <div style={{ fontSize: 12, color: THEME.gold, fontWeight: 600, marginTop: 8 }}>Someone else must resolve a count you submitted</div>
                      : <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                          <input aria-label="Reason" placeholder="Reason (required to write off)" value={reason[c.id] || ''} onChange={e => setReason(r => ({ ...r, [c.id]: e.target.value }))} style={input} />
                          <div style={{ display: 'flex', gap: 8 }}>
                            {c.status === 'variance' && <Pill tone="ghost" disabled={act.busy} onClick={() => resolve(c, 'investigate')}>Investigate</Pill>}
                            <Pill disabled={act.busy || !(reason[c.id] || '').trim()} onClick={() => resolve(c, 'write_off')}>Write off the difference</Pill>
                          </div>
                        </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}

/* =============================== compliance =============================== */
function Spark({ points, color }) {
  const pts = points.filter(p => p != null);
  if (pts.length < 2) return <div style={{ fontSize: 11.5, opacity: 0.7 }}>Trend appears after two days of history.</div>;
  const mx = Math.max(...pts), mn = Math.min(...pts), span = mx - mn || 1;
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${(i / (pts.length - 1)) * 200},${40 - ((p - mn) / span) * 34 - 3}`).join(' ');
  return <svg viewBox="0 0 200 40" width="100%" height="40" role="img" aria-label="trend"><path d={path} fill="none" stroke={color} strokeWidth="2" /></svg>;
}

function Compliance({ token, canPost }) {
  const kit = useKit(); const { THEME, fmt, fmtDate } = kit; const call = useCall(token);
  const C = useLoader(() => call('compliance_snapshot'), [token], { every: 60000 });
  const S = useLoader(() => kit.sb('/rest/v1/compliance_snapshots?select=*&order=snapshot_date.desc&limit=60', { token }), [token]);
  const saved = useRef(false);
  useEffect(() => { if (canPost && C.data && C.data.gl_active && !saved.current) { saved.current = true; call('record_compliance_snapshot').then(S.reload).catch(() => {}); } }, [C.data, canPost]); // eslint-disable-line
  if (C.loading && !C.data) return <Loading />;
  if (!C.data) return <ErrorBox msg={C.error} onRetry={C.reload} />;
  const c = C.data; const hist = [...(S.data || [])].reverse();
  const trend = key => hist.map(h => (h.data[key] ? h.data[key].value : null)).map(v => (v == null ? null : Number(v)));
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {!c.gl_active && <Panel title="Accounting ledger not switched on" sub="Ratios are calculated from the ledger. Complete Setup first." />}
      {c.alerts.length > 0 && <Panel title="Alerts" right={<Dot status={c.worst} />}>{c.alerts.map((a, i) => <div key={i} style={{ fontSize: 13, padding: '4px 0' }}>{a}</div>)}</Panel>}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Panel style={{ flex: '1 1 260px' }} title="Liquidity" sub="Cash, bank and mobile money as a share of members' withdrawable savings and other short-term liabilities.">
          <Gauge label="Liquid assets ÷ short-term liabilities" m={c.liquidity} />
          <Row label="Liquid assets" value={fmt(c.liquidity.liquid_assets)} /><Row label="Short-term liabilities" value={fmt(c.liquidity.short_term_liabilities)} />
          <Spark points={trend('liquidity')} color={statusColor(THEME, c.liquidity.status)} />
        </Panel>
        <Panel style={{ flex: '1 1 260px' }} title="Capital adequacy" sub="Total equity (shares, reserves, retained and current surplus) as a share of total assets.">
          <Gauge label="Equity ÷ total assets" m={c.equity} />
          <Row label="Core capital" value={fmt(c.core_capital)} /><Row label="Institutional capital" value={fmt(c.institutional_capital)} /><Row label="Total equity" value={fmt(c.total_equity)} />
          <Spark points={trend('equity')} color={statusColor(THEME, c.equity.status)} />
        </Panel>
        <Panel style={{ flex: '1 1 260px' }} title="Borrowing limit" sub="Money borrowed from outside as a share of total assets.">
          <Gauge label="External borrowing ÷ total assets" m={c.borrowing} higherIsBetter={false} />
          <Row label="External borrowing" value={fmt(c.borrowing.external_borrowing)} /><Row label="Total assets" value={fmt(c.total_assets)} />
          <Spark points={trend('borrowing')} color={statusColor(THEME, c.borrowing.status)} />
        </Panel>
      </div>
      <div style={{ fontSize: 11.5, color: THEME.inkSoft, lineHeight: 1.5 }}>The limits come from Setup and must match the rules your regulator applies to you. Which accounts count as "liquid", "short-term" or "capital" can be reviewed with your accountant. As at {fmtDate(c.as_of)}.</div>
    </div>
  );
}

/* =============================== provisioning =============================== */
function Provisioning({ token, canPost }) {
  const kit = useKit(); const { THEME, fmt } = kit; const call = useCall(token); const act = useAction(); const input = useInputStyle();
  const P = useLoader(() => call('provision_summary'), [token], { every: 60000 });
  const [rates, setRates] = useState({});
  if (P.loading && !P.data) return <Loading />;
  if (!P.data) return <ErrorBox msg={P.error} onRetry={P.reload} />;
  const p = P.data;
  const saveRate = r => act.run(async () => { await call('set_provision_rate', { p_class: r.class, p_rate: Number(rates[r.class]) }); setRates(x => { const y = { ...x }; delete y[r.class]; return y; }); P.reload(); }, `Rate for "${r.class}" saved.`);
  const post = () => act.run(async () => { const r = await call('post_provision_adjustment', {}); P.reload(); return r; }, 'Provision adjustment sent for approval.');
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <Notes a={act} />
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Kpi tone="mint" label="Loan portfolio" value={fmt(p.par.portfolio)} sub="active loans outstanding" />
        <Kpi tone={p.par.par1_pct > 0 ? 'butter' : 'mint'} label="PAR 1+ days" value={p.par.par1_pct == null ? 'n/a' : p.par.par1_pct + '%'} sub="any amount late" />
        <Kpi tone={p.par.par30_pct > 5 ? 'blush' : 'mint'} label="PAR 30+ days" value={p.par.par30_pct == null ? 'n/a' : p.par.par30_pct + '%'} sub="over 30 days late" />
        <Kpi tone={p.par.par90_pct > 0 ? 'blush' : 'mint'} label="PAR 90+ days" value={p.par.par90_pct == null ? 'n/a' : p.par.par90_pct + '%'} sub="over 90 days late" />
      </div>
      <Panel title="Provision required" sub="Each loan is placed in a class by how many days it is late and provided for at the class rate. The starting rates are examples - confirm them with your accountant and regulator, then adjust below.">
        <Table head={['Class', 'Loans', 'Outstanding', 'Rate %', 'Required']} right={[1, 2, 3, 4]}
          rows={p.rows.map(r => [r.class, r.loans, <Money key="o" v={r.outstanding} />,
            canPost ? <span key="r" style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}><input aria-label={`Rate for ${r.class}`} type="number" min="0" max="100" value={rates[r.class] !== undefined ? rates[r.class] : r.rate_pct} onChange={e => setRates(x => ({ ...x, [r.class]: e.target.value }))} style={{ ...input, width: 70, padding: '6px 8px' }} />{rates[r.class] !== undefined && Number(rates[r.class]) !== Number(r.rate_pct) && <Pill disabled={act.busy} onClick={() => saveRate(r)}>Save</Pill>}</span> : r.rate_pct,
            <Money key="q" v={r.required} strong />])}
          foot={[['Total', '', '', '', <Money key="t" v={p.required} strong />]]} />
        <div style={{ marginTop: 14 }}>
          <Row label="Provision required" value={fmt(p.required)} />
          <Row label="Provision held in the books" value={fmt(p.held)} />
          <Row label={p.shortfall > 0 ? 'Shortfall to set aside' : p.shortfall < 0 ? 'Over-provided' : 'Difference'} value={fmt(Math.abs(p.shortfall))} strong />
        </div>
        {canPost && Math.abs(p.shortfall) >= 0.01 && (p.gl_active
          ? <div style={{ marginTop: 10 }}><Pill tone="sun" disabled={act.busy} onClick={post}>Post the adjustment for approval</Pill><div style={{ fontSize: 11.5, color: THEME.inkSoft, marginTop: 6 }}>Creates a journal (expense against the provision account). A second person approves it.</div></div>
          : <div style={{ fontSize: 12, color: THEME.inkSoft, marginTop: 10 }}>Switch on the accounting ledger to post the adjustment.</div>)}
      </Panel>
    </div>
  );
}

/* =============================== savings interest =============================== */
function SavingsInterest({ token }) {
  const kit = useKit(); const { THEME, fmt, fmtDate } = kit; const call = useCall(token); const act = useAction(); const input = useInputStyle();
  const R = useLoader(() => kit.sb('/rest/v1/savings_interest_rates?select=*&order=kind', { token }), [token]);
  const O = useLoader(() => call('finance_overview'), [token]);
  const last = useLoader(() => kit.sb('/rest/v1/savings_interest_accruals?select=accrual_date&order=accrual_date.desc&limit=1', { token }), [token]);
  const [vals, setVals] = useState({});
  const LABEL = { voluntary: 'Voluntary savings', compulsory: 'Compulsory savings', non_withdrawable: 'Non-withdrawable deposits' };
  const reloadAll = () => { R.reload(); O.reload(); last.reload(); };
  const gl = O.data && O.data.gl_active;
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <Notes a={act} />
      <Panel title="Interest rates (per year)" sub="Interest is worked out every day on each member's balance and set aside as a liability. Paying it adds it to the member's account.">
        {R.loading && !R.data ? <Loading /> : (
          <div style={{ display: 'grid', gap: 10 }}>
            {(R.data || []).map(r => (
              <div key={r.kind} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 110px auto', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 13.5, fontWeight: 600 }}>{LABEL[r.kind]}</span>
                <input aria-label={`${LABEL[r.kind]} rate`} type="number" min="0" max="100" step="0.1" value={vals[r.kind] !== undefined ? vals[r.kind] : r.annual_rate_pct} onChange={e => setVals(v => ({ ...v, [r.kind]: e.target.value }))} style={input} />
                <Pill disabled={act.busy || vals[r.kind] === undefined || Number(vals[r.kind]) === Number(r.annual_rate_pct)} onClick={() => act.run(async () => { await call('set_savings_interest_rate', { p_kind: r.kind, p_rate: Number(vals[r.kind]) }); setVals(v => { const w = { ...v }; delete w[r.kind]; return w; }); R.reload(); }, 'Rate saved.')}>Save</Pill>
              </div>
            ))}
          </div>
        )}
      </Panel>
      <Panel title="Accrue and pay interest" sub={gl ? `Accrued up to ${last.data && last.data[0] ? fmtDate(last.data[0].accrual_date) : 'nothing yet'}. Not yet paid to members: ${O.data ? fmt(O.data.attention.accrued_interest_unpaid) : '…'}.` : 'Switch on the accounting ledger first (Setup).'}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Pill disabled={!gl || act.busy} onClick={() => act.run(async () => { const r = await call('accrue_savings_interest', {}); reloadAll(); return r; }, r => (Number(r.total) > 0 ? `Accrued ${fmt(r.total)} over ${r.days} day${r.days === 1 ? '' : 's'}.` : 'Nothing to accrue - already up to date, or no rate is set.'))}>Accrue up to today</Pill>
          <Pill tone="sun" disabled={!gl || act.busy} onClick={() => { if (window.confirm('Pay all accrued interest into members\' accounts now?')) act.run(async () => { const r = await call('capitalize_savings_interest', {}); reloadAll(); return r; }, r => `Paid ${fmt(r.total)} to ${r.members} member${r.members === 1 ? '' : 's'}.`); }}>Pay accrued interest to members</Pill>
        </div>
        <div style={{ fontSize: 11.5, color: THEME.inkSoft, marginTop: 10, lineHeight: 1.5 }}>Run "Accrue" every day (it catches up automatically if days are missed, using the balances held when it is run). Pay interest at month end or year end. See the runbook to automate the daily run.</div>
      </Panel>
    </div>
  );
}

/* =============================== setup =============================== */
function Setup({ token, role, accounts, reloadAccounts, members, profile, go }) {
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <LedgerActivation token={token} accounts={accounts} members={members} profile={profile} go={go} role={role} />
      <ChartOfAccounts token={token} accounts={accounts} reload={reloadAccounts} />
      <Periods token={token} />
      <Thresholds token={token} />
    </div>
  );
}

function LedgerActivation({ token, role, go }) {
  const kit = useKit(); const { THEME, fmt, fmtDate } = kit; const call = useCall(token); const act = useAction(); const input = useInputStyle();
  const O = useLoader(() => call('finance_overview'), [token]);
  const S = useLoader(() => call('opening_balance_suggestion'), [token]);
  const PO = useLoader(() => kit.sb('/rest/v1/gl_pending_journals?kind=eq.opening&status=eq.pending&select=id', { token }), [token]);
  const [f, setF] = useState({ date: todayStr(), cash: '', bank: '', mobile: '', other: '', fixed: '', payables: '', borrowings: '', reserves: '' });
  const set = k => e => setF(x => ({ ...x, [k]: e.target.value }));
  if ((O.loading && !O.data) || (S.loading && !S.data)) return <Loading />;
  if (!O.data || !S.data) return <ErrorBox msg={O.error || S.error} onRetry={() => { O.reload(); S.reload(); }} />;
  const o = O.data, s = S.data; const v = k => Number(f[k] || 0);
  const assets = n2(v('cash') + v('bank') + v('mobile') + v('other') + v('fixed') + Number(s.loans_receivable));
  const savingsTotal = n2(Number(s.savings_voluntary) + Number(s.savings_compulsory) + Number(s.savings_non_withdrawable));
  const liabs = n2(savingsTotal + v('payables') + v('borrowings'));
  const retained = n2(assets - liabs - Number(s.shares) - v('reserves'));
  const lines = [
    ['1010', v('cash'), 0], ['1020', v('bank'), 0], ['1030', v('mobile'), 0], ['1100', Number(s.loans_receivable), 0], ['1200', v('other'), 0], ['1300', v('fixed'), 0],
    ['2010', 0, Number(s.savings_voluntary)], ['2020', 0, Number(s.savings_compulsory)], ['2030', 0, Number(s.savings_non_withdrawable)], ['2100', 0, v('payables')], ['2200', 0, v('borrowings')],
    ['3010', 0, Number(s.shares)], ['3200', 0, v('reserves')], ['3100', retained < 0 ? -retained : 0, retained > 0 ? retained : 0],
  ].filter(l => l[1] > 0 || l[2] > 0).map(l => ({ account: l[0], debit: n2(l[1]), credit: n2(l[2]) }));
  const pending = (PO.data || []).length > 0;
  const step = (n, title, done, body) => (
    <div style={{ display: 'flex', gap: 12, padding: '12px 0', borderTop: n > 1 ? `1px solid ${THEME.line}` : 'none' }}>
      <span style={{ width: 26, height: 26, borderRadius: 99, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: done ? THEME.success : THEME.line, color: done ? '#fff' : THEME.inkSoft, fontSize: 12, fontWeight: 700 }}>{done ? <Check size={14} /> : n}</span>
      <div style={{ minWidth: 0, flex: 1 }}><div style={{ fontWeight: 700, fontSize: 13.5 }}>{title}</div>{body}</div>
    </div>
  );
  return (
    <Panel title="Accounting ledger" right={<span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700 }}><Dot status={o.gl_active ? 'green' : 'amber'} />{o.gl_active ? `Active since ${fmtDate(o.gl_start_date)}` : 'Not switched on'}</span>}
      sub="The ledger starts from your real position on the day you switch it on. Member savings, shares and loans are filled in from the member records; you enter what the SACCO holds in cash and bank and anything else.">
      <Notes a={act} />
      {step(1, 'Enter your opening position', o.has_opening, o.has_opening ? <div style={{ fontSize: 12.5, color: THEME.inkSoft }}>Opening balances journal posted.</div> : pending ? <div style={{ fontSize: 12.5, color: THEME.gold, fontWeight: 600 }}>Submitted - waiting for a second person to approve it in Journals.</div> : (
        <div style={{ display: 'grid', gap: 10, marginTop: 8 }}>
          <div style={{ fontSize: 12, color: THEME.inkSoft }}>From the member records: savings {fmt(savingsTotal)}, shares {fmt(s.shares)}, loans outstanding {fmt(s.loans_receivable)}.</div>
          <Field label="Position date"><input type="date" value={f.date} max={todayStr()} onChange={set('date')} style={input} /></Field>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8 }}>
            <Field label="Cash in hand"><input type="number" min="0" value={f.cash} onChange={set('cash')} style={input} /></Field>
            <Field label="Bank accounts"><input type="number" min="0" value={f.bank} onChange={set('bank')} style={input} /></Field>
            <Field label="Mobile money float"><input type="number" min="0" value={f.mobile} onChange={set('mobile')} style={input} /></Field>
            <Field label="Other assets"><input type="number" min="0" value={f.other} onChange={set('other')} style={input} /></Field>
            <Field label="Fixed assets (net)"><input type="number" min="0" value={f.fixed} onChange={set('fixed')} style={input} /></Field>
            <Field label="Payables and accruals"><input type="number" min="0" value={f.payables} onChange={set('payables')} style={input} /></Field>
            <Field label="External borrowings"><input type="number" min="0" value={f.borrowings} onChange={set('borrowings')} style={input} /></Field>
            <Field label="Reserves"><input type="number" min="0" value={f.reserves} onChange={set('reserves')} style={input} /></Field>
          </div>
          <Row label="Total assets" value={fmt(assets)} /><Row label="Total liabilities" value={fmt(liabs)} />
          <Row label={retained >= 0 ? 'Retained earnings (balancing figure)' : 'Accumulated deficit (balancing figure)'} value={fmt(Math.abs(retained))} strong />
          <div style={{ fontSize: 11.5, color: THEME.inkSoft }}>Retained earnings is what is left after liabilities, shares and reserves - check with your last signed balance sheet.</div>
          <Pill tone="sun" disabled={act.busy || assets <= 0} onClick={() => act.run(async () => { await call('submit_opening_journal', { p_date: f.date, p_lines: lines }); PO.reload(); O.reload(); }, 'Opening journal sent for approval.')}>Send opening balances for approval</Pill>
        </div>))}
      {step(2, 'A second person approves it', o.has_opening, !o.has_opening && pending && <div style={{ marginTop: 6 }}><Pill tone="ghost" onClick={() => go('journals')}>Go to Journals</Pill></div>)}
      {step(3, 'Switch the ledger on', o.gl_active, !o.gl_active && (
        <div style={{ marginTop: 6, display: 'grid', gap: 8 }}>
          <div style={{ fontSize: 12, color: THEME.inkSoft }}>From this moment every deposit, withdrawal, share purchase, loan and repayment posts to the books automatically. Activation is refused if the opening journal no longer matches the member records.</div>
          <div><Pill tone="sun" disabled={!o.has_opening || act.busy} onClick={() => act.run(async () => { await call('activate_general_ledger'); O.reload(); }, 'The accounting ledger is now active.')}>Switch on the ledger</Pill></div>
        </div>))}
      {o.gl_active && role === 'manager' && (
        <div style={{ borderTop: `1px solid ${THEME.line}`, marginTop: 8, paddingTop: 12 }}>
          <div style={{ fontSize: 12, color: THEME.inkSoft, marginBottom: 8 }}>Emergency stop: new transactions stop posting to the books (members are not affected). Use only on advice - the books will then fall behind the member records.</div>
          <Pill tone="ghost" disabled={act.busy} onClick={() => { if (window.confirm('Stop posting to the accounting ledger?')) act.run(async () => { await call('deactivate_general_ledger'); O.reload(); }, 'Posting to the ledger has been switched off.'); }}>Switch off posting</Pill>
        </div>)}
    </Panel>
  );
}

function ChartOfAccounts({ token, accounts, reload }) {
  const kit = useKit(); const call = useCall(token); const act = useAction(); const input = useInputStyle(); const { THEME } = kit;
  const [f, setF] = useState({ code: '', name: '', type: 'expense', contra: false });
  const [edit, setEdit] = useState(null);
  const TYPE = { asset: 'Asset', liability: 'Liability', equity: 'Equity', income: 'Income', expense: 'Expense' };
  const save = (a) => act.run(async () => { await call('upsert_gl_account', { p_code: a.code, p_name: a.name, p_type: a.type, p_is_contra: !!a.contra, p_active: a.active !== false }); if (reload) reload(); setF({ code: '', name: '', type: 'expense', contra: false }); }, 'Account saved.');
  return (
    <Panel title="Chart of accounts" sub="Accounts marked automatic are used by the system and cannot be removed. Add your own, for example separate expense lines.">
      <Notes a={act} />
      <Table head={['Code', 'Name', 'Type', '']} rows={accounts.map(a => [a.code, <span key="n" style={{ opacity: a.active ? 1 : 0.5 }}>{a.name}{a.is_system ? <span style={{ fontSize: 10.5, color: THEME.inkSoft, marginLeft: 6 }}>automatic</span> : ''}{a.active ? '' : ' (inactive)'}</span>, TYPE[a.type] + (a.is_contra ? ' (contra)' : ''),
        <Pill key="e" tone="ghost" onClick={() => setEdit({ ...a })}>Edit</Pill>])} />
      <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, alignItems: 'end' }}>
        <Field label="Code (4 digits)"><input value={f.code} onChange={e => setF(x => ({ ...x, code: e.target.value.replace(/\D/g, '').slice(0, 4) }))} style={input} /></Field>
        <Field label="Name"><input value={f.name} onChange={e => setF(x => ({ ...x, name: e.target.value }))} style={input} /></Field>
        <Field label="Type"><select value={f.type} onChange={e => setF(x => ({ ...x, type: e.target.value }))} style={input}>{Object.entries(TYPE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Pill tone="sun" disabled={act.busy || f.code.length !== 4 || !f.name.trim()} onClick={() => save({ ...f, name: f.name.trim() })}>Add account</Pill>
      </div>
      {edit && (
        <Sheet title={`Edit ${edit.code}`} onClose={() => setEdit(null)}>
          <div style={{ display: 'grid', gap: 10 }}>
            <Field label="Name"><input value={edit.name} onChange={e => setEdit(x => ({ ...x, name: e.target.value }))} style={input} /></Field>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}><input type="checkbox" checked={edit.active} disabled={edit.is_system} onChange={e => setEdit(x => ({ ...x, active: e.target.checked }))} /> Active{edit.is_system ? ' (automatic accounts must stay active)' : ''}</label>
            <Pill tone="sun" disabled={act.busy || !edit.name.trim()} onClick={async () => { const r = await save(edit); if (r) setEdit(null); }}>Save</Pill>
          </div>
        </Sheet>
      )}
    </Panel>
  );
}

function Periods({ token }) {
  const kit = useKit(); const { THEME, fmtDate } = kit; const call = useCall(token); const act = useAction(); const input = useInputStyle();
  const O = useLoader(() => call('finance_overview'), [token]);
  const [through, setThrough] = useState(''); const [year, setYear] = useState(String(new Date().getFullYear() - 1));
  const closed = O.data && O.data.closed_through;
  return (
    <Panel title="Closing periods" sub="Closing a period locks it: nothing can be posted or backdated into it. Do this after month-end reconciliation. It cannot be undone.">
      <Notes a={act} />
      <div style={{ fontSize: 13, marginBottom: 10 }}>{closed ? `Closed through ${fmtDate(closed)}.` : 'No period has been closed yet.'}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 8, alignItems: 'end' }}>
        <Field label="Close everything up to and including"><input type="date" value={through} max={new Date(Date.now() - 86400000).toISOString().slice(0, 10)} onChange={e => setThrough(e.target.value)} style={input} /></Field>
        <Pill disabled={!through || act.busy} onClick={() => { if (window.confirm(`Close all periods through ${through}? This cannot be undone.`)) act.run(async () => { await call('close_period', { p_through: through }); O.reload(); }, 'Period closed.'); }}>Close period</Pill>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 8, alignItems: 'end', marginTop: 14 }}>
        <Field label="Year-end close (moves the year's surplus into retained earnings)"><input type="number" value={year} onChange={e => setYear(e.target.value)} style={input} /></Field>
        <Pill disabled={act.busy || !year} onClick={() => act.run(async () => { await call('close_financial_year', { p_year: Number(year) }); }, r => 'Year-end journal sent for approval. Approve it in Journals.')}>Prepare year-end</Pill>
      </div>
    </Panel>
  );
}

function Thresholds({ token }) {
  const kit = useKit(); const { THEME } = kit; const call = useCall(token); const act = useAction(); const input = useInputStyle();
  const S = useLoader(() => kit.sb('/rest/v1/finance_settings?select=key,value_num,note', { token }), [token]);
  const [vals, setVals] = useState({});
  const KEYS = [['min_liquidity_pct', 'Minimum liquidity %'], ['min_equity_pct', 'Minimum equity to assets %'], ['max_borrowing_pct', 'Maximum external borrowing %'], ['alert_buffer_pp', 'Amber warning buffer (percentage points)'], ['cash_variance_tolerance', 'Cash count tolerance (UGX)']];
  if (S.loading && !S.data) return <Loading />;
  const byKey = Object.fromEntries((S.data || []).map(s => [s.key, s]));
  return (
    <Panel title="Limits and tolerances" sub="Set these to the figures your regulator and board require. The starting values are common examples only - confirm them with your accountant or UMRA before relying on the alerts.">
      <Notes a={act} />
      <div style={{ display: 'grid', gap: 10 }}>
        {KEYS.map(([k, label]) => byKey[k] && (
          <div key={k} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 120px auto', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 13 }}>{label}</span>
            <input aria-label={label} type="number" min="0" value={vals[k] !== undefined ? vals[k] : byKey[k].value_num} onChange={e => setVals(v => ({ ...v, [k]: e.target.value }))} style={input} />
            <Pill disabled={act.busy || vals[k] === undefined || Number(vals[k]) === Number(byKey[k].value_num)} onClick={() => act.run(async () => { await call('set_finance_setting', { p_key: k, p_value: Number(vals[k]) }); setVals(v => { const w = { ...v }; delete w[k]; return w; }); S.reload(); }, 'Saved.')}>Save</Pill>
          </div>
        ))}
      </div>
    </Panel>
  );
}
