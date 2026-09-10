import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Home, Landmark, Wallet, Users, LogOut, Plus, Check, X, ArrowUpRight,
  ArrowDownRight, Loader2, ShieldCheck, PieChart as PieIcon, Gift
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://tupofpitveaifaemassc.supabase.co';
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable__jw3Hv0tG2wDnjvJ_8o8Qg_3RwRzn9F';

const THEME = {
  pine: '#0F3D3A',
  pineDark: '#0A2B29',
  gold: '#C08A2E',
  goldLight: '#E4B75E',
  paper: '#FAF7F0',
  surface: '#FFFFFF',
  ink: '#16241F',
  inkSoft: '#5B6B62',
  line: '#E4E0D4',
  success: '#2F7A4D',
  danger: '#B4453D',
};

const LOAN_MULTIPLIER = 3; // ceiling = (savings + shares) x multiplier, per SACCO credit policy

function fmt(n) {
  const num = Number(n || 0);
  return 'UGX ' + num.toLocaleString('en-US', { maximumFractionDigits: 0 });
}
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function statusColor(status) {
  const map = {
    active: THEME.success, approved: THEME.success, completed: THEME.success,
    pending: THEME.gold, suspended: THEME.danger, rejected: THEME.danger, defaulted: THEME.danger,
  };
  return map[status] || THEME.inkSoft;
}

async function sb(path, { method = 'GET', body, token, headers = {} } = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${token || ANON_KEY}`,
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg = (data && (data.msg || data.message || data.error_description)) || 'Request failed. Check schema is installed.';
    throw new Error(msg);
  }
  return data;
}

/* ---------------------------- shared bits ---------------------------- */

function Field({ label, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: THEME.inkSoft, fontWeight: 500 }}>
      {label}
      {children}
    </label>
  );
}
const inputStyle = {
  border: `1px solid ${THEME.line}`, borderRadius: 8, padding: '10px 12px', fontSize: 14,
  outline: 'none', color: THEME.ink, fontFamily: 'Inter, sans-serif', background: '#fff',
};
function Badge({ children, color }) {
  return (
    <span style={{
      display: 'inline-block', fontSize: 11, fontWeight: 700, letterSpacing: 0.3,
      color: color, background: color + '1a', borderRadius: 999, padding: '3px 10px',
      textTransform: 'capitalize',
    }}>{children}</span>
  );
}
function PrimaryButton({ children, onClick, disabled, type = 'button', style = {} }) {
  return (
    <button type={type} onClick={onClick} disabled={disabled} style={{
      background: THEME.pine, color: '#fff', border: 'none', borderRadius: 10,
      padding: '10px 16px', fontWeight: 600, fontSize: 14, cursor: disabled ? 'default' : 'pointer',
      opacity: disabled ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      ...style,
    }}>{children}</button>
  );
}
function GhostButton({ children, onClick, style = {} }) {
  return (
    <button onClick={onClick} style={{
      background: 'transparent', color: THEME.pine, border: `1px solid ${THEME.pine}`, borderRadius: 10,
      padding: '9px 14px', fontWeight: 600, fontSize: 13, cursor: 'pointer', ...style,
    }}>{children}</button>
  );
}
function Card({ children, style = {} }) {
  return (
    <div style={{ background: THEME.surface, border: `1px solid ${THEME.line}`, borderRadius: 14, padding: 16, ...style }}>
      {children}
    </div>
  );
}
function StatCard({ label, value, accent }) {
  return (
    <Card style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 12, color: THEME.inkSoft, fontWeight: 600 }}>{label}</div>
      <div style={{ fontFamily: 'Fraunces, serif', fontSize: 22, color: accent || THEME.ink, marginTop: 6, whiteSpace: 'nowrap' }}>{value}</div>
    </Card>
  );
}
function EmptyState({ text }) {
  return <div style={{ textAlign: 'center', color: THEME.inkSoft, fontSize: 13, padding: '28px 0' }}>{text}</div>;
}
function Spinner() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
      <Loader2 className="spin" size={22} color={THEME.pine} />
    </div>
  );
}
function Header({ title, subtitle, onLogout, roleBadge }) {
  return (
    <div style={{ padding: '20px 20px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: 22, color: THEME.ink, margin: 0 }}>{title}</h1>
          {roleBadge}
        </div>
        <p style={{ color: THEME.inkSoft, fontSize: 13, margin: '4px 0 0' }}>{subtitle}</p>
      </div>
      <button onClick={onLogout} title="Sign out" style={{
        background: THEME.surface, border: `1px solid ${THEME.line}`, borderRadius: 10, padding: 9, cursor: 'pointer',
      }}><LogOut size={16} color={THEME.inkSoft} /></button>
    </div>
  );
}
function BottomNav({ tabs, active, onChange }) {
  return (
    <div style={{
      position: 'sticky', bottom: 0, background: THEME.surface, borderTop: `1px solid ${THEME.line}`,
      display: 'flex', padding: '8px 8px calc(8px + env(safe-area-inset-bottom))',
    }}>
      {tabs.map(t => (
        <button key={t.key} onClick={() => onChange(t.key)} style={{
          flex: 1, background: 'none', border: 'none', cursor: 'pointer', display: 'flex',
          flexDirection: 'column', alignItems: 'center', gap: 3, padding: '6px 0',
          color: active === t.key ? THEME.pine : THEME.inkSoft,
        }}>
          <t.icon size={19} />
          <span style={{ fontSize: 11, fontWeight: 600 }}>{t.label}</span>
        </button>
      ))}
    </div>
  );
}

/* ------------------------------ auth screen ------------------------------ */

function AuthScreen({ onAuthed }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  async function finishLogin(token, user) {
    const rows = await sb(`/rest/v1/profiles?id=eq.${user.id}&select=*`, { token });
    const profile = rows && rows[0];
    if (!profile) throw new Error('Signed in, but no profile row exists yet — make sure the schema (with the signup trigger) is installed.');
    onAuthed({ access_token: token, user }, profile);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(''); setNotice(''); setLoading(true);
    try {
      if (mode === 'signup') {
        const data = await sb('/auth/v1/signup', { method: 'POST', body: { email, password, data: { full_name: fullName, phone } } });
        if (data.access_token) {
          await finishLogin(data.access_token, data.user);
        } else {
          setNotice('Account created. If email confirmation is on, check your inbox — then sign in.');
          setMode('login');
        }
      } else {
        const data = await sb('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } });
        await finishLogin(data.access_token, data.user);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ textAlign: 'center', marginBottom: 26 }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: THEME.pine, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
            <ShieldCheck size={26} color={THEME.goldLight} />
          </div>
          <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: 26, color: THEME.ink, margin: 0 }}>Amani SACCO</h1>
          <p style={{ color: THEME.inkSoft, fontSize: 14, marginTop: 6 }}>Savings, loans and shares — in one place</p>
        </div>

        <Card style={{ padding: 24 }}>
          <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: THEME.paper, padding: 4, borderRadius: 10 }}>
            {['login', 'signup'].map(m => (
              <button key={m} onClick={() => { setMode(m); setError(''); setNotice(''); }} style={{
                flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: mode === m ? THEME.pine : 'transparent',
                color: mode === m ? '#fff' : THEME.inkSoft, fontWeight: 600, fontSize: 14,
              }}>{m === 'login' ? 'Sign in' : 'Join'}</button>
            ))}
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {mode === 'signup' && (
              <>
                <Field label="Full name"><input required value={fullName} onChange={e => setFullName(e.target.value)} style={inputStyle} /></Field>
                <Field label="Phone number"><input required value={phone} onChange={e => setPhone(e.target.value)} placeholder="07XXXXXXXX" style={inputStyle} /></Field>
              </>
            )}
            <Field label="Email"><input required type="email" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} /></Field>
            <Field label="Password"><input required type="password" minLength={6} value={password} onChange={e => setPassword(e.target.value)} style={inputStyle} /></Field>

            {error && <div style={{ color: THEME.danger, fontSize: 13 }}>{error}</div>}
            {notice && <div style={{ color: THEME.success, fontSize: 13 }}>{notice}</div>}

            <PrimaryButton type="submit" disabled={loading} style={{ marginTop: 6, padding: '12px 0', fontSize: 15 }}>
              {loading && <Loader2 size={16} className="spin" />}
              {mode === 'login' ? 'Sign in' : 'Create account'}
            </PrimaryButton>
          </form>
        </Card>
        <p style={{ textAlign: 'center', color: THEME.inkSoft, fontSize: 12, marginTop: 16 }}>
          Demo session — reloading the page signs you out. Deploy this outside the artifact sandbox for a persistent login.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------ member app ------------------------------ */

function MemberApp({ profile, token, onLogout }) {
  const [tab, setTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [savings, setSavings] = useState({ balance: 0 });
  const [shares, setShares] = useState({ balance: 0 });
  const [loans, setLoans] = useState([]);
  const [txns, setTxns] = useState([]);
  const [divAlloc, setDivAlloc] = useState([]);
  const [divMap, setDivMap] = useState({});
  const [showLoanForm, setShowLoanForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [sa, sh, ln, tx, da, dv] = await Promise.all([
      sb(`/rest/v1/savings_accounts?member_id=eq.${profile.id}&select=*`, { token }),
      sb(`/rest/v1/shares?member_id=eq.${profile.id}&select=*`, { token }),
      sb(`/rest/v1/loans?member_id=eq.${profile.id}&select=*&order=applied_at.desc`, { token }),
      sb(`/rest/v1/transactions?member_id=eq.${profile.id}&select=*&order=created_at.desc&limit=30`, { token }),
      sb(`/rest/v1/dividend_allocations?member_id=eq.${profile.id}&select=*`, { token }),
      sb(`/rest/v1/dividends?select=*`, { token }),
    ]);
    setSavings(sa[0] || { balance: 0 });
    setShares(sh[0] || { balance: 0 });
    setLoans(ln || []);
    setTxns(tx || []);
    setDivAlloc(da || []);
    const m = {}; (dv || []).forEach(d => { m[d.id] = d.year; });
    setDivMap(m);
    setLoading(false);
  }, [profile.id, token]);

  useEffect(() => { load(); }, [load]);

  const activeLoan = loans.find(l => l.status === 'active');

  async function applyForLoan(principal, term_months, purpose, overCeiling) {
    await sb('/rest/v1/loans', {
      method: 'POST', token,
      body: {
        member_id: profile.id, principal: Number(principal), term_months: Number(term_months),
        purpose, status: 'pending', flagged_over_ceiling: !!overCeiling,
      },
      headers: { Prefer: 'return=minimal' },
    });
    setShowLoanForm(false);
    await load();
  }

  const tabs = [
    { key: 'overview', label: 'Home', icon: Home },
    { key: 'loans', label: 'Loans', icon: Landmark },
    { key: 'activity', label: 'Activity', icon: Wallet },
  ];

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', minHeight: '100vh', background: THEME.paper, display: 'flex', flexDirection: 'column' }}>
      <Header title={profile.full_name} subtitle="Member" onLogout={onLogout}
        roleBadge={<Badge color={THEME.pine}>member</Badge>} />

      <div style={{ flex: 1, padding: '0 20px 20px', overflowY: 'auto' }}>
        {loading ? <Spinner /> : (
          <>
            {tab === 'overview' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', gap: 10 }}>
                  <StatCard label="Savings balance" value={fmt(savings.balance)} accent={THEME.pine} />
                  <StatCard label="Share balance" value={fmt(shares.balance)} accent={THEME.gold} />
                </div>
                {activeLoan && (
                  <Card>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>Active loan</span>
                      <Badge color={statusColor(activeLoan.status)}>{activeLoan.status}</Badge>
                    </div>
                    <div style={{ fontFamily: 'Fraunces, serif', fontSize: 20, color: THEME.ink }}>{fmt(activeLoan.outstanding_balance)}</div>
                    <div style={{ fontSize: 12, color: THEME.inkSoft, marginTop: 2 }}>outstanding of {fmt(activeLoan.principal)} principal</div>
                  </Card>
                )}
                <Card>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Recent activity</div>
                  {txns.length === 0 ? <EmptyState text="No transactions yet." /> : txns.slice(0, 6).map(t => (
                    <TxnRow key={t.id} t={t} />
                  ))}
                </Card>
              </div>
            )}

            {tab === 'loans' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <PrimaryButton onClick={() => setShowLoanForm(v => !v)}>
                  <Plus size={15} /> Apply for a loan
                </PrimaryButton>
                {showLoanForm && (
                  <LoanApplyForm
                    onSubmit={applyForLoan}
                    onCancel={() => setShowLoanForm(false)}
                    maxCeiling={(Number(savings.balance) + Number(shares.balance)) * LOAN_MULTIPLIER}
                  />
                )}
                {loans.length === 0 ? <EmptyState text="No loan applications yet." /> : loans.map(l => (
                  <Card key={l.id}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontFamily: 'Fraunces, serif', fontSize: 18 }}>{fmt(l.principal)}</span>
                      <Badge color={statusColor(l.status)}>{l.status}</Badge>
                    </div>
                    <div style={{ fontSize: 12, color: THEME.inkSoft, marginTop: 6 }}>
                      {l.term_months} months · applied {fmtDate(l.applied_at)}
                      {l.purpose ? ` · ${l.purpose}` : ''}
                    </div>
                    {(l.status === 'active' || l.status === 'completed') && (
                      <div style={{ fontSize: 12, color: THEME.inkSoft, marginTop: 4 }}>
                        Outstanding: <b style={{ color: THEME.ink }}>{fmt(l.outstanding_balance)}</b>
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            )}

            {tab === 'activity' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <Card>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Transactions</div>
                  {txns.length === 0 ? <EmptyState text="No transactions yet." /> : txns.map(t => <TxnRow key={t.id} t={t} />)}
                </Card>
                <Card>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Gift size={15} color={THEME.gold} /> Dividends
                  </div>
                  {divAlloc.length === 0 ? <EmptyState text="No dividends declared for you yet." /> : divAlloc.map(d => (
                    <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${THEME.line}`, fontSize: 13 }}>
                      <span>Dividend {divMap[d.dividend_id] || ''}</span>
                      <b>{fmt(d.amount)}</b>
                    </div>
                  ))}
                </Card>
              </div>
            )}
          </>
        )}
      </div>

      <BottomNav tabs={tabs} active={tab} onChange={setTab} />
    </div>
  );
}

function TxnRow({ t }) {
  const isCredit = ['deposit', 'loan_disbursement', 'dividend', 'share_purchase'].includes(t.type);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: `1px solid ${THEME.line}` }}>
      <div style={{
        width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: (isCredit ? THEME.success : THEME.danger) + '1a',
      }}>
        {isCredit ? <ArrowDownRight size={15} color={THEME.success} /> : <ArrowUpRight size={15} color={THEME.danger} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, textTransform: 'capitalize' }}>{t.type.replace('_', ' ')}</div>
        <div style={{ fontSize: 11, color: THEME.inkSoft }}>{fmtDate(t.created_at)}{t.notes ? ` · ${t.notes}` : ''}</div>
      </div>
      <div style={{ fontWeight: 700, fontSize: 13, color: isCredit ? THEME.success : THEME.danger, whiteSpace: 'nowrap' }}>
        {isCredit ? '+' : '−'}{fmt(t.amount)}
      </div>
    </div>
  );
}

function LoanApplyForm({ onSubmit, onCancel, maxCeiling = 0 }) {
  const [principal, setPrincipal] = useState('');
  const [term, setTerm] = useState('12');
  const [purpose, setPurpose] = useState('');
  const [busy, setBusy] = useState(false);
  const overCeiling = Number(principal) > maxCeiling && maxCeiling > 0;
  return (
    <Card>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 12, color: THEME.inkSoft, background: THEME.paper, borderRadius: 8, padding: '8px 10px' }}>
          Based on your savings + shares, your automated ceiling is <b style={{ color: THEME.ink }}>{fmt(maxCeiling)}</b> ({LOAN_MULTIPLIER}x rule).
        </div>
        <Field label="Amount requested (UGX)"><input type="number" min="1" required value={principal} onChange={e => setPrincipal(e.target.value)} style={inputStyle} /></Field>
        {overCeiling && (
          <div style={{ fontSize: 12, color: THEME.danger }}>
            This exceeds your automated ceiling. You can still submit — it will be flagged for manual review.
          </div>
        )}
        <Field label="Term (months)"><input type="number" min="1" required value={term} onChange={e => setTerm(e.target.value)} style={inputStyle} /></Field>
        <Field label="Purpose"><input value={purpose} onChange={e => setPurpose(e.target.value)} style={inputStyle} placeholder="e.g. School fees" /></Field>
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <PrimaryButton style={{ flex: 1 }} disabled={busy} onClick={async () => {
            if (!principal) return;
            setBusy(true);
            try { await onSubmit(principal, term, purpose, overCeiling); } finally { setBusy(false); }
          }}>{busy ? <Loader2 size={15} className="spin" /> : 'Submit application'}</PrimaryButton>
          <GhostButton onClick={onCancel}>Cancel</GhostButton>
        </div>
      </div>
    </Card>
  );
}

/* ------------------------------- admin app ------------------------------- */

function AdminApp({ profile, token, onLogout }) {
  const [tab, setTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState([]);
  const [savingsAll, setSavingsAll] = useState([]);
  const [sharesAll, setSharesAll] = useState([]);
  const [loansAll, setLoansAll] = useState([]);
  const [txnsAll, setTxnsAll] = useState([]);
  const [dividendsAll, setDividendsAll] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    const [pf, sa, sh, ln, tx, dv] = await Promise.all([
      sb('/rest/v1/profiles?select=*&order=created_at.desc', { token }),
      sb('/rest/v1/savings_accounts?select=*', { token }),
      sb('/rest/v1/shares?select=*', { token }),
      sb('/rest/v1/loans?select=*&order=applied_at.desc', { token }),
      sb('/rest/v1/transactions?select=*&order=created_at.desc&limit=60', { token }),
      sb('/rest/v1/dividends?select=*&order=year.desc', { token }),
    ]);
    setProfiles(pf || []); setSavingsAll(sa || []); setSharesAll(sh || []);
    setLoansAll(ln || []); setTxnsAll(tx || []); setDividendsAll(dv || []);
    setLoading(false);
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const profileMap = useMemo(() => { const m = {}; profiles.forEach(p => { m[p.id] = p; }); return m; }, [profiles]);
  const savingsMap = useMemo(() => { const m = {}; savingsAll.forEach(s => { m[s.member_id] = s; }); return m; }, [savingsAll]);
  const sharesMap = useMemo(() => { const m = {}; sharesAll.forEach(s => { m[s.member_id] = s; }); return m; }, [sharesAll]);

  const totalSavings = savingsAll.reduce((s, r) => s + Number(r.balance), 0);
  const totalShares = sharesAll.reduce((s, r) => s + Number(r.balance), 0);
  const totalOutstanding = loansAll.filter(l => l.status === 'active').reduce((s, r) => s + Number(r.outstanding_balance || 0), 0);
  const pendingLoans = loansAll.filter(l => l.status === 'pending');
  const activeLoans = loansAll.filter(l => l.status === 'active');

  const chartData = [
    { name: 'Savings', value: Math.round(totalSavings) },
    { name: 'Shares', value: Math.round(totalShares) },
    { name: 'Loans out', value: Math.round(totalOutstanding) },
  ];

  async function approveLoan(loan) {
    await sb(`/rest/v1/loans?id=eq.${loan.id}`, {
      method: 'PATCH', token, headers: { Prefer: 'return=minimal' },
      body: { status: 'active', approved_at: new Date().toISOString(), approved_by: profile.id, outstanding_balance: loan.principal, disbursed_at: new Date().toISOString() },
    });
    await sb('/rest/v1/transactions', {
      method: 'POST', token, headers: { Prefer: 'return=minimal' },
      body: { member_id: loan.member_id, type: 'loan_disbursement', amount: loan.principal, notes: 'Loan approved and disbursed', created_by: profile.id },
    });
    await load();
  }
  async function rejectLoan(loan) {
    await sb(`/rest/v1/loans?id=eq.${loan.id}`, {
      method: 'PATCH', token, headers: { Prefer: 'return=minimal' },
      body: { status: 'rejected', approved_at: new Date().toISOString(), approved_by: profile.id },
    });
    await load();
  }
  async function recordRepayment(loan, amount) {
    await sb('/rest/v1/loan_repayments', {
      method: 'POST', token, headers: { Prefer: 'return=minimal' },
      body: { loan_id: loan.id, amount: Number(amount), recorded_by: profile.id },
    });
    const newOutstanding = Math.max(0, Number(loan.outstanding_balance) - Number(amount));
    await sb(`/rest/v1/loans?id=eq.${loan.id}`, {
      method: 'PATCH', token, headers: { Prefer: 'return=minimal' },
      body: { outstanding_balance: newOutstanding, status: newOutstanding <= 0 ? 'completed' : 'active' },
    });
    await sb('/rest/v1/transactions', {
      method: 'POST', token, headers: { Prefer: 'return=minimal' },
      body: { member_id: loan.member_id, type: 'loan_repayment', amount: Number(amount), notes: 'Loan repayment received', created_by: profile.id },
    });
    await load();
  }
  async function recordTxn(memberId, type, amount, notes) {
    if (type === 'share_purchase') {
      const acct = sharesMap[memberId] || { balance: 0 };
      const newBal = Number(acct.balance) + Number(amount);
      await sb(`/rest/v1/shares?member_id=eq.${memberId}`, {
        method: 'PATCH', token, headers: { Prefer: 'return=minimal' },
        body: { balance: newBal, updated_at: new Date().toISOString() },
      });
      await sb('/rest/v1/transactions', {
        method: 'POST', token, headers: { Prefer: 'return=minimal' },
        body: { member_id: memberId, type, amount: Number(amount), balance_after: newBal, notes, created_by: profile.id },
      });
      await load();
      return;
    }
    const acct = savingsMap[memberId] || { balance: 0 };
    const newBal = type === 'deposit' ? Number(acct.balance) + Number(amount) : Number(acct.balance) - Number(amount);
    await sb(`/rest/v1/savings_accounts?member_id=eq.${memberId}`, {
      method: 'PATCH', token, headers: { Prefer: 'return=minimal' },
      body: { balance: newBal, updated_at: new Date().toISOString() },
    });
    await sb('/rest/v1/transactions', {
      method: 'POST', token, headers: { Prefer: 'return=minimal' },
      body: { member_id: memberId, type, amount: Number(amount), balance_after: newBal, notes, created_by: profile.id },
    });
    await load();
  }
  async function toggleMemberStatus(m) {
    const newStatus = m.status === 'active' ? 'suspended' : 'active';
    await sb(`/rest/v1/profiles?id=eq.${m.id}`, { method: 'PATCH', token, headers: { Prefer: 'return=minimal' }, body: { status: newStatus } });
    await load();
  }
  async function declareDividend(year, totalPool) {
    const eligible = sharesAll.filter(r => Number(r.balance) > 0);
    if (totalShares <= 0 || eligible.length === 0) { alert('No members hold shares yet.'); return; }
    const [div] = await sb('/rest/v1/dividends', {
      method: 'POST', token, headers: { Prefer: 'return=representation' },
      body: { year: Number(year), total_pool: Number(totalPool), declared_by: profile.id },
    });
    for (const r of eligible) {
      const amount = Math.round((Number(r.balance) / totalShares) * Number(totalPool) * 100) / 100;
      if (amount <= 0) continue;
      await sb('/rest/v1/dividend_allocations', { method: 'POST', token, headers: { Prefer: 'return=minimal' }, body: { dividend_id: div.id, member_id: r.member_id, amount } });
      const acct = savingsMap[r.member_id] || { balance: 0 };
      const newBal = Number(acct.balance) + amount;
      await sb(`/rest/v1/savings_accounts?member_id=eq.${r.member_id}`, { method: 'PATCH', token, headers: { Prefer: 'return=minimal' }, body: { balance: newBal } });
      await sb('/rest/v1/transactions', { method: 'POST', token, headers: { Prefer: 'return=minimal' }, body: { member_id: r.member_id, type: 'dividend', amount, notes: `Dividend for ${year}`, created_by: profile.id } });
    }
    await load();
  }

  const tabs = [
    { key: 'overview', label: 'Overview', icon: PieIcon },
    { key: 'members', label: 'Members', icon: Users },
    { key: 'loans', label: 'Loans', icon: Landmark },
    { key: 'transactions', label: 'Cash', icon: Wallet },
    { key: 'dividends', label: 'Dividends', icon: Gift },
  ];

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', minHeight: '100vh', background: THEME.paper, display: 'flex', flexDirection: 'column' }}>
      <Header title="Amani SACCO" subtitle={`Admin · ${profile.full_name}`} onLogout={onLogout}
        roleBadge={<Badge color={THEME.gold}>admin</Badge>} />

      <div style={{ flex: 1, padding: '0 20px 20px', overflowY: 'auto' }}>
        {loading ? <Spinner /> : (
          <>
            {tab === 'overview' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <StatCard label="Members" value={profiles.length} />
                  <StatCard label="Pending loans" value={pendingLoans.length} accent={THEME.gold} />
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <StatCard label="Total savings" value={fmt(totalSavings)} accent={THEME.pine} />
                  <StatCard label="Loans outstanding" value={fmt(totalOutstanding)} accent={THEME.danger} />
                </div>
                <Card>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Institution snapshot</div>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={chartData}>
                      <CartesianGrid stroke={THEME.line} vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 12, fill: THEME.inkSoft }} axisLine={{ stroke: THEME.line }} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: THEME.inkSoft }} axisLine={false} tickLine={false} width={40} />
                      <Tooltip formatter={(v) => fmt(v)} contentStyle={{ borderRadius: 8, border: `1px solid ${THEME.line}`, fontSize: 12 }} />
                      <Bar dataKey="value" fill={THEME.pine} radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
              </div>
            )}

            {tab === 'members' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {profiles.length === 0 ? <EmptyState text="No members yet." /> : profiles.map(m => (
                  <Card key={m.id}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{m.full_name}</div>
                        <div style={{ fontSize: 12, color: THEME.inkSoft }}>{m.phone || 'No phone on file'}</div>
                      </div>
                      <Badge color={statusColor(m.status)}>{m.status}</Badge>
                    </div>
                    <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 12 }}>
                      <span>Savings: <b>{fmt((savingsMap[m.id] || {}).balance)}</b></span>
                      <span>Shares: <b>{fmt((sharesMap[m.id] || {}).balance)}</b></span>
                    </div>
                    {m.id !== profile.id && (
                      <GhostButton style={{ marginTop: 10, width: '100%' }} onClick={() => toggleMemberStatus(m)}>
                        {m.status === 'active' ? 'Suspend member' : 'Reactivate member'}
                      </GhostButton>
                    )}
                  </Card>
                ))}
              </div>
            )}

            {tab === 'loans' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Pending applications</div>
                  {pendingLoans.length === 0 ? <EmptyState text="Nothing waiting for approval." /> : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {pendingLoans.map(l => (
                        <Card key={l.id}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div style={{ fontWeight: 700 }}>{(profileMap[l.member_id] || {}).full_name || 'Member'}</div>
                            {l.flagged_over_ceiling && <Badge color={THEME.danger}>over ceiling</Badge>}
                          </div>
                          <div style={{ fontFamily: 'Fraunces, serif', fontSize: 18, marginTop: 4 }}>{fmt(l.principal)}</div>
                          <div style={{ fontSize: 12, color: THEME.inkSoft, marginTop: 2 }}>{l.term_months} months{l.purpose ? ` · ${l.purpose}` : ''}</div>
                          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                            <PrimaryButton style={{ flex: 1 }} onClick={() => approveLoan(l)}><Check size={14} /> Approve</PrimaryButton>
                            <GhostButton style={{ flex: 1, borderColor: THEME.danger, color: THEME.danger }} onClick={() => rejectLoan(l)}><X size={14} style={{ marginRight: 4 }} />Reject</GhostButton>
                          </div>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Active loans</div>
                  {activeLoans.length === 0 ? <EmptyState text="No active loans." /> : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {activeLoans.map(l => <ActiveLoanRow key={l.id} loan={l} memberName={(profileMap[l.member_id] || {}).full_name} onRepay={recordRepayment} />)}
                    </div>
                  )}
                </div>
              </div>
            )}

            {tab === 'transactions' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <RecordTxnForm members={profiles} onSubmit={recordTxn} />
                <Card>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Recent transactions</div>
                  {txnsAll.length === 0 ? <EmptyState text="No transactions recorded yet." /> : txnsAll.slice(0, 20).map(t => (
                    <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: `1px solid ${THEME.line}`, fontSize: 12 }}>
                      <span>{(profileMap[t.member_id] || {}).full_name || 'Member'} · <span style={{ textTransform: 'capitalize' }}>{t.type.replace('_', ' ')}</span></span>
                      <b>{fmt(t.amount)}</b>
                    </div>
                  ))}
                </Card>
              </div>
            )}

            {tab === 'dividends' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <DeclareDividendForm totalShares={totalShares} onSubmit={declareDividend} />
                <Card>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Past dividends</div>
                  {dividendsAll.length === 0 ? <EmptyState text="No dividends declared yet." /> : dividendsAll.map(d => (
                    <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: `1px solid ${THEME.line}`, fontSize: 13 }}>
                      <span>{d.year}</span>
                      <b>{fmt(d.total_pool)}</b>
                    </div>
                  ))}
                </Card>
              </div>
            )}
          </>
        )}
      </div>

      <BottomNav tabs={tabs} active={tab} onChange={setTab} />
    </div>
  );
}

function ActiveLoanRow({ loan, memberName, onRepay }) {
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <div style={{ fontWeight: 700 }}>{memberName || 'Member'}</div>
        <span style={{ fontSize: 12, color: THEME.inkSoft }}>Outstanding {fmt(loan.outstanding_balance)}</span>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <input type="number" min="1" placeholder="Repayment amount" value={amount} onChange={e => setAmount(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
        <PrimaryButton disabled={busy || !amount} onClick={async () => {
          setBusy(true);
          try { await onRepay(loan, amount); setAmount(''); } finally { setBusy(false); }
        }}>{busy ? <Loader2 size={14} className="spin" /> : 'Record'}</PrimaryButton>
      </div>
    </Card>
  );
}

function RecordTxnForm({ members, onSubmit }) {
  const [memberId, setMemberId] = useState('');
  const [type, setType] = useState('deposit');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Card>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Record cash movement</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Field label="Member">
          <select value={memberId} onChange={e => setMemberId(e.target.value)} style={inputStyle}>
            <option value="">Select a member…</option>
            {members.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
          </select>
        </Field>
        <Field label="Type">
          <select value={type} onChange={e => setType(e.target.value)} style={inputStyle}>
            <option value="deposit">Savings deposit</option>
            <option value="withdrawal">Savings withdrawal</option>
            <option value="share_purchase">Share purchase</option>
          </select>
        </Field>
        <Field label="Amount (UGX)"><input type="number" min="1" value={amount} onChange={e => setAmount(e.target.value)} style={inputStyle} /></Field>
        <Field label="Notes"><input value={notes} onChange={e => setNotes(e.target.value)} style={inputStyle} placeholder="e.g. Mobile money confirmation code" /></Field>
        <PrimaryButton disabled={busy || !memberId || !amount} onClick={async () => {
          setBusy(true);
          try { await onSubmit(memberId, type, amount, notes); setAmount(''); setNotes(''); } finally { setBusy(false); }
        }}>{busy ? <Loader2 size={15} className="spin" /> : 'Record transaction'}</PrimaryButton>
      </div>
    </Card>
  );
}

function DeclareDividendForm({ totalShares, onSubmit }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [pool, setPool] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Card>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>Declare dividend</div>
      <div style={{ fontSize: 12, color: THEME.inkSoft, marginBottom: 10 }}>
        Splits the pool across members by share balance. Total shares on record: {fmt(totalShares)}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Field label="Year"><input type="number" value={year} onChange={e => setYear(e.target.value)} style={inputStyle} /></Field>
        <Field label="Total pool (UGX)"><input type="number" min="1" value={pool} onChange={e => setPool(e.target.value)} style={inputStyle} /></Field>
        <PrimaryButton disabled={busy || !pool} onClick={async () => {
          setBusy(true);
          try { await onSubmit(year, pool); setPool(''); } finally { setBusy(false); }
        }}>{busy ? <Loader2 size={15} className="spin" /> : 'Declare & allocate'}</PrimaryButton>
      </div>
    </Card>
  );
}

/* --------------------------------- app --------------------------------- */

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);

  return (
    <div style={{ minHeight: '100vh', background: THEME.paper, fontFamily: 'Inter, sans-serif', color: THEME.ink }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        input:focus, select:focus { border-color: ${THEME.pine} !important; }
      `}</style>
      {!session || !profile ? (
        <AuthScreen onAuthed={(sess, prof) => { setSession(sess); setProfile(prof); }} />
      ) : profile.role === 'admin' ? (
        <AdminApp profile={profile} token={session.access_token} onLogout={() => { setSession(null); setProfile(null); }} />
      ) : (
        <MemberApp profile={profile} token={session.access_token} onLogout={() => { setSession(null); setProfile(null); }} />
      )}
    </div>
  );
}
