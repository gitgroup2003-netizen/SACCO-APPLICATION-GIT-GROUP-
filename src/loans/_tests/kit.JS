// Shared plumbing for the loan system: the context that carries the app's
// theme + helpers, the stage model, and the repayment maths (which mirrors
// the database function exactly so the quote a member sees is the schedule
// they get).
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

export const KitContext = createContext(null);
export function useKit() {
  const k = useContext(KitContext);
  if (!k) throw new Error('Loan UI used outside <KitContext.Provider>');
  return k;
}

/* ------------------------------ stage model ------------------------------ */
export const STAGES = [
  { key: 'application', label: 'Application' },
  { key: 'appraisal', label: 'Appraisal' },
  { key: 'committee', label: 'Committee' },
  { key: 'approved', label: 'Approved' },
  { key: 'disbursed', label: 'Active' },
  { key: 'closed', label: 'Closed' },
];
export const STAGE_LABEL = { ...Object.fromEntries(STAGES.map(s => [s.key, s.label])), rejected: 'Rejected' };
export const OPEN_STAGES = ['application', 'appraisal', 'committee', 'approved'];
export const stageIndex = key => Math.max(0, STAGES.findIndex(s => s.key === key));

/* ------------------------------ soft palette ----------------------------- */
// Pastel surfaces for the loan screens. Light mode uses airy tints, dark mode
// uses deep versions of the same hues so text stays readable.
export function tints(theme) {
  return theme.mode === 'dark'
    ? { mint: '#15342B', sky: '#14303C', butter: '#3B3416', blush: '#3B2220', lilac: '#2B2440', sun: '#F0C572', sunInk: '#2A2208' }
    : { mint: '#D5EBDD', sky: '#CFE6F0', butter: '#F7EAAE', blush: '#F6DDD7', lilac: '#E4DCF3', sun: '#F4D35E', sunInk: '#3A2E05' };
}

/* ------------------------------ repayment maths -------------------------- */
const r0 = n => Math.round(n); // matches round(x, 0) in Postgres for positive numbers

// Builds the same schedule the database builds at disbursement.
export function buildSchedule({ amount, months, ratePct, method = 'reducing', firstDue }) {
  const amt = Number(amount), n = Number(months);
  if (!(amt > 0) || !(n >= 1)) return [];
  const r = Number(ratePct) / 100 / 12;
  const pmt = r === 0 ? amt / n : (amt * r) / (1 - Math.pow(1 + r, -n));
  const start = firstDue ? new Date(firstDue) : addMonths(new Date(), 1);
  let bal = amt;
  const rows = [];
  for (let i = 1; i <= n; i++) {
    let interest, principal;
    if (method === 'flat') {
      interest = r0(amt * r);
      principal = i === n ? bal : Math.min(r0(amt / n), bal);
    } else {
      interest = r0(bal * r);
      principal = i === n ? bal : Math.min(Math.max(r0(pmt - interest), 0), bal);
    }
    bal -= principal;
    rows.push({ no: i, due: addMonths(start, i - 1), principal, interest, total: principal + interest });
  }
  return rows;
}
export function quote({ amount, months, ratePct, method, processingPct = 0, insurancePct = 0 }) {
  const rows = buildSchedule({ amount, months, ratePct, method });
  const interest = rows.reduce((s, r) => s + r.interest, 0);
  const fees = r0(amount * processingPct / 100) + r0(amount * insurancePct / 100);
  return {
    rows, interest, fees,
    first: rows[0] ? rows[0].total : 0,
    total: Number(amount) + interest,
  };
}
export function addMonths(d, n) {
  const x = new Date(d.getFullYear(), d.getMonth() + n, 1, 12);
  const day = Math.min(d.getDate(), new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate());
  x.setDate(day);
  return x;
}

// Same rules as apply_for_loan on the server: used only to give early feedback.
export function headroomOf({ savings, shares, locked, exposure }, multiple) {
  return Math.max((Number(savings) + Number(shares) - Number(locked)) * Number(multiple) - Number(exposure), 0);
}

/* ------------------------------ small helpers ---------------------------- */
export const rpc = (kit, token, name, body = {}) =>
  kit.sb(`/rest/v1/rpc/${name}`, { method: 'POST', token, body });

export function daysUntil(dateStr) {
  if (!dateStr) return null;
  const a = new Date(dateStr + 'T00:00:00'), b = new Date(); b.setHours(0, 0, 0, 0);
  return Math.round((a - b) / 86400000);
}
export function dueLabel(dateStr) {
  const d = daysUntil(dateStr);
  if (d === null) return 'No installment due';
  if (d === 0) return 'Due today';
  if (d === 1) return 'Due tomorrow';
  if (d > 1) return `Due in ${d} days`;
  return `${Math.abs(d)} day${d === -1 ? '' : 's'} overdue`;
}
export function ugandaPhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length < 9) return '';
  return '256' + digits.slice(-9);
}
export const waLink = (phone, text) => {
  const p = ugandaPhone(phone);
  return p ? `https://wa.me/${p}?text=${encodeURIComponent(text)}` : '';
};
export function paidPct(l) {
  if (l.stage === 'closed') return 100;
  if (Number(l.installments) > 0) return Math.round((Number(l.installments_paid) / Number(l.installments)) * 100);
  const base = Number(l.approved_amount || l.principal) || 1;
  return Math.max(0, Math.min(100, Math.round((1 - Number(l.outstanding_balance) / base) * 100)));
}

/* ------------------------------ background sync ------------------------ */
// How often every screen quietly re-checks for new data (milliseconds). Change it here, in one place.
export const SYNC_MS = 10000;

// Calls fn every `ms` milliseconds while the page is visible and online.
// - never overlaps itself (a slow request just skips the next beat)
// - refreshes straight away when the tab becomes visible again or the network returns
// - a failed beat is ignored; the next one retries
export function useAutoRefresh(fn, ms = SYNC_MS, enabled = true) {
  const fnRef = useRef(fn);
  useEffect(() => { fnRef.current = fn; });
  useEffect(() => {
    if (!enabled) return undefined;
    let busy = false;
    let stopped = false;
    const run = async () => {
      if (busy || stopped) return;
      if (typeof document !== 'undefined' && document.hidden) return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      busy = true;
      try { await fnRef.current(); } catch { /* keep the screen as it is; try again next beat */ } finally { busy = false; }
    };
    const id = setInterval(run, ms);
    const onVisible = () => { if (!document.hidden) run(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', run);
    return () => {
      stopped = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', run);
    };
  }, [ms, enabled]);
}

// Loads data for a screen. Keeps the previous data on screen while reloading, so
// refreshing never flashes a spinner. With { every: ms } it also re-fetches in
// the background. A result only lands if no newer request has started, so a slow
// background fetch can never overwrite fresher data from an action.
export function useLoader(fn, deps, opts = {}) {
  const every = opts.every || 0;
  const [state, setState] = useState({ data: null, loading: true, error: '' });
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  useEffect(() => { fnRef.current = fn; });
  const seq = useRef(0);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  useEffect(() => {
    const mine = ++seq.current;
    setState(s => ({ ...s, loading: true, error: '' }));
    fn().then(
      d => { if (alive.current && seq.current === mine) setState({ data: d, loading: false, error: '' }); },
      e => { if (alive.current && seq.current === mine) setState(s => ({ ...s, loading: false, error: (e && e.message) || 'Something went wrong' })); },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const refresh = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const d = await fnRef.current();
      if (alive.current && seq.current === mine) setState({ data: d, loading: false, error: '' });
    } catch { /* keep what is on screen */ }
  }, []);
  useAutoRefresh(refresh, every || SYNC_MS, every > 0);

  return { ...state, reload: () => setTick(t => t + 1), refresh };
}
