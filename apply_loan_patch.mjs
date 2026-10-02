// Run once from the project root:  node apply_loan_patch.mjs
// Wires the new loan system into src/App.jsx. It refuses to change anything
// unless every anchor is found, and keeps a backup at src/App.jsx.bak.
import fs from 'fs';

const path = 'src/App.jsx';
let s = fs.readFileSync(path, 'utf8');
if (s.includes("from './loans/kit.js'")) { console.log('Already patched. Nothing to do.'); process.exit(0); }
const before = s.split('\n').length;

const must = (cond, msg) => { if (!cond) { console.error('STOP: ' + msg + '. No changes were made.'); process.exit(1); } };
const cut = (startMarker, endMarker, replacement = '') => {
  const a = s.indexOf(startMarker); must(a >= 0, 'could not find: ' + startMarker.slice(0, 60));
  const b = s.indexOf(endMarker, a + 1); must(b > a, 'could not find end: ' + endMarker.slice(0, 60));
  s = s.slice(0, a) + replacement + s.slice(b);
};
const swap = (from, to, count = 1) => {
  must(s.split(from).length - 1 === count, `expected ${count} match(es) of: ${from.slice(0, 60)}`);
  s = s.split(from).join(to);
};

// 1. imports
swap("import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, AreaChart, Area, Legend } from 'recharts';",
"import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, AreaChart, Area, Legend } from 'recharts';\nimport { KitContext } from './loans/kit.js';\nimport MemberLoansTab from './loans/MemberLoans.jsx';\nimport LoanDesk from './loans/AdminLoans.jsx';");

// 2. shared kit for the loan screens
swap("function MemberApp({ profile, token, onLogout, themeMode, onToggleTheme }) {",
`// Everything the loan screens need from the host app, passed through context
// so the loans folder never imports App.jsx (no circular dependency).
const loanKit = {
  THEME, fmt, fmtDate, fmtDateTime, shortId, sb, useIsDesktop,
  Spinner, EmptyState, Badge, Avatar, GhostButton,
};

function MemberApp({ profile, token, onLogout, themeMode, onToggleTheme }) {`);

// 3. quiet reload so the loan screens stay mounted while data refreshes
swap("  const load = useCallback(async () => {\n    setLoading(true);", "  const load = useCallback(async (quiet) => {\n    if (!quiet) setLoading(true);", 2);

// 4. member side
cut("  async function applyForLoan(", "  const tabs = [");
cut("            {tab === 'loans' && (\n              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>\n                <PrimaryButton onClick={() => setShowLoanForm",
    "            {tab === 'activity' && (",
`            {tab === 'loans' && (
              <KitContext.Provider value={loanKit}>
                <MemberLoansTab profile={profile} token={token} onChanged={() => load(true)} />
              </KitContext.Provider>
            )}

`);
swap("  const [showLoanForm, setShowLoanForm] = useState(false);\n", "");
cut("function LoanApplyForm(", "function DesktopOverview(");

// 5. admin side
cut("  async function approveLoan(loan) {", "  async function recordTxn(");
cut("            {tab === 'loans' && (\n              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>\n                <div>\n                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Pending applications</div>",
    "            {tab === 'transactions' && (",
`            {tab === 'loans' && (
              <KitContext.Provider value={loanKit}>
                <LoanDesk profile={profile} token={token} perms={perms} savingsMap={savingsMap} sharesMap={sharesMap}
                  onViewMember={setViewMemberId} onChanged={() => load(true)} />
              </KitContext.Provider>
            )}

`);
cut("function ActiveLoanRow(", "function RecordTxnForm(");
swap("  const activeLoans = loansAll.filter(l => l.status === 'active');\n", "");

fs.copyFileSync(path, path + '.bak');
fs.writeFileSync(path, s);
console.log(`Done. App.jsx went from ${before} to ${s.split('\n').length} lines. Backup: ${path}.bak`);
