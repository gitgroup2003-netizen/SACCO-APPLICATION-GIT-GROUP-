import React, { useState } from 'react';
import {
  ArrowLeft, ChevronRight, Plus, Wallet, CalendarDays, Download, ShieldCheck, Users, Info, X, Check, Landmark,
} from 'lucide-react';
import {
  useKit, tints, rpc, quote, headroomOf, dueLabel, paidPct, useLoader, OPEN_STAGES, STAGE_LABEL,
} from './kit.js';
import {
  LoanStyles, Tile, Pill, Money, Eyebrow, ErrorNote, OkNote, Sheet, RangeField, StageTrack, Ring, Bar, Timeline, Row,
  useInputStyle, stageTone,
} from './ui.jsx';
import { downloadLoanStatement } from './pdf.js';

const TONES = ['mint', 'sky', 'butter'];
const round = (n, step) => Math.round(n / step) * step;
const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);

/* ============================== tab root ============================== */
export default function MemberLoansTab({ profile, token, onChanged }) {
  const kit = useKit();
  const { THEME, fmt, Spinner, GhostButton } = kit;
  const T = tints(THEME);
  const [view, setView] = useState({ name: 'home' });
  const [sheet, setSheet] = useState(null);

  const L = useLoader(async () => {
    const [loans, position, products, guar] = await Promise.all([
      kit.sb('/rest/v1/loan_portfolio?select=*&order=applied_at.desc', { token }),
      rpc(kit, token, 'my_loan_position'),
      kit.sb('/rest/v1/loan_products?active=eq.true&select=*&order=name', { token }),
      rpc(kit, token, 'list_guarantee_requests'),
    ]);
    return { loans: loans || [], position: position || {}, products: products || [], guar: guar || [] };
  }, [token]);

  function refresh() { L.reload(); if (onChanged) onChanged(); }

  if (!L.data) {
    return L.loading ? <Spinner /> : (
      <div style={{ display: 'grid', gap: 12 }}>
        <ErrorNote msg={L.error || 'Could not load your loans.'} />
        <GhostButton onClick={L.reload}>Try again</GhostButton>
      </div>
    );
  }
  const { loans, position, products, guar } = L.data;

  if (view.name === 'apply') {
    return (
      <>
        <LoanStyles />
        <ApplyLoan products={products} position={position} token={token}
          onBack={() => setView({ name: 'home' })}
          onSubmitted={id => { refresh(); setView({ name: 'loan', id, justApplied: true }); }} />
      </>
    );
  }
  if (view.name === 'loan') {
    const loan = loans.find(l => l.loan_id === view.id);
    if (loan) {
      return (
        <>
          <LoanStyles />
          <MemberLoanDetail loan={loan} token={token} justApplied={view.justApplied}
            onBack={() => setView({ name: 'home' })} onChanged={refresh} />
        </>
      );
    }
  }

  const live = loans.filter(l => l.stage === 'disbursed');
  const open = loans.filter(l => OPEN_STAGES.includes(l.stage));
  const past = loans.filter(l => l.stage === 'closed' || l.stage === 'rejected');
  const owed = live.reduce((s, l) => s + Number(l.outstanding_balance), 0);
  const soonest = live.filter(l => l.next_due_date).sort((a, b) => a.next_due_date.localeCompare(b.next_due_date))[0];
  const pendingGuar = guar.filter(g => g.status === 'pending');
  const blocked = position.open_application
    ? 'You already have an application in progress.'
    : Number(position.arrears_days) > 0 ? 'Clear your overdue installments before applying again.' : '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <LoanStyles />
      <div style={{ paddingTop: 6 }}>
        <Eyebrow>Hello, {profile.full_name.split(' ')[0]}</Eyebrow>
        <div style={{ fontFamily: 'Fraunces, serif', fontSize: 34, lineHeight: 1.1, color: THEME.ink, marginTop: 2 }}>Your loans</div>
        <div style={{ fontSize: 13, color: THEME.inkSoft, marginTop: 6 }}>
          {live.length} active · {open.length} in progress
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Tile tone="mint" pad={14}>
          <IconDot icon={Wallet} />
          <Eyebrow style={{ marginTop: 10 }}>Total you owe</Eyebrow>
          <Money value={owed} size={21} style={{ display: 'block', marginTop: 3 }} />
        </Tile>
        <Tile tone="sky" pad={14}>
          <IconDot icon={CalendarDays} />
          <Eyebrow style={{ marginTop: 10 }}>Next payment</Eyebrow>
          {soonest ? (
            <>
              <Money value={soonest.next_due_amount} size={21} style={{ display: 'block', marginTop: 3 }} />
              <div style={{ fontSize: 11.5, color: THEME.inkSoft, marginTop: 4 }}>{dueLabel(soonest.next_due_date)}</div>
            </>
          ) : <div style={{ fontSize: 13, color: THEME.inkSoft, marginTop: 6 }}>Nothing due</div>}
        </Tile>
      </div>

      {pendingGuar.length > 0 && (
        <Tile tone="butter" onClick={() => setSheet('guarantees')} pad={14}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <IconDot icon={Users} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{pendingGuar.length} guarantee request{pendingGuar.length > 1 ? 's' : ''} waiting</div>
              <div style={{ fontSize: 12, color: THEME.inkSoft, marginTop: 2 }}>A member asked you to stand behind their loan.</div>
            </div>
            <ChevronRight size={18} color={THEME.inkSoft} />
          </div>
        </Tile>
      )}

      <div>
        <Pill disabled={!!blocked || products.length === 0} onClick={() => setView({ name: 'apply' })}
          style={{ width: '100%', justifyContent: 'center', padding: '14px 18px', fontSize: 14 }}>
          <Plus size={16} /> Apply for a loan
        </Pill>
        {blocked && <div style={{ fontSize: 12, color: THEME.inkSoft, textAlign: 'center', marginTop: 8 }}>{blocked}</div>}
        {products.length === 0 && <div style={{ fontSize: 12, color: THEME.inkSoft, textAlign: 'center', marginTop: 8 }}>No loan products are open right now.</div>}
      </div>

      {open.length > 0 && <SectionTitle>In progress</SectionTitle>}
      {open.map((l, i) => (
        <Tile key={l.loan_id} tone={stageTone(l.stage)} onClick={() => setView({ name: 'loan', id: l.loan_id })}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <Eyebrow>{l.product_name || 'Loan'}</Eyebrow>
              <Money value={l.approved_amount || l.principal} size={28} style={{ display: 'block', marginTop: 4 }} />
            </div>
            <Pill tone="surface" decorative>{STAGE_LABEL[l.stage]}</Pill>
          </div>
          <div style={{ marginTop: 14 }}><StageTrack stage={l.stage} compact /></div>
          <div style={{ fontSize: 12, color: THEME.inkSoft, marginTop: 10 }}>{stageHint(l.stage)}</div>
        </Tile>
      ))}

      {live.length > 0 && <SectionTitle>Active loans</SectionTitle>}
      {live.map((l, i) => {
        const pct = paidPct(l);
        return (
          <Tile key={l.loan_id} tone={TONES[i % TONES.length]} onClick={() => setView({ name: 'loan', id: l.loan_id })}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <Eyebrow>Loan {String(i + 1).padStart(2, '0')} · {l.product_name || 'Loan'}</Eyebrow>
                <Money value={l.outstanding_balance} size={30} style={{ display: 'block', marginTop: 4 }} />
                <div style={{ fontSize: 12, color: THEME.inkSoft, marginTop: 4 }}>left to repay</div>
              </div>
              <Ring pct={pct} size={66} />
            </div>
            {l.days_in_arrears > 0 && (
              <div style={{ marginTop: 10, fontSize: 12, fontWeight: 700, color: THEME.danger }}>
                {l.days_in_arrears} days overdue · {fmt(l.overdue_amount)} to clear
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, gap: 8 }}>
              <div style={{ fontSize: 12, color: THEME.inkSoft }}>
                {l.next_due_date ? `${dueLabel(l.next_due_date)} · ${fmt(l.next_due_amount)}` : 'No installment due'}
              </div>
              <Pill decorative>Details</Pill>
            </div>
          </Tile>
        );
      })}

      {past.length > 0 && <SectionTitle>History</SectionTitle>}
      {past.map(l => (
        <button key={l.loan_id} onClick={() => setView({ name: 'loan', id: l.loan_id })} style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '12px 14px',
          background: THEME.surface, border: `1px solid ${THEME.line}`, borderRadius: 16, cursor: 'pointer', color: THEME.ink, font: 'inherit', textAlign: 'left',
        }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{fmt(l.approved_amount || l.principal)}</div>
            <div style={{ fontSize: 11.5, color: THEME.inkSoft }}>{l.product_name || 'Loan'} · {kit.fmtDate(l.applied_at)}</div>
          </div>
          <kit.Badge color={l.stage === 'closed' ? THEME.success : THEME.danger}>{l.stage === 'closed' ? 'repaid' : 'declined'}</kit.Badge>
        </button>
      ))}

      {loans.length === 0 && (
        <Tile tone="sky" style={{ textAlign: 'center', padding: 24 }}>
          <Landmark size={26} color={THEME.pine} />
          <div style={{ fontFamily: 'Fraunces, serif', fontSize: 20, marginTop: 8 }}>No loans yet</div>
          <div style={{ fontSize: 13, color: THEME.inkSoft, marginTop: 4 }}>
            You can borrow up to {kit.fmt(headroomOf(position, products[0]?.savings_multiple || 3))} based on your savings.
          </div>
        </Tile>
      )}

      {sheet === 'guarantees' && (
        <GuaranteeInbox items={guar} token={token} onClose={() => setSheet(null)} onDone={refresh} />
      )}
    </div>
  );
}

function stageHint(stage) {
  return ({
    application: 'Submitted. A loans officer will start the appraisal. Add guarantors while you wait.',
    appraisal: 'The loans officer is checking your application.',
    committee: 'With the credit committee for a decision.',
    approved: 'Approved. The SACCO will disburse the loan shortly.',
  })[stage] || '';
}
function SectionTitle({ children }) {
  const { THEME } = useKit();
  return <div style={{ fontFamily: 'Fraunces, serif', fontSize: 20, color: THEME.ink, marginTop: 4 }}>{children}</div>;
}
function IconDot({ icon: Icon }) {
  const { THEME } = useKit();
  return (
    <span style={{ width: 34, height: 34, borderRadius: '50%', background: THEME.surface, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      <Icon size={16} color={THEME.pine} />
    </span>
  );
}

/* ============================== apply flow ============================== */
function ApplyLoan({ products, position, token, onBack, onSubmitted }) {
  const kit = useKit();
  const { THEME, fmt } = kit;
  const T = tints(THEME);
  const input = useInputStyle();
  const [pid, setPid] = useState(products[0] ? products[0].id : null);
  const product = products.find(p => p.id === pid) || products[0];
  const [amount, setAmount] = useState(0);
  const [amountText, setAmountText] = useState('');
  const [term, setTerm] = useState(0);
  const [purpose, setPurpose] = useState('');
  const [plan, setPlan] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  if (!product) return <div><Pill onClick={onBack} tone="ghost"><ArrowLeft size={14} /> Back</Pill><div style={{ marginTop: 16 }}><ErrorNote msg="No loan products are open right now." /></div></div>;

  const headroom = headroomOf(position, product.savings_multiple);
  const minAmt = Math.max(Number(product.min_amount) || 0, 50000);
  const maxAmt = product.max_amount ? Number(product.max_amount) : Math.max(5000000, Math.ceil((headroom * 1.25) / 500000) * 500000);
  const step = maxAmt > 20000000 ? 100000 : 50000;
  const startAmt = clamp(round(Math.min(headroom || maxAmt, maxAmt) / 2, step), minAmt, maxAmt);
  const amt = clamp(amount || startAmt, minAmt, maxAmt);
  const months = clamp(term || Math.min(6, product.max_term_months), product.min_term_months, product.max_term_months);

  const q = quote({
    amount: amt, months, ratePct: product.interest_rate, method: product.interest_method,
    processingPct: product.processing_fee_pct, insurancePct: product.insurance_fee_pct,
  });
  const within = amt <= headroom;
  const special = amt > 2 * Number(position.savings || 0);
  const blocked = position.open_application
    ? 'You already have an application in progress.'
    : Number(position.arrears_days) > 0 ? 'Clear your overdue installments before applying again.' : '';
  const canSend = !busy && !blocked && (!special || plan.trim().length > 0);

  async function submit() {
    setBusy(true); setErr('');
    try {
      const id = await rpc(kit, token, 'apply_for_loan', {
        p_product: product.id, p_amount: amt, p_term: months,
        p_purpose: purpose.trim() || null, p_plan: special ? plan.trim() : null,
      });
      onSubmitted(id);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={onBack} aria-label="Back" style={roundBtn(THEME)}><ArrowLeft size={17} /></button>
        <div style={{ fontFamily: 'Fraunces, serif', fontSize: 24 }}>Apply for a loan</div>
      </div>

      {products.length > 1 && (
        <div className="ln-hscroll" style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
          {products.map(p => (
            <button key={p.id} onClick={() => { setPid(p.id); setAmount(0); setAmountText(''); setTerm(0); }} style={{
              flex: '0 0 auto', padding: '10px 16px', borderRadius: 16, cursor: 'pointer', textAlign: 'left',
              border: p.id === product.id ? `2px solid ${THEME.pine}` : `1px solid ${THEME.line}`, background: p.id === product.id ? T.mint : THEME.surface, color: THEME.ink,
            }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{p.name}</div>
              <div style={{ fontSize: 11, color: THEME.inkSoft }}>{Number(p.interest_rate)}% a year</div>
            </button>
          ))}
        </div>
      )}
      {product.description && <div style={{ fontSize: 13, color: THEME.inkSoft, marginTop: -4 }}>{product.description}</div>}

      <div style={{ background: THEME.surface, border: `1px solid ${THEME.line}`, borderRadius: 24, padding: 18, display: 'grid', gap: 18 }}>
        <RangeField label="How much do you need?" value={amt} min={minAmt} max={maxAmt} step={step}
          onChange={v => { setAmount(v); setAmountText(String(v)); }} format={v => fmt(v)} />
        <label style={{ display: 'grid', gap: 6, fontSize: 12.5, color: THEME.inkSoft, fontWeight: 600 }}>
          Or type an exact amount (UGX)
          <input type="number" inputMode="numeric" min={minAmt} max={maxAmt} value={amountText === '' ? amt : amountText} style={input}
            onChange={e => { setAmountText(e.target.value); const n = Number(e.target.value); if (n > 0) setAmount(n); }}
            onBlur={() => setAmountText(String(amt))} />
        </label>
        <RangeField label="Repay over" value={months} min={product.min_term_months} max={product.max_term_months} step={1}
          onChange={setTerm} format={v => `${v} month${v === 1 ? '' : 's'}`} />
      </div>

      {/* estimated payment, ticket style */}
      <Tile tone="sky" pad={0} style={{ overflow: 'hidden' }}>
        <div style={{ padding: '20px 18px 16px', textAlign: 'center' }}>
          <Money value={q.first} size={36} />
          <div style={{ fontSize: 13, color: THEME.inkSoft, marginTop: 4 }}>estimated first monthly payment</div>
        </div>
        <div aria-hidden style={{ position: 'relative', height: 0, borderTop: `2px dashed ${THEME.mode === 'dark' ? '#ffffff30' : '#00000022'}` }}>
          <span style={{ position: 'absolute', left: -9, top: -10, width: 18, height: 18, borderRadius: '50%', background: THEME.paper }} />
          <span style={{ position: 'absolute', right: -9, top: -10, width: 18, height: 18, borderRadius: '50%', background: THEME.paper }} />
        </div>
        <div style={{ padding: '10px 18px 16px' }}>
          <Row label="You borrow" value={fmt(amt)} />
          <Row label={`Interest (${Number(product.interest_rate)}% a year, ${product.interest_method})`} value={fmt(q.interest)} />
          {q.fees > 0 && <Row label="Processing and insurance fees" value={fmt(q.fees)} />}
          <Row label="Total to repay" value={fmt(q.total)} strong />
        </div>
      </Tile>

      <div style={{ background: THEME.surface, border: `1px solid ${THEME.line}`, borderRadius: 20, padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700 }}>
          <span>Your borrowing limit</span><span>{fmt(headroom)}</span>
        </div>
        <div style={{ margin: '10px 0 8px' }}><Bar pct={headroom > 0 ? (amt / headroom) * 100 : 100} color={within ? THEME.success : THEME.danger} height={9} /></div>
        <div style={{ fontSize: 12, color: within ? THEME.success : THEME.danger, fontWeight: 600 }}>
          {within ? 'This amount is within your limit.' : 'This is above your limit. You can still apply and it will be reviewed by hand.'}
        </div>
        <div style={{ fontSize: 11.5, color: THEME.inkSoft, marginTop: 8, display: 'flex', gap: 6 }}>
          <Info size={13} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>Limit = (savings + shares − amounts you guarantee) × {Number(product.savings_multiple)}, minus loans you still owe.</span>
        </div>
      </div>

      <label style={{ display: 'grid', gap: 6, fontSize: 12.5, color: THEME.inkSoft, fontWeight: 600 }}>
        What is the loan for?
        <input value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="e.g. School fees" style={input} maxLength={120} />
      </label>

      {special && (
        <div style={{ background: T.butter, borderRadius: 18, padding: 14, display: 'grid', gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>Special request</div>
          <div style={{ fontSize: 12.5, color: THEME.ink }}>This is more than twice your savings, so a manager reviews it closely. Explain how you will repay it.</div>
          <textarea value={plan} onChange={e => setPlan(e.target.value)} rows={3} style={{ ...input, resize: 'vertical' }}
            placeholder="e.g. I will repay UGX 250,000 each month from my shop income" />
        </div>
      )}

      {blocked && <ErrorNote msg={blocked} />}
      <ErrorNote msg={err} onClose={() => setErr('')} />
      <Pill disabled={!canSend} onClick={submit} tone="sun" style={{ width: '100%', justifyContent: 'center', padding: '15px 18px', fontSize: 15 }}>
        {busy ? 'Sending…' : 'Submit application'}
      </Pill>
      <div style={{ fontSize: 11.5, color: THEME.inkSoft, textAlign: 'center' }}>
        After you apply you can add guarantors. The final schedule is fixed when the loan is disbursed.
      </div>
    </div>
  );
}
const roundBtn = THEME => ({
  width: 40, height: 40, borderRadius: '50%', border: `1px solid ${THEME.line}`, background: THEME.surface, color: THEME.ink,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, padding: 0,
});

/* ============================== loan detail ============================== */
function MemberLoanDetail({ loan, token, justApplied, onBack, onChanged }) {
  const kit = useKit();
  const { THEME, fmt, fmtDate, Badge, Spinner } = kit;
  const T = tints(THEME);
  const input = useInputStyle();
  const id = loan.loan_id;
  const early = ['application', 'appraisal', 'committee'].includes(loan.stage);

  const D = useLoader(async () => {
    const [schedule, events, guarantors, payments] = await Promise.all([
      kit.sb(`/rest/v1/loan_schedule?loan_id=eq.${id}&select=*&order=installment_no`, { token }),
      kit.sb(`/rest/v1/loan_events?loan_id=eq.${id}&select=*&order=created_at.desc&limit=50`, { token }),
      rpc(kit, token, 'list_loan_guarantors', { p_loan: id }),
      kit.sb(`/rest/v1/loan_repayments?loan_id=eq.${id}&select=*&order=created_at.desc`, { token }),
    ]);
    return { schedule: schedule || [], events: events || [], guarantors: guarantors || [], payments: payments || [] };
  }, [id, token, loan.stage, loan.outstanding_balance]);

  const [showAll, setShowAll] = useState(false);
  const [pay, setPay] = useState(false);
  const [gContact, setGContact] = useState('');
  const [gAmount, setGAmount] = useState('');
  const [gBusy, setGBusy] = useState(false);
  const [gErr, setGErr] = useState('');
  const [gOk, setGOk] = useState(justApplied ? 'Application sent. Add your guarantors below if you have them.' : '');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cErr, setCErr] = useState('');

  const d = D.data;
  const pct = paidPct(loan);
  const rejected = loan.stage === 'rejected';
  const live = loan.stage === 'disbursed';

  async function addGuarantor() {
    setGBusy(true); setGErr(''); setGOk('');
    try {
      const r = await rpc(kit, token, 'request_guarantor', { p_loan: id, p_contact: gContact.trim(), p_amount: Number(gAmount || loan.principal) });
      setGOk(`Request sent to ${r.guarantor_name}.`); setGContact(''); setGAmount('');
      D.reload();
    } catch (e) { setGErr(e.message); } finally { setGBusy(false); }
  }
  async function cancel() {
    setCErr('');
    try { await rpc(kit, token, 'cancel_application', { p_loan: id }); onChanged(); onBack(); }
    catch (e) { setCErr(e.message); }
  }

  const rows = d ? (showAll ? d.schedule : d.schedule.slice(0, 6)) : [];
  const pillTone = s => ({ paid: kit.THEME.success, overdue: kit.THEME.danger, partial: kit.THEME.gold, pending: kit.THEME.inkSoft })[s];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={onBack} aria-label="Back" style={roundBtn(THEME)}><ArrowLeft size={17} /></button>
        <div>
          <div style={{ fontFamily: 'Fraunces, serif', fontSize: 22 }}>{loan.product_name || 'Loan'}</div>
          <div style={{ fontSize: 11.5, color: THEME.inkSoft, fontFamily: 'monospace' }}>Ref {kit.shortId(id)}</div>
        </div>
      </div>

      <Tile tone={stageTone(loan.stage)}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
          <div style={{ minWidth: 0 }}>
            <Eyebrow>{live ? 'Left to repay' : rejected ? 'Requested' : 'Amount'}</Eyebrow>
            <Money value={live ? loan.outstanding_balance : (loan.approved_amount || loan.principal)} size={32} style={{ display: 'block', marginTop: 4 }} />
          </div>
          {(live || loan.stage === 'closed') && <Ring pct={pct} size={70} />}
        </div>
        <div style={{ marginTop: 16 }}><StageTrack stage={loan.stage} rejected={rejected} /></div>
        {rejected && loan.rejection_reason && (
          <div style={{ marginTop: 12, fontSize: 13, color: THEME.danger, fontWeight: 600 }}>Reason: {loan.rejection_reason}</div>
        )}
        {!rejected && stageHintShort(loan.stage) && <div style={{ marginTop: 10, fontSize: 12.5, color: THEME.inkSoft }}>{stageHintShort(loan.stage)}</div>}
      </Tile>

      {live && loan.days_in_arrears > 0 && (
        <ErrorNote msg={`You are ${loan.days_in_arrears} days behind. Pay ${fmt(loan.overdue_amount)} to bring this loan up to date.`} />
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {live && <Pill tone="sun" onClick={() => setPay(true)}><Wallet size={14} /> How to pay</Pill>}
        {(live || loan.stage === 'closed') && d && (
          <Pill tone="ghost" onClick={() => downloadLoanStatement({ loan, schedule: d.schedule, payments: d.payments, memberName: loan.member_name })}>
            <Download size={14} /> Statement
          </Pill>
        )}
        {early && !confirmCancel && <Pill tone="ghost" onClick={() => setConfirmCancel(true)}><X size={14} /> Withdraw application</Pill>}
      </div>
      {confirmCancel && (
        <div style={{ background: THEME.danger + '12', border: `1px solid ${THEME.danger}44`, borderRadius: 16, padding: 14, display: 'grid', gap: 10 }}>
          <div style={{ fontSize: 13 }}>Withdraw this application? Your guarantors will be released.</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Pill onClick={cancel}>Yes, withdraw</Pill>
            <Pill tone="ghost" onClick={() => setConfirmCancel(false)}>Keep it</Pill>
          </div>
          <ErrorNote msg={cErr} />
        </div>
      )}

      <Card kit={kit} title="The deal">
        <Row label="Amount" value={fmt(loan.approved_amount || loan.principal)} />
        <Row label="Interest" value={`${Number(loan.interest_rate)}% a year · ${loan.interest_method}`} />
        <Row label="Term" value={`${loan.term_months} months`} />
        {d && d.schedule[0] && <Row label="Monthly payment" value={fmt(Number(d.schedule[0].principal_due) + Number(d.schedule[0].interest_due))} />}
        {live && <Row label="Final payment" value={fmtDate(loan.maturity_date)} />}
        {live && Number(loan.processing_fee) + Number(loan.insurance_fee) > 0 && <Row label="Fees charged" value={fmt(Number(loan.processing_fee) + Number(loan.insurance_fee))} />}
        {loan.purpose && <Row label="Purpose" value={loan.purpose} />}
        <Row label="Applied" value={fmtDate(loan.applied_at)} />
      </Card>

      {!d ? (D.loading ? <Spinner /> : <ErrorNote msg={D.error} />) : (
        <>
          {(early || d.guarantors.length > 0) && (
            <Card kit={kit} title="Guarantors" sub="Members who stand behind your loan with part of their savings.">
              {d.guarantors.length === 0 && <div style={{ fontSize: 13, color: THEME.inkSoft, padding: '4px 0 8px' }}>No guarantors yet.</div>}
              {d.guarantors.map(g => (
                <div key={g.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderTop: `1px solid ${THEME.line}` }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{g.guarantor_name}</div>
                    <div style={{ fontSize: 12, color: THEME.inkSoft }}>Guarantees {fmt(g.amount)}</div>
                  </div>
                  <Badge color={g.status === 'approved' ? THEME.success : g.status === 'declined' ? THEME.danger : g.status === 'released' ? THEME.inkSoft : THEME.gold}>
                    {g.status === 'approved' ? 'accepted' : g.status}
                  </Badge>
                </div>
              ))}
              {early && (
                <div style={{ display: 'grid', gap: 8, marginTop: 10, paddingTop: 12, borderTop: `1px solid ${THEME.line}` }}>
                  <input value={gContact} onChange={e => setGContact(e.target.value)} placeholder="Their phone number or email" style={input} inputMode="tel" />
                  <input type="number" value={gAmount} onChange={e => setGAmount(e.target.value)} placeholder={`Amount they guarantee (default ${fmt(loan.principal)})`} style={input} />
                  <ErrorNote msg={gErr} onClose={() => setGErr('')} />
                  <OkNote msg={gOk} />
                  <Pill disabled={gBusy || !gContact.trim()} onClick={addGuarantor}><Users size={14} /> {gBusy ? 'Sending…' : 'Ask to guarantee'}</Pill>
                </div>
              )}
            </Card>
          )}

          {d.schedule.length > 0 && (
            <Card kit={kit} title="Payment schedule">
              {rows.map(s => {
                const paid = Number(s.principal_paid) + Number(s.interest_paid) + Number(s.penalty_paid);
                const due = Number(s.principal_due) + Number(s.interest_due) + Number(s.penalty_due);
                return (
                  <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: `1px solid ${THEME.line}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <span style={{
                        width: 28, height: 28, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        background: s.status === 'paid' ? THEME.success : 'transparent', border: s.status === 'paid' ? 'none' : `2px solid ${pillTone(s.status)}`,
                        color: s.status === 'paid' ? '#fff' : pillTone(s.status), fontSize: 11, fontWeight: 700,
                      }}>{s.status === 'paid' ? <Check size={14} /> : s.installment_no}</span>
                      <div>
                        <div style={{ fontSize: 13.5, fontWeight: 600 }}>{fmtDate(s.due_date)}</div>
                        <div style={{ fontSize: 11.5, color: THEME.inkSoft }}>
                          {s.status === 'paid' ? 'Paid' : paid > 0 ? `${fmt(paid)} paid so far` : s.status === 'overdue' ? 'Overdue' : 'Upcoming'}
                          {Number(s.penalty_due) > 0 ? ` · incl. ${fmt(s.penalty_due)} penalty` : ''}
                        </div>
                      </div>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: s.status === 'overdue' ? THEME.danger : THEME.ink }}>{fmt(due)}</div>
                  </div>
                );
              })}
              {d.schedule.length > 6 && (
                <button onClick={() => setShowAll(v => !v)} style={{ background: 'none', border: 'none', color: THEME.pine, fontWeight: 700, fontSize: 13, cursor: 'pointer', padding: '10px 0 0' }}>
                  {showAll ? 'Show fewer' : `Show all ${d.schedule.length} payments`}
                </button>
              )}
            </Card>
          )}

          <Card kit={kit} title="Activity">
            <Timeline events={d.events} />
          </Card>
        </>
      )}

      {pay && (
        <Sheet title="How to pay" onClose={() => setPay(false)}>
          <Tile tone="butter" style={{ marginBottom: 14 }}>
            <Eyebrow>Pay now to stay on track</Eyebrow>
            <Money value={Number(loan.overdue_amount) > 0 ? loan.overdue_amount : loan.next_due_amount} size={32} style={{ display: 'block', marginTop: 4 }} />
            <div style={{ fontSize: 12, color: THEME.inkSoft, marginTop: 4 }}>{dueLabel(loan.next_due_date)}</div>
          </Tile>
          <div style={{ fontSize: 13.5, lineHeight: 1.6, color: THEME.ink }}>
            Pay at the SACCO counter, by bank transfer or by mobile money to the SACCO's official account, and quote this reference:
          </div>
          <div style={{ fontFamily: 'monospace', fontSize: 22, fontWeight: 700, textAlign: 'center', padding: '14px 0', letterSpacing: 2 }}>{kit.shortId(id)}</div>
          <div style={{ fontSize: 12.5, color: THEME.inkSoft, lineHeight: 1.55 }}>
            A cashier records your payment and this page updates straight away. Paying earlier than the due date is welcome. Penalties are cleared first, then interest, then the amount borrowed.
          </div>
        </Sheet>
      )}
    </div>
  );
}
function stageHintShort(stage) {
  return ({
    application: 'Your application is in. Add guarantors while it waits for a loans officer.',
    appraisal: 'The loans officer is reviewing your application.',
    committee: 'The credit committee is deciding.',
    approved: 'Approved. Waiting for disbursement.',
  })[stage] || '';
}
function Card({ kit, title, sub, children }) {
  const { THEME } = kit;
  return (
    <div style={{ background: THEME.surface, border: `1px solid ${THEME.line}`, borderRadius: 22, padding: '16px 16px 12px' }}>
      <div style={{ fontFamily: 'Fraunces, serif', fontSize: 18, color: THEME.ink }}>{title}</div>
      {sub && <div style={{ fontSize: 12, color: THEME.inkSoft, margin: '2px 0 6px' }}>{sub}</div>}
      <div style={{ marginTop: sub ? 0 : 6 }}>{children}</div>
    </div>
  );
}

/* ============================== guarantee inbox ============================== */
function GuaranteeInbox({ items, token, onClose, onDone }) {
  const kit = useKit();
  const { THEME, fmt, fmtDate, Badge } = kit;
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  async function answer(id, accept) {
    setBusy(id); setErr('');
    try { await rpc(kit, token, 'respond_guarantee', { p_id: id, p_accept: accept }); onDone(); }
    catch (e) { setErr(e.message); } finally { setBusy(''); }
  }
  const pending = items.filter(i => i.status === 'pending');
  const rest = items.filter(i => i.status !== 'pending');
  return (
    <Sheet title="Guarantee requests" onClose={onClose}>
      <ErrorNote msg={err} onClose={() => setErr('')} />
      {pending.length === 0 && <div style={{ fontSize: 13, color: THEME.inkSoft, padding: '8px 0' }}>Nothing waiting for your answer.</div>}
      <div style={{ display: 'grid', gap: 12 }}>
        {pending.map(g => (
          <Tile key={g.id} tone="butter" style={{ cursor: 'default' }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{g.borrower_name}</div>
            <div style={{ fontSize: 12.5, color: THEME.inkSoft, marginTop: 2 }}>
              borrowing {fmt(g.loan_amount)} over {g.term_months} months{g.purpose ? ` for ${g.purpose}` : ''}
            </div>
            <div style={{ fontSize: 13, marginTop: 10 }}>They ask you to guarantee <b>{fmt(g.amount)}</b>.</div>
            <div style={{ fontSize: 12, color: THEME.inkSoft, marginTop: 6, lineHeight: 1.5 }}>
              If you accept, that part of your savings is frozen until the loan is repaid. If the borrower defaults, the SACCO can recover it from your savings.
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <Pill disabled={busy === g.id} onClick={() => answer(g.id, true)}><ShieldCheck size={14} /> Accept</Pill>
              <Pill tone="ghost" disabled={busy === g.id} onClick={() => answer(g.id, false)}>Decline</Pill>
            </div>
          </Tile>
        ))}
        {rest.length > 0 && <Eyebrow style={{ marginTop: 6 }}>Earlier requests</Eyebrow>}
        {rest.map(g => (
          <div key={g.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderTop: `1px solid ${THEME.line}` }}>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>{g.borrower_name}</div>
              <div style={{ fontSize: 12, color: THEME.inkSoft }}>{fmt(g.amount)} · {fmtDate(g.requested_at)}</div>
            </div>
            <Badge color={g.status === 'approved' ? THEME.success : g.status === 'declined' ? THEME.danger : THEME.inkSoft}>{g.status === 'approved' ? 'accepted' : g.status}</Badge>
          </div>
        ))}
      </div>
    </Sheet>
  );
}
