import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  ArrowLeft, Phone, MessageCircle, Plus, Check, X, MapPin, Download, Landmark, TrendingUp, AlertTriangle, Wallet,
  Users, Clock, Gauge, FileText, Search, ShieldCheck, Settings as Cog,
} from 'lucide-react';
import {
  BarChart, Bar as RBar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie,
} from 'recharts';
import {
  useKit, tints, rpc, quote, buildSchedule, dueLabel, daysUntil, waLink, paidPct, useLoader,
  OPEN_STAGES, STAGE_LABEL, STAGES, headroomOf,
} from './kit.js';
import {
  LoanStyles, Tile, Pill, Money, Eyebrow, ErrorNote, OkNote, Sheet, StageTrack, Bar, Seg, Timeline, Kpi, Row,
  useInputStyle, stageTone,
} from './ui.jsx';
import { downloadLoanStatement } from './pdf.js';

const PAR_BUCKETS = ['Current', '1-30', '31-60', '61-90', '90+'];
const daysSince = ts => Math.max(0, Math.floor((Date.now() - new Date(ts).getTime()) / 86400000));
const sum = (arr, f) => arr.reduce((s, x) => s + Number(f(x) || 0), 0);
const MODES = [
  ['cash', 'Cash'], ['mobile_money', 'Mobile money'], ['bank_transfer', 'Bank transfer'],
  ['cheque', 'Cheque'], ['payroll', 'Payroll deduction'], ['other', 'Other'],
];

/* ================================ desk ================================ */
export default function LoanDesk({ profile, token, perms, savingsMap = {}, sharesMap = {}, onViewMember, onChanged }) {
  const kit = useKit();
  const { THEME, Spinner, GhostButton, useIsDesktop } = kit;
  const wide = useIsDesktop();
  const isManager = profile.role === 'manager';
  const [sub, setSub] = useState('overview');
  const [openId, setOpenId] = useState(null);

  const L = useLoader(async () => {
    try { await rpc(kit, token, 'refresh_arrears'); } catch { /* arrears refresh is best effort */ }
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const [loans, products, settings, reps] = await Promise.all([
      kit.sb('/rest/v1/loan_portfolio?select=*&order=applied_at.desc', { token }),
      kit.sb('/rest/v1/loan_products?select=*&order=name', { token }),
      kit.sb('/rest/v1/sacco_settings?select=*', { token }),
      kit.sb(`/rest/v1/loan_repayments?created_at=gte.${encodeURIComponent(monthStart.toISOString())}&select=amount`, { token }),
    ]);
    return { loans: loans || [], products: products || [], settings: settings || [], collected: sum(reps || [], r => r.amount) };
  }, [token]);

  function changed() { L.reload(); if (onChanged) onChanged(); }

  const data = L.data;
  const loans = data ? data.loans : [];
  const live = useMemo(() => loans.filter(l => l.stage === 'disbursed'), [loans]);
  const open = useMemo(() => loans.filter(l => OPEN_STAGES.includes(l.stage)), [loans]);
  const late = useMemo(() => live.filter(l => l.days_in_arrears > 0), [live]);

  if (!data) {
    return L.loading ? <Spinner /> : (
      <div style={{ display: 'grid', gap: 12 }}>
        <ErrorNote msg={L.error || 'Could not load loans. Run the three loan SQL files first.'} />
        <GhostButton onClick={L.reload}>Try again</GhostButton>
      </div>
    );
  }
  const { products, settings, collected } = data;
  const outstanding = sum(live, l => l.outstanding_balance);
  const par30 = sum(live.filter(l => l.days_in_arrears > 30), l => l.outstanding_balance);
  const setting = key => Number((settings.find(s => s.key === key) || {}).value || 0);

  if (openId) {
    const loan = loans.find(l => l.loan_id === openId);
    if (loan) {
      return (
        <>
          <LoanStyles />
          <LoanFile loan={loan} loans={loans} products={products} token={token} profile={profile} perms={perms}
            approvalLimit={setting('officer_approval_limit')}
            savings={Number((savingsMap[loan.member_id] || {}).balance || 0)} shares={Number((sharesMap[loan.member_id] || {}).balance || 0)}
            onBack={() => setOpenId(null)} onViewMember={onViewMember} onChanged={changed} />
        </>
      );
    }
  }

  const tabs = [
    { value: 'overview', label: 'Overview' },
    { value: 'pipeline', label: 'Applications', count: open.length },
    { value: 'portfolio', label: 'Portfolio', count: live.length },
    { value: 'collections', label: 'Collections', count: late.length },
    { value: 'products', label: 'Products' },
    { value: 'settings', label: 'Limits' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <LoanStyles />
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Kpi tone="mint" icon={Clock} label="Waiting for a decision" value={open.length} sub={fmtShort(kit, sum(open, l => l.principal)) + ' requested'} />
        <Kpi tone="sky" icon={Landmark} label="Active loans" value={live.length} sub={`${fmtShort(kit, outstanding)} outstanding`} />
        <Kpi tone={late.length ? 'blush' : 'butter'} icon={AlertTriangle} accent={THEME.danger} label="In arrears" value={late.length}
          sub={outstanding ? `${((par30 / outstanding) * 100).toFixed(1)}% at risk (30+ days)` : 'No active loans'} />
        <Kpi icon={TrendingUp} label="Collected this month" value={fmtShort(kit, collected)} sub="Loan repayments received" />
      </div>

      <Seg options={tabs} value={sub} onChange={setSub} />

      {sub === 'overview' && <Overview live={live} open={open} loans={loans} setSub={setSub} onOpen={setOpenId} wide={wide} />}
      {sub === 'pipeline' && <Pipeline open={open} wide={wide} onOpen={setOpenId} />}
      {sub === 'portfolio' && <Portfolio loans={loans} onOpen={setOpenId} wide={wide} />}
      {sub === 'collections' && <Collections live={live} onOpen={setOpenId} wide={wide} />}
      {sub === 'products' && <Products products={products} token={token} canEdit={isManager} onChanged={changed} />}
      {sub === 'settings' && <Limits settings={settings} token={token} canEdit={isManager} onChanged={changed} />}
    </div>
  );
}

function fmtShort(kit, n) {
  const v = Number(n || 0);
  if (v >= 1e9) return `UGX ${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `UGX ${(v / 1e6).toFixed(v >= 1e8 ? 0 : 1)}M`;
  return kit.fmt(v);
}

/* ============================== overview ============================== */
function Overview({ live, open, loans, setSub, onOpen, wide }) {
  const kit = useKit();
  const { THEME, fmt, EmptyState } = kit;
  const T = tints(THEME);
  const parData = PAR_BUCKETS.map(b => ({ name: b === 'Current' ? 'Current' : b + ' d', value: Math.round(sum(live.filter(l => l.par_bucket === b), l => l.outstanding_balance)) }));
  const parColors = [THEME.success, THEME.goldLight, THEME.gold, '#E0833B', THEME.danger];
  const byProduct = Object.entries(live.reduce((a, l) => { const k = l.product_name || 'Other'; a[k] = (a[k] || 0) + Number(l.outstanding_balance); return a; }, {}))
    .map(([name, value]) => ({ name, value: Math.round(value) }));
  const donut = [THEME.pine, THEME.gold, '#5B8DEF', '#9B6BDF', THEME.danger];
  const dues = live.filter(l => l.next_due_date && daysUntil(l.next_due_date) <= 14 && l.days_in_arrears === 0)
    .sort((a, b) => a.next_due_date.localeCompare(b.next_due_date)).slice(0, 6);
  const tip = { contentStyle: { borderRadius: 10, border: `1px solid ${THEME.line}`, fontSize: 12, background: THEME.surface, color: THEME.ink }, itemStyle: { color: THEME.ink }, labelStyle: { color: THEME.ink } };
  const card = { background: THEME.surface, border: `1px solid ${THEME.line}`, borderRadius: 22, padding: 18, minWidth: 0 };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: wide ? '1.4fr 1fr' : '1fr', gap: 14 }}>
      <div style={card}>
        <div style={{ fontFamily: 'Fraunces, serif', fontSize: 18 }}>Portfolio at risk</div>
        <Eyebrow>Outstanding balance by days overdue</Eyebrow>
        {live.length === 0 ? <EmptyState text="No active loans yet." /> : (
          <div style={{ height: 190, marginTop: 10 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={parData}>
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: THEME.inkSoft }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip formatter={v => fmt(v)} cursor={{ fill: THEME.mode === 'dark' ? '#ffffff0d' : '#0000000a' }} {...tip} />
                <RBar dataKey="value" radius={[8, 8, 0, 0]}>{parData.map((_, i) => <Cell key={i} fill={parColors[i]} />)}</RBar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div style={card}>
        <div style={{ fontFamily: 'Fraunces, serif', fontSize: 18 }}>By product</div>
        <Eyebrow>Where the money is lent</Eyebrow>
        {byProduct.length === 0 ? <EmptyState text="Nothing lent out yet." /> : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6 }}>
            <div style={{ width: 130, height: 130, flexShrink: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart><Pie data={byProduct} dataKey="value" innerRadius={38} outerRadius={60} paddingAngle={3} stroke="none">
                  {byProduct.map((_, i) => <Cell key={i} fill={donut[i % donut.length]} />)}
                </Pie><Tooltip formatter={v => fmt(v)} {...tip} /></PieChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display: 'grid', gap: 6, fontSize: 12.5, minWidth: 0 }}>
              {byProduct.map((p, i) => (
                <div key={p.name} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ width: 9, height: 9, borderRadius: 3, background: donut[i % donut.length], flexShrink: 0 }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontFamily: 'Fraunces, serif', fontSize: 18 }}>Application pipeline</div>
          <Pill tone="ghost" onClick={() => setSub('pipeline')}>Open</Pill>
        </div>
        <div style={{ display: 'grid', gap: 12, marginTop: 14 }}>
          {STAGES.slice(0, 4).map(s => {
            const rows = open.filter(l => l.stage === s.key);
            return (
              <div key={s.key}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
                  <span style={{ fontWeight: 600 }}>{s.label}</span><span style={{ color: THEME.inkSoft }}>{rows.length} · {fmtShort(kit, sum(rows, l => l.principal))}</span>
                </div>
                <Bar pct={open.length ? (rows.length / open.length) * 100 : 0} color={THEME.pine} height={9} />
              </div>
            );
          })}
        </div>
      </div>

      <div style={card}>
        <div style={{ fontFamily: 'Fraunces, serif', fontSize: 18 }}>Due in the next 14 days</div>
        <Eyebrow>Installments coming up on current loans</Eyebrow>
        {dues.length === 0 ? <EmptyState text="Nothing due soon." /> : dues.map(l => (
          <button key={l.loan_id} onClick={() => onOpen(l.loan_id)} className="ln-row" style={rowBtn(THEME)}>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontWeight: 600, fontSize: 13.5 }}>{l.member_name}</div>
              <div style={{ fontSize: 11.5, color: THEME.inkSoft }}>{dueLabel(l.next_due_date)}</div>
            </div>
            <b style={{ fontSize: 13.5 }}>{fmt(l.next_due_amount)}</b>
          </button>
        ))}
      </div>
    </div>
  );
}
const rowBtn = THEME => ({
  display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '10px 6px',
  background: 'none', border: 'none', borderTop: `1px solid ${THEME.line}`, cursor: 'pointer', color: THEME.ink, font: 'inherit',
});

/* ============================== pipeline ============================== */
function Pipeline({ open, wide, onOpen }) {
  const kit = useKit();
  const { THEME, fmt, EmptyState } = kit;
  const [stage, setStage] = useState('all');
  const cols = STAGES.slice(0, 4);
  const Card = ({ l }) => (
    <button onClick={() => onOpen(l.loan_id)} className="ln-press" style={{
      textAlign: 'left', background: THEME.surface, border: `1px solid ${THEME.line}`, borderRadius: 18, padding: 14, cursor: 'pointer',
      color: THEME.ink, font: 'inherit', display: 'grid', gap: 6, width: '100%',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{l.member_name}</div>
        <span style={{ fontSize: 11, color: THEME.inkSoft, whiteSpace: 'nowrap' }}>{daysSince(l.applied_at)}d</span>
      </div>
      <Money value={l.principal} size={20} />
      <div style={{ fontSize: 12, color: THEME.inkSoft }}>{l.product_name || 'Loan'} · {l.term_months} months</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {l.repayment_plan ? <kit.Badge color={THEME.gold}>special</kit.Badge> : l.flagged_over_ceiling ? <kit.Badge color={THEME.danger}>over limit</kit.Badge> : null}
        {l.stage === 'approved' && <kit.Badge color={THEME.success}>ready to disburse</kit.Badge>}
      </div>
    </button>
  );
  if (open.length === 0) return <EmptyState text="No applications are waiting. New ones appear here the moment a member applies." />;
  if (wide) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12, alignItems: 'start' }}>
        {cols.map(c => {
          const rows = open.filter(l => l.stage === c.key);
          return (
            <div key={c.key} style={{ background: THEME.mode === 'dark' ? '#ffffff08' : '#0f3d3a08', borderRadius: 22, padding: 12, display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 4px', fontSize: 13, fontWeight: 700 }}>
                <span>{c.label}</span><span style={{ color: THEME.inkSoft }}>{rows.length}</span>
              </div>
              {rows.length === 0 ? <div style={{ fontSize: 12, color: THEME.inkSoft, padding: '12px 4px' }}>Empty</div> : rows.map(l => <Card key={l.loan_id} l={l} />)}
            </div>
          );
        })}
      </div>
    );
  }
  const shown = stage === 'all' ? open : open.filter(l => l.stage === stage);
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Seg value={stage} onChange={setStage} options={[{ value: 'all', label: 'All', count: open.length }, ...cols.map(c => ({ value: c.key, label: c.label, count: open.filter(l => l.stage === c.key).length }))]} />
      {shown.length === 0 ? <EmptyState text="Nothing at this stage." /> : shown.map(l => <Card key={l.loan_id} l={l} />)}
    </div>
  );
}

/* ============================== portfolio ============================== */
function Portfolio({ loans, onOpen, wide }) {
  const kit = useKit();
  const { THEME, fmt, fmtDate, EmptyState, Badge } = kit;
  const input = useInputStyle();
  const [q, setQ] = useState('');
  const [f, setF] = useState('active');
  const filters = {
    active: l => l.stage === 'disbursed',
    arrears: l => l.stage === 'disbursed' && l.days_in_arrears > 0,
    closed: l => l.stage === 'closed',
    declined: l => l.stage === 'rejected',
    all: () => true,
  };
  const rows = loans.filter(filters[f]).filter(l => !q.trim() || (l.member_name || '').toLowerCase().includes(q.trim().toLowerCase()));
  function exportXlsx() {
    const data = rows.map(l => ({
      Member: l.member_name, Phone: l.member_phone, Product: l.product_name, Stage: STAGE_LABEL[l.stage],
      Principal: Number(l.approved_amount || l.principal), 'Rate %': Number(l.interest_rate), 'Term (months)': l.term_months,
      Outstanding: Number(l.outstanding_balance), 'Days overdue': l.days_in_arrears, 'PAR bucket': l.par_bucket,
      'Next due': l.next_due_date || '', Applied: l.applied_at ? l.applied_at.slice(0, 10) : '',
    }));
    const ws = XLSX.utils.json_to_sheet(data); const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Loan portfolio');
    XLSX.writeFile(wb, `Amani-SACCO-Loan-Portfolio-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }
  const parTone = b => b === 'Current' ? THEME.success : b === '1-30' ? THEME.gold : THEME.danger;
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 220px' }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: 13, color: THEME.inkSoft }} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by member name" style={{ ...input, paddingLeft: 34 }} />
        </div>
        <Pill tone="ghost" onClick={exportXlsx} disabled={rows.length === 0}><Download size={14} /> Excel</Pill>
      </div>
      <Seg value={f} onChange={setF} options={[
        { value: 'active', label: 'Active', count: loans.filter(filters.active).length },
        { value: 'arrears', label: 'In arrears', count: loans.filter(filters.arrears).length },
        { value: 'closed', label: 'Repaid', count: loans.filter(filters.closed).length },
        { value: 'declined', label: 'Declined', count: loans.filter(filters.declined).length },
        { value: 'all', label: 'All' },
      ]} />
      {rows.length === 0 ? <EmptyState text="No loans match." /> : wide ? (
        <div style={{ border: `1px solid ${THEME.line}`, borderRadius: 20, overflow: 'hidden', background: THEME.surface }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead><tr style={{ textAlign: 'left', color: THEME.inkSoft, fontSize: 12 }}>
              {['Member', 'Product', 'Amount', 'Outstanding', 'Progress', 'Next due', 'Status'].map(h => <th key={h} style={{ padding: '12px 14px', fontWeight: 600 }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {rows.map(l => (
                <tr key={l.loan_id} className="ln-row" onClick={() => onOpen(l.loan_id)} style={{ cursor: 'pointer', borderTop: `1px solid ${THEME.line}` }}>
                  <td style={{ padding: '12px 14px', fontWeight: 600 }}>{l.member_name}</td>
                  <td style={{ padding: '12px 14px', color: THEME.inkSoft }}>{l.product_name || '-'}</td>
                  <td style={{ padding: '12px 14px' }}>{fmt(l.approved_amount || l.principal)}</td>
                  <td style={{ padding: '12px 14px', fontWeight: 600 }}>{l.stage === 'disbursed' ? fmt(l.outstanding_balance) : '-'}</td>
                  <td style={{ padding: '12px 14px', minWidth: 110 }}>{l.stage === 'disbursed' || l.stage === 'closed' ? <Bar pct={paidPct(l)} /> : '-'}</td>
                  <td style={{ padding: '12px 14px', color: THEME.inkSoft }}>{l.stage === 'disbursed' ? fmtDate(l.next_due_date) : '-'}</td>
                  <td style={{ padding: '12px 14px' }}>
                    {l.stage === 'disbursed' ? <Badge color={parTone(l.par_bucket)}>{l.days_in_arrears > 0 ? `${l.days_in_arrears}d late` : 'current'}</Badge>
                      : <Badge color={l.stage === 'rejected' ? THEME.danger : l.stage === 'closed' ? THEME.success : THEME.gold}>{STAGE_LABEL[l.stage]}</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : rows.map((l, i) => (
        <Tile key={l.loan_id} tone={l.days_in_arrears > 0 ? 'blush' : ['mint', 'sky', 'butter'][i % 3]} onClick={() => onOpen(l.loan_id)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ fontWeight: 700 }}>{l.member_name}</div>
            <Badge color={l.stage === 'disbursed' ? parTone(l.par_bucket) : THEME.inkSoft}>{l.stage === 'disbursed' ? (l.days_in_arrears > 0 ? `${l.days_in_arrears}d late` : 'current') : STAGE_LABEL[l.stage]}</Badge>
          </div>
          <Money value={l.stage === 'disbursed' ? l.outstanding_balance : (l.approved_amount || l.principal)} size={24} style={{ display: 'block', marginTop: 6 }} />
          <div style={{ fontSize: 12, color: THEME.inkSoft, marginTop: 4 }}>{l.product_name || 'Loan'}{l.stage === 'disbursed' ? ` · ${dueLabel(l.next_due_date)}` : ''}</div>
          {(l.stage === 'disbursed' || l.stage === 'closed') && <div style={{ marginTop: 10 }}><Bar pct={paidPct(l)} /></div>}
        </Tile>
      ))}
    </div>
  );
}

/* ============================== collections ============================== */
function Collections({ live, onOpen, wide }) {
  const kit = useKit();
  const { THEME, fmt, fmtDate, EmptyState } = kit;
  const [bucket, setBucket] = useState('all');
  const late = live.filter(l => l.days_in_arrears > 0).sort((a, b) => b.days_in_arrears - a.days_in_arrears);
  const shown = bucket === 'all' ? late : late.filter(l => l.par_bucket === bucket);
  const colors = { '1-30': THEME.gold, '31-60': '#E0833B', '61-90': '#D9603B', '90+': THEME.danger };
  const total = sum(live, l => l.outstanding_balance);
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: wide ? 'repeat(4, 1fr)' : 'repeat(2, 1fr)', gap: 10 }}>
        {['1-30', '31-60', '61-90', '90+'].map(b => {
          const rows = late.filter(l => l.par_bucket === b);
          const amt = sum(rows, l => l.outstanding_balance);
          const on = bucket === b;
          return (
            <button key={b} onClick={() => setBucket(on ? 'all' : b)} className="ln-press" style={{
              textAlign: 'left', background: THEME.surface, border: on ? `2px solid ${colors[b]}` : `1px solid ${THEME.line}`,
              borderRadius: 20, padding: 14, cursor: 'pointer', color: THEME.ink, font: 'inherit',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700, color: colors[b] }}>
                <span style={{ width: 9, height: 9, borderRadius: 3, background: colors[b] }} />PAR {b} days
              </div>
              <div style={{ fontFamily: 'Fraunces, serif', fontSize: 24, marginTop: 6 }}>{rows.length}</div>
              <div style={{ fontSize: 11.5, color: THEME.inkSoft }}>{fmtShort(kit, amt)} · {total ? ((amt / total) * 100).toFixed(1) : 0}% of book</div>
            </button>
          );
        })}
      </div>
      {shown.length === 0 ? <EmptyState text={late.length === 0 ? 'No loans are overdue. Nice work.' : 'No loans in this bucket.'} /> : shown.map(l => {
        const first = (l.member_name || '').split(' ')[0];
        const msg = `Hello ${first}, this is Amani SACCO. Your loan payment of ${fmt(l.overdue_amount)} is ${l.days_in_arrears} days overdue. Please pay as soon as you can, quoting reference ${kit.shortId(l.loan_id)}. Thank you.`;
        const wa = waLink(l.member_phone, msg);
        return (
          <div key={l.loan_id} style={{ background: THEME.surface, border: `1px solid ${THEME.line}`, borderRadius: 20, padding: 14, display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{l.member_name}</div>
                <div style={{ fontSize: 12, color: THEME.inkSoft }}>{l.member_phone || 'No phone on file'} · next due {fmtDate(l.next_due_date)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: colors[l.par_bucket], fontWeight: 700, fontSize: 13 }}>{l.days_in_arrears} days overdue</div>
                <div style={{ fontSize: 12, color: THEME.inkSoft }}>{fmt(l.overdue_amount)} to clear · {fmt(l.outstanding_balance)} total</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {l.member_phone && <a href={`tel:${l.member_phone}`} style={linkPill(THEME)}><Phone size={14} /> Call</a>}
              {wa && <a href={wa} target="_blank" rel="noreferrer" style={linkPill(THEME)}><MessageCircle size={14} /> WhatsApp reminder</a>}
              <Pill tone="ghost" onClick={() => onOpen(l.loan_id)}>Open loan</Pill>
            </div>
          </div>
        );
      })}
    </div>
  );
}
const linkPill = THEME => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 999, background: THEME.mode === 'dark' ? '#F2F3F0' : '#16241F',
  color: THEME.mode === 'dark' ? '#0A0F0E' : '#fff', fontWeight: 700, fontSize: 12.5, textDecoration: 'none', minHeight: 34,
});

/* ============================== products ============================== */
const EMPTY_PRODUCT = {
  name: '', description: '', interest_rate: 10, interest_method: 'reducing', min_amount: 0, max_amount: '', min_term_months: 1,
  max_term_months: 12, savings_multiple: 3, processing_fee_pct: 0, insurance_fee_pct: 0, penalty_rate_pct: 2, grace_days: 0, min_guarantors: 0, active: true,
};
function Products({ products, token, canEdit, onChanged }) {
  const kit = useKit();
  const { THEME, EmptyState, Badge } = kit;
  const [edit, setEdit] = useState(null);
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {canEdit && <div><Pill onClick={() => setEdit({ ...EMPTY_PRODUCT })}><Plus size={14} /> New loan product</Pill></div>}
      {!canEdit && <div style={{ fontSize: 12.5, color: THEME.inkSoft }}>Only a manager can change loan products.</div>}
      {products.length === 0 && <EmptyState text="No products yet." />}
      {products.map((p, i) => (
        <Tile key={p.id} tone={p.active ? ['mint', 'sky', 'butter'][i % 3] : 'blush'} onClick={canEdit ? () => setEdit(p) : undefined} style={{ opacity: p.active ? 1 : 0.7 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: 20 }}>{p.name}</div>
            {!p.active && <Badge color={THEME.danger}>closed</Badge>}
          </div>
          {p.description && <div style={{ fontSize: 12.5, color: THEME.inkSoft, marginTop: 4 }}>{p.description}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 8, marginTop: 12, fontSize: 12.5 }}>
            <Fact k="Interest" v={`${Number(p.interest_rate)}% a year · ${p.interest_method}`} />
            <Fact k="Term" v={`${p.min_term_months}–${p.max_term_months} months`} />
            <Fact k="Limit" v={`${Number(p.savings_multiple)}× savings${p.max_amount ? ` · max ${kit.fmt(p.max_amount)}` : ''}`} />
            <Fact k="Fees" v={`${Number(p.processing_fee_pct)}% + ${Number(p.insurance_fee_pct)}%`} />
            <Fact k="Late penalty" v={`${Number(p.penalty_rate_pct)}% a month`} />
            <Fact k="Guarantors" v={p.min_guarantors ? `${p.min_guarantors} needed` : 'Not required'} />
          </div>
        </Tile>
      ))}
      {edit && <ProductForm initial={edit} token={token} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); onChanged(); }} />}
    </div>
  );
}
function Fact({ k, v }) {
  const { THEME } = useKit();
  return <div><div style={{ color: THEME.inkSoft, fontSize: 11 }}>{k}</div><div style={{ fontWeight: 600 }}>{v}</div></div>;
}
function ProductForm({ initial, token, onClose, onSaved }) {
  const kit = useKit();
  const { THEME } = kit;
  const input = useInputStyle();
  const [f, setF] = useState({ ...initial, max_amount: initial.max_amount ?? '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const num = (label, key, props = {}) => (
    <label style={{ display: 'grid', gap: 4, fontSize: 12, color: THEME.inkSoft, fontWeight: 600 }}>{label}
      <input type="number" step="any" value={f[key]} onChange={e => set(key, e.target.value)} style={input} {...props} />
    </label>
  );
  async function save() {
    const n = k => Number(f[k]);
    if (!f.name.trim()) return setErr('Give the product a name.');
    if (!(n('interest_rate') >= 0)) return setErr('Interest cannot be negative.');
    if (!(n('min_term_months') >= 1) || n('max_term_months') < n('min_term_months')) return setErr('Check the term range.');
    if (f.max_amount !== '' && Number(f.max_amount) < n('min_amount')) return setErr('The maximum amount is below the minimum.');
    if (!(n('savings_multiple') > 0)) return setErr('The savings multiple must be above zero.');
    const body = {
      name: f.name.trim(), description: (f.description || '').trim(), interest_rate: n('interest_rate'), interest_method: f.interest_method,
      min_amount: n('min_amount'), max_amount: f.max_amount === '' ? null : Number(f.max_amount),
      min_term_months: n('min_term_months'), max_term_months: n('max_term_months'), savings_multiple: n('savings_multiple'),
      processing_fee_pct: n('processing_fee_pct'), insurance_fee_pct: n('insurance_fee_pct'), penalty_rate_pct: n('penalty_rate_pct'),
      grace_days: Math.round(n('grace_days')), min_guarantors: Math.round(n('min_guarantors')), active: !!f.active,
    };
    setBusy(true); setErr('');
    try {
      if (initial.id) await kit.sb(`/rest/v1/loan_products?id=eq.${initial.id}`, { method: 'PATCH', token, headers: { Prefer: 'return=minimal' }, body });
      else await kit.sb('/rest/v1/loan_products', { method: 'POST', token, headers: { Prefer: 'return=minimal' }, body });
      onSaved();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  return (
    <Sheet title={initial.id ? 'Edit loan product' : 'New loan product'} onClose={onClose} width={560}>
      <div style={{ display: 'grid', gap: 12 }}>
        <label style={{ display: 'grid', gap: 4, fontSize: 12, color: THEME.inkSoft, fontWeight: 600 }}>Name
          <input value={f.name} onChange={e => set('name', e.target.value)} style={input} placeholder="e.g. School fees loan" /></label>
        <label style={{ display: 'grid', gap: 4, fontSize: 12, color: THEME.inkSoft, fontWeight: 600 }}>Short description
          <input value={f.description || ''} onChange={e => set('description', e.target.value)} style={input} /></label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {num('Interest (% a year)', 'interest_rate')}
          <label style={{ display: 'grid', gap: 4, fontSize: 12, color: THEME.inkSoft, fontWeight: 600 }}>Method
            <select value={f.interest_method} onChange={e => set('interest_method', e.target.value)} style={input}>
              <option value="reducing">Reducing balance</option><option value="flat">Flat</option></select></label>
          {num('Minimum amount', 'min_amount')}{num('Maximum amount (blank = none)', 'max_amount')}
          {num('Shortest term (months)', 'min_term_months')}{num('Longest term (months)', 'max_term_months')}
          {num('Borrow up to (× savings)', 'savings_multiple')}{num('Guarantors needed', 'min_guarantors')}
          {num('Processing fee %', 'processing_fee_pct')}{num('Insurance fee %', 'insurance_fee_pct')}
          {num('Late penalty (% a month)', 'penalty_rate_pct')}{num('Grace days', 'grace_days')}
        </div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
          <input type="checkbox" checked={!!f.active} onChange={e => set('active', e.target.checked)} /> Open for new applications
        </label>
        <div style={{ fontSize: 11.5, color: THEME.inkSoft }}>Changes apply to new applications only. Loans already running keep the terms they were given.</div>
        <ErrorNote msg={err} onClose={() => setErr('')} />
        <Pill disabled={busy} onClick={save} style={{ justifyContent: 'center', padding: '13px 18px' }}>{busy ? 'Saving…' : 'Save product'}</Pill>
      </div>
    </Sheet>
  );
}

/* ============================== limits & liquidity ============================== */
function Limits({ settings, token, canEdit, onChanged }) {
  const kit = useKit();
  const { THEME, fmt } = kit;
  const input = useInputStyle();
  const [vals, setVals] = useState(() => Object.fromEntries(settings.map(s => [s.key, String(s.value)])));
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const snap = useLoader(() => rpc(kit, token, 'liquidity_snapshot'), [token, settings.map(s => s.value).join('|')]);
  async function save(key) {
    setBusy(key); setErr(''); setOk('');
    try { await rpc(kit, token, 'set_loan_setting', { p_key: key, p_value: Number(vals[key]) }); setOk('Saved.'); onChanged(); }
    catch (e) { setErr(e.message); } finally { setBusy(''); }
  }
  const s = snap.data;
  const usedPct = s && s.lendable > 0 ? (Number(s.lent) / Number(s.lendable)) * 100 : 0;
  return (
    <div style={{ display: 'grid', gap: 14, maxWidth: 640 }}>
      <Tile tone="sky">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'Fraunces, serif', fontSize: 19 }}><Gauge size={18} /> Liquidity</div>
        {!s ? <div style={{ fontSize: 13, color: THEME.inkSoft, marginTop: 8 }}>{snap.error || 'Loading…'}</div> : (
          <>
            <div style={{ fontSize: 12.5, color: THEME.inkSoft, marginTop: 4 }}>The SACCO keeps {Number(s.reserve_pct)}% of member funds un-lent. Disbursements that would break this are blocked.</div>
            <div style={{ margin: '14px 0 8px' }}><Bar pct={usedPct} color={usedPct > 90 ? THEME.danger : THEME.pine} height={11} /></div>
            <Row label="Member savings and shares" value={fmt(s.funds)} />
            <Row label="Available to lend" value={fmt(s.lendable)} />
            <Row label="Lent out (principal)" value={fmt(s.lent)} />
            <Row label="Room for new loans" value={fmt(s.room)} strong />
          </>
        )}
      </Tile>
      <div style={{ background: THEME.surface, border: `1px solid ${THEME.line}`, borderRadius: 22, padding: 18, display: 'grid', gap: 16 }}>
        <div style={{ fontFamily: 'Fraunces, serif', fontSize: 19 }}>System limits</div>
        {settings.map(st => (
          <div key={st.key} style={{ display: 'grid', gap: 6 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{st.label}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="number" value={vals[st.key] ?? ''} disabled={!canEdit} onChange={e => setVals(v => ({ ...v, [st.key]: e.target.value }))} style={input} />
              {canEdit && <Pill disabled={busy === st.key || String(st.value) === vals[st.key]} onClick={() => save(st.key)}>Save</Pill>}
            </div>
          </div>
        ))}
        {!canEdit && <div style={{ fontSize: 12, color: THEME.inkSoft }}>Only a manager can change these.</div>}
        <ErrorNote msg={err} onClose={() => setErr('')} />
        <OkNote msg={ok} />
      </div>
    </div>
  );
}

/* ============================== the loan file ============================== */
function LoanFile({ loan, loans, products, token, profile, perms, approvalLimit, savings, shares, onBack, onViewMember, onChanged }) {
  const kit = useKit();
  const { THEME, fmt, fmtDate, Spinner, Avatar, Badge, useIsDesktop } = kit;
  const T = tints(THEME);
  const input = useInputStyle();
  const wide = useIsDesktop();
  const id = loan.loan_id;
  const isManager = profile.role === 'manager';
  const product = products.find(p => p.id === loan.product_id);
  const canAct = perms.manageLoans && loan.member_id !== profile.id;
  const canPay = perms.manageLoans || perms.recordCash;

  const D = useLoader(async () => {
    const [schedule, events, collateral, guarantors, payments, locks] = await Promise.all([
      kit.sb(`/rest/v1/loan_schedule?loan_id=eq.${id}&select=*&order=installment_no`, { token }),
      kit.sb(`/rest/v1/loan_events?loan_id=eq.${id}&select=*&order=created_at.desc&limit=80`, { token }),
      kit.sb(`/rest/v1/loan_collateral?loan_id=eq.${id}&select=*&order=created_at`, { token }),
      rpc(kit, token, 'list_loan_guarantors', { p_loan: id }),
      kit.sb(`/rest/v1/loan_repayments?loan_id=eq.${id}&select=*&order=created_at.desc`, { token }),
      kit.sb(`/rest/v1/guarantee_locks?member_id=eq.${loan.member_id}&select=*`, { token }),
    ]);
    return { schedule: schedule || [], events: events || [], collateral: collateral || [], guarantors: guarantors || [], payments: payments || [], locked: Number(((locks || [])[0] || {}).locked_amount || 0) };
  }, [id, token, loan.stage, loan.outstanding_balance]);

  const [mode, setMode] = useState(null); // approve | reject | disburse
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [firstDue, setFirstDue] = useState(() => { const d = new Date(); d.setMonth(d.getMonth() + 1); return d.toISOString().slice(0, 10); });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [payAmt, setPayAmt] = useState('');
  const [payMode, setPayMode] = useState('cash');
  const [payNote, setPayNote] = useState('');
  const [note, setNote] = useState('');
  const [noteVisible, setNoteVisible] = useState(false);
  const [col, setCol] = useState({ kind: 'vehicle', description: '', reference: '', value: '', lat: null, lng: null });
  const [colOpen, setColOpen] = useState(false);
  const [gpsMsg, setGpsMsg] = useState('');

  const d = D.data;
  const rejected = loan.stage === 'rejected';
  const live = loan.stage === 'disbursed';
  const accepted = d ? d.guarantors.filter(g => g.status === 'approved') : [];
  const otherLoans = loans.filter(l => l.member_id === loan.member_id && l.loan_id !== id);
  const exposure = sum(otherLoans.filter(l => l.stage === 'disbursed'), l => l.outstanding_balance);
  const multiple = Number((product || {}).savings_multiple || 3);
  const headroom = headroomOf({ savings, shares, locked: d ? d.locked : 0, exposure }, multiple);

  async function act(fn, success) {
    setBusy(true); setErr(''); setOk('');
    try { await fn(); setOk(success || ''); setMode(null); setAmount(''); setReason(''); D.reload(); onChanged(); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  const stageTo = (s, extra = {}) => act(() => rpc(kit, token, 'set_loan_stage', { p_loan: id, p_stage: s, p_reason: null, p_amount: null, ...extra }));

  const approveAmt = Number(amount || loan.principal);
  const needsManager = approveAmt > approvalLimit && !isManager;

  const checks = d ? riskChecks({ kit, loan, product, savings, shares, locked: d.locked, exposure, history: otherLoans, accepted, collateral: d.collateral, headroom }) : [];
  const overall = checks.some(c => c.level === 'bad') ? 'bad' : checks.some(c => c.level === 'warn') ? 'warn' : 'ok';
  const lvlColor = l => l === 'ok' ? THEME.success : l === 'warn' ? THEME.gold : THEME.danger;

  function gps() {
    if (!navigator.geolocation) return setGpsMsg('This device cannot share its location.');
    setGpsMsg('Finding location…');
    navigator.geolocation.getCurrentPosition(
      p => { setCol(c => ({ ...c, lat: p.coords.latitude, lng: p.coords.longitude })); setGpsMsg(`Location saved (±${Math.round(p.coords.accuracy)} m)`); },
      e => setGpsMsg(e.code === 1 ? 'Location permission was denied.' : 'Could not get the location.'),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  const card = { background: THEME.surface, border: `1px solid ${THEME.line}`, borderRadius: 22, padding: 16, display: 'grid', gap: 2, alignContent: 'start' };
  const title = t => <div style={{ fontFamily: 'Fraunces, serif', fontSize: 17, marginBottom: 6 }}>{t}</div>;

  const left = (
    <div style={{ display: 'grid', gap: 14, alignContent: 'start', minWidth: 0 }}>
      <div style={card}>
        {title('Applicant')}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 6 }}>
          <Avatar name={loan.member_name} size={46} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700 }}>{loan.member_name}</div>
            {loan.member_phone && <a href={`tel:${loan.member_phone}`} style={{ fontSize: 12.5, color: THEME.pine, textDecoration: 'none' }}>{loan.member_phone}</a>}
          </div>
        </div>
        <Row label="Savings" value={fmt(savings)} />
        <Row label="Shares" value={fmt(shares)} />
        <Row label="Pledged as guarantor" value={d ? fmt(d.locked) : '…'} />
        <Row label="Other loans owed" value={fmt(exposure)} />
        <Row label="Borrowing limit left" value={fmt(headroom)} strong />
        <Pill tone="ghost" style={{ marginTop: 8, justifyContent: 'center' }} onClick={() => onViewMember(loan.member_id)}>Full member profile</Pill>
      </div>

      <div style={card}>
        {title('Loan terms')}
        <Row label="Requested" value={fmt(loan.principal)} />
        {loan.approved_amount && <Row label="Approved" value={fmt(loan.approved_amount)} strong />}
        <Row label="Product" value={loan.product_name || '-'} />
        <Row label="Interest" value={`${Number(loan.interest_rate)}% · ${loan.interest_method}`} />
        <Row label="Term" value={`${loan.term_months} months`} />
        {live && <Row label="Fees" value={fmt(Number(loan.processing_fee) + Number(loan.insurance_fee))} />}
        {live && <Row label="First due" value={fmtDate(loan.first_due_date)} />}
        {live && <Row label="Final payment" value={fmtDate(loan.maturity_date)} />}
        <Row label="Applied" value={fmtDate(loan.applied_at)} />
        {loan.officer_name && <Row label="Handled by" value={loan.officer_name} />}
        {loan.purpose && <Row label="Purpose" value={loan.purpose} />}
        {loan.repayment_plan && (
          <div style={{ background: T.butter, borderRadius: 14, padding: 10, fontSize: 12.5, marginTop: 8 }}><b>Repayment plan:</b> {loan.repayment_plan}</div>
        )}
      </div>

      <div style={card}>
        {title('Credit checks')}
        {!d ? <Spinner /> : (
          <>
            <div style={{
              background: lvlColor(overall) + '18', color: lvlColor(overall), borderRadius: 14, padding: '9px 12px', fontWeight: 700, fontSize: 13, marginBottom: 6,
            }}>{overall === 'ok' ? 'Looks sound' : overall === 'warn' ? 'Needs a closer look' : 'Review carefully'}</div>
            {checks.map(c => (
              <div key={c.label} style={{ display: 'flex', gap: 10, padding: '7px 0', borderTop: `1px solid ${THEME.line}`, fontSize: 12.5 }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: lvlColor(c.level), marginTop: 5, flexShrink: 0 }} />
                <div><div style={{ fontWeight: 600 }}>{c.label}</div><div style={{ color: THEME.inkSoft }}>{c.detail}</div></div>
              </div>
            ))}
            <div style={{ fontSize: 11, color: THEME.inkSoft, marginTop: 6 }}>Rule-based checks from the SACCO's own records. This is a guide, not a credit score.</div>
          </>
        )}
      </div>

      <div style={card}>
        {title('Guarantors')}
        {!d ? <Spinner /> : d.guarantors.length === 0 ? (
          <div style={{ fontSize: 13, color: THEME.inkSoft }}>{product && product.min_guarantors ? `${product.min_guarantors} required. None asked yet.` : 'None.'}</div>
        ) : d.guarantors.map(g => (
          <div key={g.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '8px 0', borderTop: `1px solid ${THEME.line}`, fontSize: 13 }}>
            <div><div style={{ fontWeight: 600 }}>{g.guarantor_name}</div><div style={{ fontSize: 11.5, color: THEME.inkSoft }}>{fmt(g.amount)}</div></div>
            <Badge color={g.status === 'approved' ? THEME.success : g.status === 'declined' ? THEME.danger : g.status === 'released' ? THEME.inkSoft : THEME.gold}>{g.status === 'approved' ? 'accepted' : g.status}</Badge>
          </div>
        ))}
      </div>

      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {title('Collateral')}
          {canAct && !rejected && <Pill tone="ghost" onClick={() => setColOpen(v => !v)}><Plus size={13} /> Add</Pill>}
        </div>
        {!d ? <Spinner /> : d.collateral.length === 0 && !colOpen ? <div style={{ fontSize: 13, color: THEME.inkSoft }}>Nothing recorded.</div> : null}
        {d && d.collateral.map(c => (
          <div key={c.id} style={{ padding: '8px 0', borderTop: `1px solid ${THEME.line}`, fontSize: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <b style={{ textTransform: 'capitalize' }}>{c.kind.replace('_', ' ')}</b><span>{fmt(c.estimated_value)}</span>
            </div>
            <div style={{ color: THEME.inkSoft, fontSize: 12 }}>{c.description}{c.reference ? ` · ${c.reference}` : ''}</div>
            {c.latitude != null && (
              <a href={`https://www.google.com/maps?q=${c.latitude},${c.longitude}`} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: THEME.pine, display: 'inline-flex', gap: 4, alignItems: 'center', marginTop: 2 }}>
                <MapPin size={12} /> View on map
              </a>
            )}
            {canAct && <button onClick={() => act(() => rpc(kit, token, 'remove_collateral', { p_id: c.id }))} aria-label="Remove collateral" style={{ float: 'right', background: 'none', border: 'none', color: THEME.danger, cursor: 'pointer', minHeight: 0, padding: 0 }}><X size={14} /></button>}
          </div>
        ))}
        {colOpen && canAct && (
          <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
            <select value={col.kind} onChange={e => setCol({ ...col, kind: e.target.value })} style={input}>
              {['vehicle', 'land', 'building', 'equipment', 'livestock', 'salary_assignment', 'other'].map(k => <option key={k} value={k}>{k.replace('_', ' ')}</option>)}
            </select>
            <input placeholder="Describe the asset" value={col.description} onChange={e => setCol({ ...col, description: e.target.value })} style={input} />
            <input placeholder="Logbook, title or serial number" value={col.reference} onChange={e => setCol({ ...col, reference: e.target.value })} style={input} />
            <input type="number" placeholder="Estimated value (UGX)" value={col.value} onChange={e => setCol({ ...col, value: e.target.value })} style={input} />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <Pill tone="ghost" onClick={gps}><MapPin size={13} /> Stamp my location</Pill><span style={{ fontSize: 12, color: THEME.inkSoft }}>{gpsMsg}</span>
            </div>
            <Pill disabled={busy || !col.description.trim()} onClick={() => act(async () => {
              await rpc(kit, token, 'add_collateral', { p_loan: id, p_kind: col.kind, p_description: col.description, p_reference: col.reference || null, p_value: Number(col.value || 0), p_lat: col.lat, p_lng: col.lng });
              setCol({ kind: 'vehicle', description: '', reference: '', value: '', lat: null, lng: null }); setColOpen(false); setGpsMsg('');
            }, 'Collateral recorded.')} style={{ justifyContent: 'center' }}>Save collateral</Pill>
          </div>
        )}
      </div>
    </div>
  );

  const right = (
    <div style={{ display: 'grid', gap: 14, alignContent: 'start', minWidth: 0 }}>
      <ErrorNote msg={err} onClose={() => setErr('')} />
      <OkNote msg={ok} />

      {!rejected && loan.stage !== 'closed' && (
        <div style={card}>
          {title('What happens next')}
          {!canAct && <div style={{ fontSize: 13, color: THEME.inkSoft }}>{loan.member_id === profile.id ? 'You cannot process your own loan.' : 'You can view this loan. Only a loans officer or manager can act on it.'}</div>}

          {canAct && loan.stage === 'application' && <ActionRow><Pill disabled={busy} onClick={() => stageTo('appraisal')}><Check size={14} /> Start appraisal</Pill></ActionRow>}
          {canAct && loan.stage === 'appraisal' && <ActionRow><Pill disabled={busy} onClick={() => stageTo('committee')}>Send to committee</Pill><Pill tone="sun" disabled={busy} onClick={() => { setMode('approve'); setAmount(String(loan.principal)); }}>Approve…</Pill></ActionRow>}
          {canAct && loan.stage === 'committee' && <ActionRow><Pill tone="sun" disabled={busy} onClick={() => { setMode('approve'); setAmount(String(loan.principal)); }}>Approve…</Pill></ActionRow>}
          {canAct && loan.stage === 'approved' && <ActionRow><Pill tone="sun" disabled={busy} onClick={() => setMode('disburse')}><Wallet size={14} /> Disburse…</Pill></ActionRow>}
          {canAct && OPEN_STAGES.includes(loan.stage) && <ActionRow><Pill tone="ghost" disabled={busy} onClick={() => setMode('reject')} style={{ color: THEME.danger }}>Reject…</Pill></ActionRow>}

          {mode === 'approve' && (
            <FormBox>
              <label style={lbl(THEME)}>Amount to approve (UGX)
                <input type="number" value={amount} onChange={e => setAmount(e.target.value)} style={input} /></label>
              {needsManager && <ErrorNote msg={`Above ${fmt(approvalLimit)}. A manager has to approve this. Send it to committee or ask a manager.`} />}
              <div style={{ display: 'flex', gap: 8 }}>
                <Pill disabled={busy || needsManager || !(approveAmt > 0)} onClick={() => stageTo('approved', { p_amount: approveAmt })}>Confirm approval</Pill>
                <Pill tone="ghost" onClick={() => setMode(null)}>Cancel</Pill>
              </div>
            </FormBox>
          )}
          {mode === 'reject' && (
            <FormBox>
              <label style={lbl(THEME)}>Reason (the member sees this)
                <textarea rows={3} value={reason} onChange={e => setReason(e.target.value)} style={{ ...input, resize: 'vertical' }} /></label>
              <div style={{ display: 'flex', gap: 8 }}>
                <Pill disabled={busy || !reason.trim()} onClick={() => stageTo('rejected', { p_reason: reason.trim() })} style={{ background: THEME.danger, color: '#fff' }}>Reject application</Pill>
                <Pill tone="ghost" onClick={() => setMode(null)}>Cancel</Pill>
              </div>
            </FormBox>
          )}
          {mode === 'disburse' && (() => {
            const amt = Number(loan.approved_amount || loan.principal);
            const q = quote({ amount: amt, months: loan.term_months, ratePct: loan.interest_rate, method: loan.interest_method, processingPct: product ? product.processing_fee_pct : 0, insurancePct: product ? product.insurance_fee_pct : 0 });
            return (
              <FormBox>
                <label style={lbl(THEME)}>First installment due
                  <input type="date" value={firstDue} min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)} onChange={e => setFirstDue(e.target.value)} style={input} /></label>
                <Row label="Amount paid out" value={fmt(amt)} />
                <Row label={`${loan.term_months} installments of about`} value={fmt(q.first)} />
                <Row label="Total interest" value={fmt(q.interest)} />
                {q.fees > 0 && <Row label="Fees charged" value={fmt(q.fees)} />}
                <Row label="Total to be repaid" value={fmt(q.total)} strong />
                <div style={{ display: 'flex', gap: 8 }}>
                  <Pill disabled={busy || !firstDue} onClick={() => act(() => rpc(kit, token, 'disburse_loan', { p_loan: id, p_first_due: firstDue }), 'Loan disbursed and schedule created.')}>Confirm disbursement</Pill>
                  <Pill tone="ghost" onClick={() => setMode(null)}>Cancel</Pill>
                </div>
              </FormBox>
            );
          })()}

          {d && <Steps steps={nextSteps({ loan, product, savings, accepted, collateral: d.collateral, events: d.events })} />}
        </div>
      )}

      {live && canPay && (
        <div style={card}>
          {title('Record a payment')}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            {Number(loan.next_due_amount) > 0 && <Pill tone="ghost" onClick={() => setPayAmt(String(Math.round(loan.next_due_amount)))}>Next installment {fmt(loan.next_due_amount)}</Pill>}
            {Number(loan.overdue_amount) > 0 && <Pill tone="ghost" onClick={() => setPayAmt(String(Math.round(loan.overdue_amount)))}>Clear overdue {fmt(loan.overdue_amount)}</Pill>}
            <Pill tone="ghost" onClick={() => setPayAmt(String(Math.round(loan.outstanding_balance)))}>Pay in full {fmt(loan.outstanding_balance)}</Pill>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <input type="number" placeholder="Amount (UGX)" value={payAmt} onChange={e => setPayAmt(e.target.value)} style={input} />
            <select value={payMode} onChange={e => setPayMode(e.target.value)} style={input}>{MODES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          </div>
          <input placeholder="Note (optional), e.g. receipt number" value={payNote} onChange={e => setPayNote(e.target.value)} style={{ ...input, marginTop: 8 }} />
          <div style={{ fontSize: 11.5, color: THEME.inkSoft, margin: '6px 0' }}>Penalties are cleared first, then interest, then principal, oldest installment first.</div>
          <Pill disabled={busy || !(Number(payAmt) > 0)} onClick={() => act(async () => {
            const r = await rpc(kit, token, 'record_loan_payment', { p_loan: id, p_amount: Number(payAmt), p_mode: payMode, p_note: payNote || null });
            setPayAmt(''); setPayNote('');
            if (r && r.closed) setOk('Payment recorded. The loan is now fully repaid.');
          }, 'Payment recorded.')} style={{ justifyContent: 'center' }}>Record payment</Pill>
        </div>
      )}

      {d && d.schedule.length > 0 && (
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {title('Repayment schedule')}
            <Pill tone="ghost" onClick={() => downloadLoanStatement({ loan, schedule: d.schedule, payments: d.payments, memberName: loan.member_name })}><FileText size={13} /> Statement</Pill>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 520 }}>
              <thead><tr style={{ textAlign: 'left', color: THEME.inkSoft }}>
                {['#', 'Due', 'Principal', 'Interest', 'Penalty', 'Paid', ''].map(h => <th key={h} style={{ padding: '6px 6px', fontWeight: 600 }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {d.schedule.map(s => (
                  <tr key={s.id} style={{ borderTop: `1px solid ${THEME.line}` }}>
                    <td style={{ padding: '8px 6px' }}>{s.installment_no}</td>
                    <td style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>{fmtDate(s.due_date)}</td>
                    <td style={{ padding: '8px 6px' }}>{fmt(s.principal_due).slice(4)}</td>
                    <td style={{ padding: '8px 6px' }}>{fmt(s.interest_due).slice(4)}</td>
                    <td style={{ padding: '8px 6px', color: Number(s.penalty_due) > 0 ? THEME.danger : THEME.inkSoft }}>{fmt(s.penalty_due).slice(4)}</td>
                    <td style={{ padding: '8px 6px' }}>{fmt(Number(s.principal_paid) + Number(s.interest_paid) + Number(s.penalty_paid)).slice(4)}</td>
                    <td style={{ padding: '8px 6px' }}><Badge color={s.status === 'paid' ? THEME.success : s.status === 'overdue' ? THEME.danger : s.status === 'partial' ? THEME.gold : THEME.inkSoft}>{s.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={card}>
        {title('Notes and activity')}
        {perms.manageLoans && (
          <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
            <textarea rows={2} placeholder="Add a note: visit findings, phone call, decision reasons…" value={note} onChange={e => setNote(e.target.value)} style={{ ...input, resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <Pill disabled={busy || !note.trim()} onClick={() => act(async () => { await rpc(kit, token, 'add_loan_note', { p_loan: id, p_text: note, p_member_visible: noteVisible }); setNote(''); }, 'Note added.')}>Add note</Pill>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5, color: THEME.inkSoft }}>
                <input type="checkbox" checked={noteVisible} onChange={e => setNoteVisible(e.target.checked)} /> Show to the member
              </label>
            </div>
          </div>
        )}
        {!d ? <Spinner /> : <Timeline events={d.events} />}
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button onClick={onBack} aria-label="Back to loans" style={{
          width: 40, height: 40, borderRadius: '50%', border: `1px solid ${THEME.line}`, background: THEME.surface, color: THEME.ink,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0,
        }}><ArrowLeft size={17} /></button>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontFamily: 'Fraunces, serif', fontSize: 24, lineHeight: 1.1 }}>{loan.member_name}</div>
          <div style={{ fontSize: 12.5, color: THEME.inkSoft, marginTop: 2 }}>
            {fmt(loan.approved_amount || loan.principal)} · {loan.product_name || 'Loan'} · Ref {kit.shortId(id)}
          </div>
        </div>
        <Badge color={rejected ? THEME.danger : live ? THEME.success : THEME.gold}>{STAGE_LABEL[loan.stage]}</Badge>
      </div>
      <Tile tone={stageTone(loan.stage)} pad={14}>
        <StageTrack stage={loan.stage} rejected={rejected} />
        {rejected && loan.rejection_reason && <div style={{ marginTop: 10, fontSize: 13, color: THEME.danger, fontWeight: 600 }}>Reason: {loan.rejection_reason}</div>}
        {live && loan.days_in_arrears > 0 && <div style={{ marginTop: 10, fontSize: 13, color: THEME.danger, fontWeight: 700 }}>{loan.days_in_arrears} days overdue · {fmt(loan.overdue_amount)} to clear</div>}
      </Tile>
      {D.error && !d && <ErrorNote msg={D.error} />}
      <div style={{ display: 'grid', gridTemplateColumns: wide ? '340px minmax(0, 1fr)' : '1fr', gap: 16, alignItems: 'start' }}>
        {wide ? <>{left}{right}</> : <>{right}{left}</>}
      </div>
    </div>
  );
}
const lbl = THEME => ({ display: 'grid', gap: 5, fontSize: 12.5, color: THEME.inkSoft, fontWeight: 600 });
function ActionRow({ children }) { return <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>{children}</div>; }
function FormBox({ children }) {
  const { THEME } = useKit();
  return <div className="ln-fade" style={{ display: 'grid', gap: 10, background: THEME.paper, borderRadius: 18, padding: 14, margin: '4px 0 10px' }}>{children}</div>;
}
function Steps({ steps }) {
  const { THEME } = useKit();
  if (!steps.length) return null;
  return (
    <div style={{ marginTop: 6 }}>
      <Eyebrow style={{ marginBottom: 6 }}>Checklist</Eyebrow>
      {steps.map(s => (
        <div key={s.label} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '6px 0', fontSize: 13 }}>
          <span style={{
            width: 20, height: 20, borderRadius: '50%', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            background: s.done ? THEME.success : 'transparent', border: s.done ? 'none' : `2px solid ${THEME.line}`, color: '#fff',
          }}>{s.done && <Check size={12} />}</span>
          <span style={{ color: s.done ? THEME.inkSoft : THEME.ink, textDecoration: s.done ? 'line-through' : 'none' }}>{s.label}</span>
        </div>
      ))}
    </div>
  );
}

function nextSteps({ loan, product, savings, accepted, collateral, events }) {
  const steps = [{ label: 'Applicant has savings on record', done: savings > 0 }];
  const need = product ? Number(product.min_guarantors) : 0;
  if (need > 0) steps.push({ label: `Guarantors accepted (${accepted.length} of ${need})`, done: accepted.length >= need });
  steps.push({ label: 'Collateral recorded (if any)', done: collateral.length > 0 });
  steps.push({ label: 'Appraisal note added', done: events.some(e => e.kind === 'note') });
  steps.push({ label: 'Approved', done: ['approved', 'disbursed', 'closed'].includes(loan.stage) });
  return steps;
}

function riskChecks({ kit, loan, product, savings, shares, locked, exposure, history, accepted, collateral, headroom }) {
  const { fmt } = kit;
  const req = Number(loan.principal);
  const out = [];
  out.push({ label: 'Borrowing limit', detail: `Limit left ${fmt(headroom)} for a request of ${fmt(req)}`, level: req <= headroom ? 'ok' : req <= headroom * 1.5 ? 'warn' : 'bad' });
  const cover = (savings + shares) / (req || 1);
  out.push({ label: 'Savings cover', detail: `Savings and shares are ${(cover * 100).toFixed(0)}% of the amount`, level: cover >= 0.33 ? 'ok' : cover >= 0.2 ? 'warn' : 'bad' });
  const bad = history.filter(l => l.stage === 'disbursed' && l.days_in_arrears > 0 || l.status === 'defaulted');
  const repaid = history.filter(l => l.stage === 'closed').length;
  out.push({
    label: 'Repayment record',
    detail: bad.length ? `${bad.length} loan(s) behind on payments` : repaid ? `${repaid} loan(s) repaid in full` : 'First loan with the SACCO',
    level: bad.length ? 'bad' : repaid ? 'ok' : 'warn',
  });
  const need = product ? Number(product.min_guarantors) : 0;
  const cov = sum(accepted, g => g.amount);
  if (need > 0 || accepted.length > 0) {
    out.push({ label: 'Guarantors', detail: `${accepted.length} accepted covering ${fmt(cov)}${need ? ` (${need} required)` : ''}`, level: accepted.length >= need && (need === 0 || cov >= req * 0.5) ? 'ok' : accepted.length > 0 ? 'warn' : 'bad' });
  }
  const cv = sum(collateral, c => c.estimated_value);
  out.push({ label: 'Collateral', detail: collateral.length ? `${fmt(cv)} recorded (${((cv / (req || 1)) * 100).toFixed(0)}% of the loan)` : 'None recorded', level: cv >= req ? 'ok' : collateral.length ? 'warn' : req > headroom ? 'warn' : 'ok' });
  if (loan.repayment_plan) out.push({ label: 'Special request', detail: 'More than twice the member’s savings. Read the repayment plan.', level: 'warn' });
  if (exposure > 0) out.push({ label: 'Existing debt', detail: `${fmt(exposure)} still owed on other loans`, level: exposure > savings + shares ? 'warn' : 'ok' });
  return out;
}
