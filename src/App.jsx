import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import {
  Home, Landmark, Wallet, Users, LogOut, Plus, Check, X, ArrowUpRight,
  ArrowDownRight, Loader2, ShieldCheck, PieChart as PieIcon, Gift, FileText, Printer, Camera, Sun, Moon, Eye, EyeOff,
  PiggyBank, TrendingUp, Coins, Receipt, CreditCard, Sparkles, Bell, Megaphone
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, AreaChart, Area, Legend } from 'recharts';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://tupofpitveaifaemassc.supabase.co';
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable__jw3Hv0tG2wDnjvJ_8o8Qg_3RwRzn9F';

const LIGHT_PALETTE = {
  mode: 'light',
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
const DARK_PALETTE = {
  mode: 'dark',
  pine: '#2FD9AE',
  pineDark: '#0C1E1B',
  gold: '#F0C572',
  goldLight: '#F6D89A',
  paper: '#0A0F0E',
  surface: '#151E1C',
  ink: '#F2F3F0',
  inkSoft: '#8FA098',
  line: '#263230',
  success: '#34D399',
  danger: '#F87171',
};

// THEME is a single mutable object every component reads at render time.
// Toggling switches its contents in place; the app tree is then keyed by
// mode so React fully re-renders with the new values.
const THEME = { ...LIGHT_PALETTE };
function applyThemeMode(mode) {
  Object.assign(THEME, mode === 'dark' ? DARK_PALETTE : LIGHT_PALETTE);
}
function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1024);
  useEffect(() => {
    function onResize() { setIsDesktop(window.innerWidth >= 1024); }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return isDesktop;
}

const LOAN_MULTIPLIER = 3; // ceiling = (savings + shares) x multiplier, per SACCO credit policy

function fmt(n) {
  const num = Number(n || 0);
  return 'UGX ' + num.toLocaleString('en-US', { maximumFractionDigits: 0 });
}
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtDateTime(d) {
  if (!d) return '—';
  const dt = new Date(d);
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' · ' + dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}
function shortId(id) {
  if (!id) return '—';
  return id.slice(0, 8).toUpperCase();
}
const PAYMENT_MODES = [
  { value: 'cash', label: 'Cash' },
  { value: 'mobile_money', label: 'Mobile money' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'payroll', label: 'Payroll deduction' },
  { value: 'other', label: 'Other' },
];
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

async function uploadKycPhoto(token, userId, file, filename = 'photo.jpg') {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/kyc-photos/${userId}/${filename}`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': file.type || 'image/jpeg', 'x-upsert': 'true' },
    body: file,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error('Photo upload failed: ' + text);
  }
  return `${userId}/${filename}`;
}

async function getSignedPhotoUrl(token, path) {
  if (!path) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/kyc-photos/${path}`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: 3600 }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.signedURL ? `${SUPABASE_URL}/storage/v1${data.signedURL}` : null;
  } catch {
    return null;
  }
}

// Checks for a newer announcement than the last one this device has seen,
// and fires a browser notification if permission has been granted. The
// very first check on a device only "arms" the baseline — it never fires
// a notification for announcements that already existed before this
// device started checking, only for ones that arrive afterwards.
async function checkAndNotifyAnnouncements(token) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    const anns = await sb('/rest/v1/announcements?select=*&order=created_at.desc&limit=1', { token });
    const latest = anns && anns[0];
    if (!latest) return;
    const lastSeen = localStorage.getItem('amani_last_announcement_seen');
    if (lastSeen === latest.id) return;
    if (lastSeen !== null) {
      new Notification(latest.title, { body: latest.body, icon: '/icon-192.png' });
    }
    localStorage.setItem('amani_last_announcement_seen', latest.id);
  } catch { /* ignore — notifications are best-effort */ }
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
      background: disabled ? THEME.inkSoft : `linear-gradient(135deg, ${THEME.pine}, ${THEME.pineDark})`,
      color: '#fff', border: 'none', borderRadius: 10,
      padding: '10px 16px', fontWeight: 600, fontSize: 14, cursor: disabled ? 'default' : 'pointer',
      opacity: disabled ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      boxShadow: disabled ? 'none' : '0 3px 10px rgba(15,61,58,0.28)', transition: 'transform 0.1s',
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
    <div style={{
      background: THEME.surface, border: `1px solid ${THEME.line}`, borderRadius: 16, padding: 16,
      boxShadow: '0 1px 3px rgba(15,61,58,0.06), 0 1px 2px rgba(15,61,58,0.04)', ...style,
    }}>
      {children}
    </div>
  );
}
function Avatar({ name, photoUrl, size = 40 }) {
  const initials = (name || '?').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
  if (photoUrl) {
    return <img src={photoUrl} alt={name} style={{
      width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0,
      border: `2px solid ${THEME.surface}`, boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
    }} />;
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: `linear-gradient(135deg, ${THEME.goldLight}, ${THEME.gold})`,
      color: THEME.pineDark, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 700, fontSize: Math.round(size * 0.38), fontFamily: 'Fraunces, serif',
    }}>{initials}</div>
  );
}
function StatCard({ label, value, accent, icon: Icon }) {
  const color = accent || THEME.pine;
  return (
    <Card style={{ flex: 1, minWidth: 0, padding: 14 }}>
      {Icon && (
        <div style={{
          width: 30, height: 30, borderRadius: 9, background: color + '18',
          display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8,
        }}>
          <Icon size={15} color={color} />
        </div>
      )}
      <div style={{ fontSize: 11, color: THEME.inkSoft, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
      <div style={{ fontFamily: 'Fraunces, serif', fontSize: 18, color: THEME.ink, marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
    </Card>
  );
}
function QuickActions({ actions }) {
  return (
    <div style={{ display: 'flex', gap: 10 }}>
      {actions.map(a => (
        <button key={a.label} onClick={a.onClick} style={{
          flex: 1, background: THEME.surface, border: `1px solid ${THEME.line}`, borderRadius: 16,
          padding: '14px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
          cursor: 'pointer', boxShadow: '0 1px 3px rgba(15,61,58,0.06)',
        }}>
          <div style={{
            width: 38, height: 38, borderRadius: '50%', background: `linear-gradient(135deg, ${THEME.pine}, ${THEME.pineDark})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <a.icon size={17} color="#fff" />
          </div>
          <span style={{ fontSize: 11, fontWeight: 600, color: THEME.ink, textAlign: 'center' }}>{a.label}</span>
        </button>
      ))}
    </div>
  );
}
function NotificationPrompt() {
  const [permission, setPermission] = useState(() => (typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'));
  if (permission !== 'default') return null;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, background: THEME.pine + '12', border: `1px solid ${THEME.pine}33`,
      borderRadius: 12, padding: '10px 12px', marginBottom: 14,
    }}>
      <Bell size={16} color={THEME.pine} style={{ flexShrink: 0 }} />
      <span style={{ fontSize: 12, color: THEME.ink, flex: 1 }}>Get notified about new messages and updates.</span>
      <GhostButton style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => Notification.requestPermission().then(setPermission)}>
        Enable
      </GhostButton>
    </div>
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
function Header({ title, subtitle, onLogout, roleBadge, avatarUrl, avatarName, themeMode, onToggleTheme }) {
  return (
    <div style={{
      padding: '22px 20px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      background: `linear-gradient(135deg, ${THEME.pine}, ${THEME.pineDark})`, borderRadius: '0 0 24px 24px',
      boxShadow: '0 4px 16px rgba(10,43,41,0.25)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <Avatar name={avatarName || title} photoUrl={avatarUrl} size={44} />
        <div style={{ minWidth: 0 }}>
          <h1 style={{
            fontFamily: 'Fraunces, serif', fontSize: 19, color: '#fff', margin: 0,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{title}</h1>
          <p style={{
            color: 'rgba(255,255,255,0.72)', fontSize: 12, margin: '3px 0 0',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{subtitle}</p>
          {roleBadge && <div style={{ marginTop: 6 }}>{roleBadge}</div>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        {onToggleTheme && (
          <button onClick={onToggleTheme} title="Toggle theme" style={{
            background: 'rgba(255,255,255,0.14)', border: 'none', borderRadius: 10, padding: 9, cursor: 'pointer',
          }}>{themeMode === 'dark' ? <Sun size={16} color="#fff" /> : <Moon size={16} color="#fff" />}</button>
        )}
        <button onClick={onLogout} title="Sign out" style={{
          background: 'rgba(255,255,255,0.14)', border: 'none', borderRadius: 10, padding: 9, cursor: 'pointer',
        }}><LogOut size={16} color="#fff" /></button>
      </div>
    </div>
  );
}
function BottomNav({ tabs, active, onChange }) {
  const tight = tabs.length > 5;
  return (
    <div className="bottom-nav-scroll" style={{
      position: 'sticky', bottom: 0, background: THEME.surface, borderTop: `1px solid ${THEME.line}`,
      display: 'flex', overflowX: tight ? 'auto' : 'visible', padding: '8px 8px calc(8px + env(safe-area-inset-bottom))',
      boxShadow: '0 -2px 10px rgba(15,61,58,0.05)', WebkitOverflowScrolling: 'touch',
    }}>
      {tabs.map(t => (
        <button key={t.key} onClick={() => onChange(t.key)} style={{
          flex: tight ? '0 0 auto' : 1, minWidth: tight ? 68 : 0,
          background: active === t.key ? THEME.pine + '12' : 'none', border: 'none', cursor: 'pointer',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '7px 6px', borderRadius: 10,
          color: active === t.key ? THEME.pine : THEME.inkSoft, transition: 'background 0.15s', whiteSpace: 'nowrap',
        }}>
          <t.icon size={19} />
          <span style={{ fontSize: 11, fontWeight: 600 }}>{t.label}</span>
        </button>
      ))}
    </div>
  );
}

/* ------------------------------ auth screen ------------------------------ */

function AuthScreen({ onAuthed, themeMode, onToggleTheme }) {
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
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, position: 'relative' }}>
      {onToggleTheme && (
        <button onClick={onToggleTheme} title="Toggle theme" style={{
          position: 'absolute', top: 20, right: 20, background: THEME.surface, border: `1px solid ${THEME.line}`,
          borderRadius: 10, padding: 9, cursor: 'pointer',
        }}>{themeMode === 'dark' ? <Sun size={16} color={THEME.ink} /> : <Moon size={16} color={THEME.ink} />}</button>
      )}
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
          Git Group Home of Technology · CEO Frank Ssemakula
        </p>
      </div>
    </div>
  );
}

function buildAuditRows(profiles, savingsMap, sharesMap) {
  return profiles.map(m => ({
    'Full name': m.full_name,
    'Phone': m.phone || '',
    'NIN': m.nin || '',
    'Role': ROLE_LABELS[m.role] || m.role,
    'Status': m.status,
    'Savings balance': Number((savingsMap[m.id] || {}).balance || 0),
    'Shares balance': Number((sharesMap[m.id] || {}).balance || 0),
    'Next of kin': m.next_of_kin_name || '',
    'Next of kin phone': m.next_of_kin_phone || '',
    'Next of kin relationship': m.next_of_kin_relationship || '',
    'Joined': m.created_at ? fmtDate(m.created_at) : '',
  }));
}

function exportMembersExcel(profiles, savingsMap, sharesMap) {
  const rows = buildAuditRows(profiles, savingsMap, sharesMap);
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = Object.keys(rows[0] || {}).map(k => ({ wch: Math.max(k.length, 14) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Members');
  XLSX.writeFile(wb, `Amani-SACCO-Members-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function exportMembersPdf(profiles, savingsMap, sharesMap) {
  const rows = buildAuditRows(profiles, savingsMap, sharesMap);
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(15, 61, 58);
  doc.text('Amani SACCO — Member Register', 40, 40);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(110, 110, 110);
  doc.text(`Generated ${fmtDateTime(new Date())} · ${rows.length} members`, 40, 56);

  const columns = Object.keys(rows[0] || {});
  autoTable(doc, {
    startY: 72,
    head: [columns],
    body: rows.map(r => columns.map(c => (typeof r[c] === 'number' ? fmt(r[c]) : r[c]))),
    styles: { fontSize: 8, cellPadding: 5 },
    headStyles: { fillColor: [15, 61, 58], textColor: 255 },
    alternateRowStyles: { fillColor: [250, 248, 242] },
    margin: { left: 40, right: 40 },
  });

  doc.save(`Amani-SACCO-Members-${new Date().toISOString().slice(0, 10)}.pdf`);
}

function exportMembersWord(profiles, savingsMap, sharesMap) {
  const rows = buildAuditRows(profiles, savingsMap, sharesMap);
  const columns = Object.keys(rows[0] || {});
  const tableRows = rows.map(r => `<tr>${columns.map(c => `<td style="border:1px solid #ccc;padding:4px 8px;font-size:11px;">${r[c] ?? ''}</td>`).join('')}</tr>`).join('');
  const html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
    <head><meta charset="utf-8"><title>Amani SACCO Members</title></head>
    <body style="font-family:Calibri,Arial,sans-serif;">
      <h2 style="color:#0F3D3A;">Amani SACCO — Member Register</h2>
      <p style="color:#666;font-size:12px;">Generated ${fmtDateTime(new Date())} · ${rows.length} members</p>
      <table style="border-collapse:collapse;width:100%;">
        <thead><tr>${columns.map(c => `<th style="border:1px solid #ccc;padding:4px 8px;background:#0F3D3A;color:#fff;font-size:11px;text-align:left;">${c}</th>`).join('')}</tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
    </body>
    </html>`;
  const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Amani-SACCO-Members-${new Date().toISOString().slice(0, 10)}.doc`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function downloadStatementPdf({ profile, savings, shares, txns, certifiedRequest }) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const marginX = 44;
  let y = 56;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(15, 61, 58);
  doc.text('Amani SACCO', marginX, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(110, 110, 110);
  y += 16;
  doc.text(`${certifiedRequest ? 'Certified statement' : 'Mini statement'} · generated ${fmtDateTime(new Date())}`, marginX, y);

  y += 26;
  if (certifiedRequest) {
    doc.setFillColor(232, 245, 238);
    doc.rect(marginX, y - 12, 507, 26, 'F');
    doc.setTextColor(30, 120, 90);
    doc.setFontSize(10);
    doc.text(`Approved and certified ${fmtDateTime(certifiedRequest.decided_at)} · Ref ${shortId(certifiedRequest.id)}`, marginX + 8, y + 4);
    y += 30;
  }

  doc.setDrawColor(230, 230, 230);
  doc.setFillColor(250, 248, 242);
  doc.rect(marginX, y, 507, 64, 'F');
  doc.setTextColor(20, 20, 20);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(profile.full_name, marginX + 10, y + 18);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(90, 90, 90);
  doc.text(profile.phone || 'No phone on file', marginX + 10, y + 32);
  doc.setTextColor(20, 20, 20);
  doc.text(`Savings balance: ${fmt(savings.balance)}`, marginX + 10, y + 48);
  doc.text(`Shares balance: ${fmt(shares.balance)}`, marginX + 260, y + 48);
  y += 84;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(20, 20, 20);
  doc.text(`Last ${txns.length} transactions`, marginX, y);
  y += 14;

  doc.setFontSize(8.5);
  const colX = { date: marginX, type: marginX + 100, mode: marginX + 200, amount: marginX + 320, balance: marginX + 400, id: marginX + 470 };
  doc.setFont('helvetica', 'bold');
  doc.text('Date/time', colX.date, y);
  doc.text('Type', colX.type, y);
  doc.text('Mode', colX.mode, y);
  doc.text('Amount', colX.amount, y);
  doc.text('Balance', colX.balance, y);
  y += 4;
  doc.setDrawColor(200, 200, 200);
  doc.line(marginX, y, marginX + 507, y);
  y += 12;
  doc.setFont('helvetica', 'normal');

  txns.forEach(t => {
    if (y > 780) { doc.addPage(); y = 56; }
    const isCredit = ['deposit', 'loan_disbursement', 'dividend', 'share_purchase'].includes(t.type);
    doc.setTextColor(60, 60, 60);
    doc.text(fmtDateTime(t.created_at), colX.date, y, { maxWidth: 96 });
    doc.text(t.type.replace('_', ' '), colX.type, y, { maxWidth: 96 });
    doc.text((t.payment_mode || 'cash').replace('_', ' '), colX.mode, y, { maxWidth: 116 });
    doc.setTextColor(isCredit ? 30 : 180, isCredit ? 140 : 40, isCredit ? 90 : 40);
    doc.text(`${isCredit ? '+' : '-'}${fmt(t.amount)}`, colX.amount, y, { maxWidth: 76 });
    doc.setTextColor(60, 60, 60);
    doc.text(fmt(t.balance_after), colX.balance, y, { maxWidth: 76 });
    y += 16;
  });

  doc.save(`Amani-SACCO-Statement-${profile.full_name.replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.pdf`);
}

function StatementModal({ profile, savings, shares, txns, certifiedRequest, onClose }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(22,36,31,0.55)', zIndex: 50,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }}>
      <div style={{
        background: THEME.surface, width: '100%', maxWidth: 480, maxHeight: '88vh', overflowY: 'auto',
        borderRadius: '18px 18px 0 0', padding: 20,
      }} className="statement-sheet">
        <div className="statement-actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{certifiedRequest ? 'Certified statement' : 'Mini statement'}</div>
          <GhostButton onClick={onClose} style={{ padding: '6px 10px' }}><X size={14} /></GhostButton>
        </div>
        <div className="statement-actions" style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <PrimaryButton style={{ flex: 1 }} onClick={() => downloadStatementPdf({ profile, savings, shares, txns, certifiedRequest })}>
            <FileText size={14} /> Download PDF
          </PrimaryButton>
          <GhostButton onClick={() => window.print()}><Printer size={14} /></GhostButton>
        </div>
        <div id="statement-print-area">
          <div style={{ textAlign: 'center', marginBottom: 14 }}>
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: 18, color: THEME.pine }}>Amani SACCO</div>
            <div style={{ fontSize: 12, color: THEME.inkSoft }}>Member mini statement · generated {fmtDateTime(new Date())}</div>
          </div>
          {certifiedRequest && (
            <div style={{ background: THEME.success + '14', border: `1px solid ${THEME.success}`, borderRadius: 10, padding: '10px 12px', marginBottom: 14, fontSize: 12, color: THEME.success, display: 'flex', alignItems: 'center', gap: 8 }}>
              <ShieldCheck size={16} />
              <span>Approved and certified {fmtDateTime(certifiedRequest.decided_at)}. Reference: {shortId(certifiedRequest.id)}</span>
            </div>
          )}
          <div style={{ background: THEME.paper, borderRadius: 10, padding: 12, marginBottom: 14, fontSize: 12 }}>
            <div><b>{profile.full_name}</b></div>
            <div style={{ color: THEME.inkSoft }}>{profile.phone || 'No phone on file'}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
              <span>Savings balance</span><b>{fmt(savings.balance)}</b>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Shares balance</span><b>{fmt(shares.balance)}</b>
            </div>
          </div>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Last {txns.length} transactions</div>
          {txns.length === 0 ? <EmptyState text="No transactions yet." /> : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {txns.map(t => {
                const isCredit = ['deposit', 'loan_disbursement', 'dividend', 'share_purchase'].includes(t.type);
                return (
                  <div key={t.id} style={{ padding: '8px 0', borderBottom: `1px solid ${THEME.line}`, fontSize: 11.5 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                      <span style={{ textTransform: 'capitalize' }}>{t.type.replace('_', ' ')}</span>
                      <span style={{ color: isCredit ? THEME.success : THEME.danger }}>{isCredit ? '+' : '−'}{fmt(t.amount)}</span>
                    </div>
                    <div style={{ color: THEME.inkSoft, display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                      <span>{fmtDateTime(t.created_at)} · {(t.payment_mode || 'cash').replace('_', ' ')}</span>
                      <span>Bal: {fmt(t.balance_after)}</span>
                    </div>
                    <div style={{ color: THEME.inkSoft, fontFamily: 'monospace', marginTop: 1 }}>{shortId(t.id)}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #statement-print-area, #statement-print-area * { visibility: visible; }
          #statement-print-area { position: absolute; top: 0; left: 0; width: 100%; }
        }
      `}</style>
    </div>
  );
}

function MemberDetailModal({ memberId, token, onClose }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [photoUrl, setPhotoUrl] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [pf, sa, sh, ln, tx, da] = await Promise.all([
        sb(`/rest/v1/profiles?id=eq.${memberId}&select=*`, { token }),
        sb(`/rest/v1/savings_accounts?member_id=eq.${memberId}&select=*`, { token }),
        sb(`/rest/v1/shares?member_id=eq.${memberId}&select=*`, { token }),
        sb(`/rest/v1/loans?member_id=eq.${memberId}&select=*&order=applied_at.desc`, { token }),
        sb(`/rest/v1/transactions?member_id=eq.${memberId}&select=*&order=created_at.desc&limit=50`, { token }),
        sb(`/rest/v1/dividend_allocations?member_id=eq.${memberId}&select=*`, { token }),
      ]);
      const p = (pf || [])[0];
      if (p && p.photo_url) {
        const url = await getSignedPhotoUrl(token, p.photo_url);
        if (!cancelled) setPhotoUrl(url);
      }
      if (!cancelled) {
        setData({ profile: p, savings: (sa || [])[0] || { balance: 0 }, shares: (sh || [])[0] || { balance: 0 }, loans: ln || [], txns: tx || [], divAlloc: da || [] });
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [memberId, token]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(22,36,31,0.55)', zIndex: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div style={{ background: THEME.surface, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto', borderRadius: '18px 18px 0 0', padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Applicant profile</div>
          <GhostButton onClick={onClose}><X size={14} /></GhostButton>
        </div>
        {loading || !data ? <Spinner /> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Avatar name={data.profile?.full_name} photoUrl={photoUrl} size={56} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{data.profile?.full_name}</div>
                <div style={{ fontSize: 12, color: THEME.inkSoft }}>{data.profile?.phone || 'No phone on file'}</div>
                <div style={{ fontSize: 12, color: THEME.inkSoft }}>NIN: {data.profile?.nin || 'Not on file'}</div>
                <div style={{ fontSize: 12, color: THEME.inkSoft, marginTop: 4 }}>
                  Next of kin: {data.profile?.next_of_kin_name
                    ? `${data.profile.next_of_kin_name} (${data.profile.next_of_kin_relationship || 'relationship not stated'}) · ${data.profile.next_of_kin_phone || 'no phone'}`
                    : 'Not on file'}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <StatCard label="Savings" value={fmt(data.savings.balance)} icon={PiggyBank} />
              <StatCard label="Shares" value={fmt(data.shares.balance)} icon={Coins} />
              <StatCard label="Loan ceiling" value={fmt((Number(data.savings.balance) + Number(data.shares.balance)) * LOAN_MULTIPLIER)} accent={THEME.gold} icon={Landmark} />
            </div>

            <div>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Loan history</div>
              {data.loans.length === 0 ? <EmptyState text="No previous loans." /> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {data.loans.map(l => (
                    <div key={l.id} style={{ border: `1px solid ${THEME.line}`, borderRadius: 10, padding: 10, fontSize: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <b>{fmt(l.principal)}</b>
                        <Badge color={statusColor(l.status)}>{l.status}</Badge>
                      </div>
                      <div style={{ color: THEME.inkSoft, marginTop: 3 }}>
                        {fmtDate(l.applied_at)} · {l.term_months} months{l.purpose ? ` · ${l.purpose}` : ''}
                      </div>
                      {l.status === 'active' && <div style={{ color: THEME.inkSoft, marginTop: 2 }}>Outstanding: <b style={{ color: THEME.ink }}>{fmt(l.outstanding_balance)}</b></div>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Transaction history</div>
              {data.txns.length === 0 ? <EmptyState text="No transactions yet." /> : data.txns.map(t => <TxnRow key={t.id} t={t} />)}
            </div>

            <div>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Dividends received</div>
              {data.divAlloc.length === 0 ? <EmptyState text="No dividends yet." /> : data.divAlloc.map(d => (
                <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${THEME.line}`, fontSize: 12 }}>
                  <span>{fmtDate(d.created_at)}</span><b>{fmt(d.amount)}</b>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const TIERS = [
  { name: 'Bronze', min: 0 },
  { name: 'Silver', min: 100000 },
  { name: 'Gold', min: 500000 },
  { name: 'Platinum', min: 2000000 },
];
function getTierProgress(total) {
  let idx = 0;
  for (let i = 0; i < TIERS.length; i++) if (total >= TIERS[i].min) idx = i;
  const current = TIERS[idx];
  const next = TIERS[idx + 1];
  if (!next) return { current, next: null, pct: 100 };
  const pct = Math.min(100, Math.round(((total - current.min) / (next.min - current.min)) * 100));
  return { current, next, pct };
}
function WithdrawalRequestCard({ savings, withdrawalRequests, onRequest }) {
  const [showForm, setShowForm] = useState(false);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const balance = Number(savings.balance);
  const hasPending = withdrawalRequests.some(r => r.status === 'pending');
  const amountNum = Number(amount);
  const overBalance = amountNum > balance;

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>Withdraw savings</div>
        {balance > 0 && !hasPending && (
          <GhostButton onClick={() => setShowForm(v => !v)}>{showForm ? 'Cancel' : 'Request'}</GhostButton>
        )}
      </div>
      {balance <= 0 ? (
        <p style={{ fontSize: 12, color: THEME.inkSoft, margin: 0 }}>You have no savings balance to withdraw from yet.</p>
      ) : hasPending ? (
        <p style={{ fontSize: 12, color: THEME.inkSoft, margin: 0 }}>You already have a withdrawal request pending review.</p>
      ) : showForm ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 6 }}>
          <p style={{ fontSize: 11.5, color: THEME.inkSoft, margin: 0 }}>Available: {fmt(balance)}</p>
          <Field label="Amount (UGX)"><input type="number" min="1" max={balance} value={amount} onChange={e => setAmount(e.target.value)} style={inputStyle} /></Field>
          {overBalance && <div style={{ fontSize: 12, color: THEME.danger }}>You can't request more than your available savings.</div>}
          <Field label="Reason (optional)"><input value={note} onChange={e => setNote(e.target.value)} style={inputStyle} placeholder="e.g. Medical expense" /></Field>
          <PrimaryButton disabled={busy || !amount || overBalance || amountNum <= 0} onClick={async () => {
            setBusy(true);
            try { await onRequest(amount, note); setShowForm(false); setAmount(''); setNote(''); } finally { setBusy(false); }
          }}>{busy ? <Loader2 size={15} className="spin" /> : 'Submit request'}</PrimaryButton>
        </div>
      ) : (
        <p style={{ fontSize: 12, color: THEME.inkSoft, margin: 0 }}>Request a withdrawal and a cashier or manager will process it.</p>
      )}
      {withdrawalRequests.length > 0 && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {withdrawalRequests.slice(0, 3).map(r => (
            <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '6px 0', borderTop: `1px solid ${THEME.line}` }}>
              <span>{fmtDate(r.requested_at)} · {fmt(r.amount)}</span>
              <Badge color={statusColor(r.status === 'approved' ? 'active' : r.status)}>{r.status}</Badge>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function TierProgressCard({ total }) {
  const { current, next, pct } = getTierProgress(total);
  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 26, height: 26, borderRadius: '50%', background: `linear-gradient(135deg, ${THEME.gold}, ${THEME.pine})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Coins size={13} color="#fff" />
          </div>
          <span style={{ fontWeight: 700, fontSize: 13 }}>{current.name} member</span>
        </div>
        {next && <span style={{ fontSize: 11, color: THEME.inkSoft }}>{pct}% to {next.name}</span>}
      </div>
      {next ? (
        <>
          <div style={{ height: 8, borderRadius: 4, background: THEME.line, marginTop: 10, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, borderRadius: 4, background: `linear-gradient(90deg, ${THEME.gold}, ${THEME.pine})` }} />
          </div>
          <div style={{ fontSize: 11, color: THEME.inkSoft, marginTop: 6 }}>{fmt(next.min - total)} more in savings + shares to reach {next.name}</div>
        </>
      ) : (
        <div style={{ fontSize: 11, color: THEME.inkSoft, marginTop: 8 }}>You've reached the highest tier — well done.</div>
      )}
    </Card>
  );
}
function getMemberInsight({ total, tierInfo, activeLoan, pendingLoan }) {
  if (pendingLoan) {
    return { text: `Your loan application for ${fmt(pendingLoan.principal)} is awaiting review.`, action: null };
  }
  if (activeLoan) {
    return { text: `You have ${fmt(activeLoan.outstanding_balance)} outstanding on your loan. Keep repayments up to stay in good standing.`, action: null };
  }
  if (tierInfo.next) {
    return { text: `You're ${fmt(tierInfo.next.min - total)} away from ${tierInfo.next.name} tier. Keep saving!`, action: null };
  }
  return { text: `You're all caught up, and at our top membership tier. Great work growing your savings.`, action: null };
}

function BalanceHeroCard({ savings, shares }) {
  const [hidden, setHidden] = useState(false);
  const total = Number(savings.balance) + Number(shares.balance);
  return (
    <div style={{
      background: `linear-gradient(135deg, ${THEME.pine}, ${THEME.pineDark})`, borderRadius: 20, padding: 22,
      color: '#fff', boxShadow: THEME.mode === 'dark' ? '0 8px 24px rgba(0,0,0,0.4)' : '0 8px 24px rgba(15,61,58,0.22)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', fontWeight: 600, letterSpacing: 0.4 }}>TOTAL BALANCE</span>
        <button onClick={() => setHidden(h => !h)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
          {hidden ? <EyeOff size={16} color="rgba(255,255,255,0.75)" /> : <Eye size={16} color="rgba(255,255,255,0.75)" />}
        </button>
      </div>
      <div style={{ fontFamily: 'Fraunces, serif', fontSize: 32, marginTop: 6, letterSpacing: -0.5 }}>
        {hidden ? '••••••••' : fmt(total)}
      </div>
      <div style={{ display: 'flex', gap: 18, marginTop: 16 }}>
        <div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)' }}>Savings</div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{hidden ? '••••' : fmt(savings.balance)}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)' }}>Shares</div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{hidden ? '••••' : fmt(shares.balance)}</div>
        </div>
      </div>
    </div>
  );
}

function DonutChart({ data, colors, size = 130 }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <div style={{ width: size, height: size, position: 'relative', flexShrink: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius="68%" outerRadius="100%" paddingAngle={2} stroke="none">
              {data.map((d, i) => <Cell key={d.name} fill={colors[i % colors.length]} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', pointerEvents: 'none',
        }}>
          <div style={{ fontFamily: 'Fraunces, serif', fontSize: 17, color: THEME.ink }}>
            {total > 0 ? Math.round((data[0]?.value || 0) / total * 100) : 0}%
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
        {data.map((d, i) => (
          <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: colors[i % colors.length], flexShrink: 0 }} />
            <span style={{ color: THEME.inkSoft, flexShrink: 0 }}>{d.name}</span>
            <span style={{ fontWeight: 700, color: THEME.ink }}>{total > 0 ? Math.round(d.value / total * 100) : 0}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SaccoCard({ totalAssets }) {
  return (
    <div style={{
      background: `linear-gradient(135deg, ${THEME.pineDark}, ${THEME.pine})`, borderRadius: 20, padding: 22,
      color: '#fff', position: 'relative', overflow: 'hidden',
      boxShadow: THEME.mode === 'dark' ? '0 8px 24px rgba(0,0,0,0.4)' : '0 8px 24px rgba(15,61,58,0.22)',
    }}>
      <div style={{
        position: 'absolute', right: -30, top: -30, width: 140, height: 140, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(255,255,255,0.08), transparent 70%)',
      }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ fontFamily: 'Fraunces, serif', fontSize: 16, letterSpacing: 0.5 }}>AMANI SACCO</div>
        <Badge color={THEME.gold}>Active</Badge>
      </div>
      <div style={{ marginTop: 22 }}>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)' }}>Total institution assets</div>
        <div style={{ fontFamily: 'Fraunces, serif', fontSize: 26, marginTop: 4 }}>{fmt(totalAssets)}</div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 20 }}>
        <div style={{ fontSize: 12, letterSpacing: 2, color: 'rgba(255,255,255,0.7)' }}>•••• •••• •••• SACCO</div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)' }}>as of {fmtDate(new Date())}</div>
      </div>
    </div>
  );
}

function AutoDebitCard({ memberName }) {
  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{
        background: 'linear-gradient(135deg, #3B5BDB, #1E3A8A)', borderRadius: '16px 16px 0 0',
        padding: 20, color: '#fff', position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', right: -20, top: -20, width: 120, height: 120, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,255,255,0.12), transparent 70%)',
        }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>AUTO-SAVE CARD</div>
            <div style={{ fontSize: 13, marginTop: 2 }}>{memberName}</div>
          </div>
          <span style={{
            background: THEME.gold, color: '#3B2A00', fontSize: 10, fontWeight: 700,
            padding: '4px 9px', borderRadius: 999, display: 'flex', alignItems: 'center', gap: 4,
          }}><Sparkles size={11} /> COMING SOON</span>
        </div>
        <div style={{ marginTop: 22, display: 'flex', alignItems: 'center', gap: 10 }}>
          <CreditCard size={22} color="rgba(255,255,255,0.85)" />
          <div style={{ fontSize: 17, letterSpacing: 3, fontFamily: 'monospace' }}>•••• •••• •••• ••••</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 20 }}>
          <div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.6)' }}>VALID THRU</div>
            <div style={{ fontSize: 12 }}>MM / YY</div>
          </div>
          <div style={{ display: 'flex' }}>
            <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(255,255,255,0.85)' }} />
            <div style={{ width: 22, height: 22, borderRadius: '50%', background: THEME.gold, marginLeft: -10 }} />
          </div>
        </div>
      </div>
      <div style={{ padding: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>Automatic monthly savings</div>
        <p style={{ fontSize: 12, color: THEME.inkSoft, margin: '0 0 12px', lineHeight: 1.5 }}>
          Soon you'll be able to link a card and have a fixed amount moved into your savings automatically every month —
          no need to visit the SACCO or remember to deposit.
        </p>
        <button disabled style={{
          width: '100%', padding: '11px 0', borderRadius: 10, border: `1px solid ${THEME.line}`,
          background: THEME.paper, color: THEME.inkSoft, fontWeight: 600, fontSize: 13, cursor: 'not-allowed',
        }}>
          Add a card — coming soon
        </button>
      </div>
    </Card>
  );
}

function ProfileTab({ profile, token, photoUrl }) {
  const [nokName, setNokName] = useState(profile.next_of_kin_name || '');
  const [nokPhone, setNokPhone] = useState(profile.next_of_kin_phone || '');
  const [nokRel, setNokRel] = useState(profile.next_of_kin_relationship || '');
  const [phone, setPhone] = useState(profile.phone || '');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [myRequests, setMyRequests] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(true);

  const loadRequests = useCallback(async () => {
    setLoadingRequests(true);
    const rows = await sb(`/rest/v1/profile_change_requests?member_id=eq.${profile.id}&select=*&order=requested_at.desc&limit=5`, { token });
    setMyRequests(rows || []);
    setLoadingRequests(false);
  }, [profile.id, token]);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  const hasPending = myRequests.some(r => r.status === 'pending');

  function handleFile(f) {
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  async function submitRequest() {
    setError(''); setBusy(true);
    try {
      let newPhotoPath = null;
      if (file) newPhotoPath = await uploadKycPhoto(token, profile.id, file, 'pending-photo.jpg');
      const body = { member_id: profile.id };
      if (phone.trim() !== (profile.phone || '')) body.new_phone = phone.trim();
      if (nokName.trim() !== (profile.next_of_kin_name || '')) body.new_next_of_kin_name = nokName.trim();
      if (nokPhone.trim() !== (profile.next_of_kin_phone || '')) body.new_next_of_kin_phone = nokPhone.trim();
      if (nokRel.trim() !== (profile.next_of_kin_relationship || '')) body.new_next_of_kin_relationship = nokRel.trim();
      if (newPhotoPath) body.new_photo_url = newPhotoPath;
      if (Object.keys(body).length <= 1) { setError('Change something before submitting.'); setBusy(false); return; }
      await sb('/rest/v1/profile_change_requests', { method: 'POST', token, headers: { Prefer: 'return=minimal' }, body });
      setFile(null); setPreview(null);
      await loadRequests();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Card style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Avatar name={profile.full_name} photoUrl={photoUrl} size={56} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{profile.full_name}</div>
          <div style={{ fontSize: 12, color: THEME.inkSoft }}>{profile.phone || 'No phone on file'}</div>
          <div style={{ fontSize: 12, color: THEME.inkSoft }}>NIN: {profile.nin || 'Not on file'}</div>
        </div>
      </Card>
      <AutoDebitCard memberName={profile.full_name} />
      <Card>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Update your details</div>
        <p style={{ fontSize: 12, color: THEME.inkSoft, margin: '0 0 12px' }}>
          Changes to your photo, phone, or next of kin go to a manager for approval before they take effect — this
          protects your account from unauthorized changes.
        </p>
        {hasPending && (
          <div style={{ fontSize: 12, color: THEME.gold, background: THEME.gold + '14', border: `1px solid ${THEME.gold}55`, borderRadius: 8, padding: '8px 10px', marginBottom: 12 }}>
            You have a change request awaiting approval. You can still browse your details below, but wait for that one to be decided before submitting another.
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            {preview && <img src={preview} alt="New photo preview" style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover' }} />}
            <label style={{ cursor: hasPending ? 'default' : 'pointer' }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600,
                color: hasPending ? THEME.inkSoft : THEME.pine, border: `1px solid ${hasPending ? THEME.line : THEME.pine}`,
                borderRadius: 10, padding: '7px 12px',
              }}>
                <Camera size={13} /> {preview ? 'Choose a different photo' : 'Propose a new photo'}
              </span>
              <input type="file" accept="image/*" disabled={hasPending} style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
            </label>
          </div>
          <Field label="Phone number">
            <input value={phone} onChange={e => setPhone(e.target.value)} disabled={hasPending} style={inputStyle} />
          </Field>
          <Field label="Next of kin — full name">
            <input value={nokName} onChange={e => setNokName(e.target.value)} disabled={hasPending} style={inputStyle} placeholder="e.g. Jane Doe" />
          </Field>
          <Field label="Next of kin — relationship">
            <input value={nokRel} onChange={e => setNokRel(e.target.value)} disabled={hasPending} style={inputStyle} placeholder="e.g. Spouse, Parent, Sibling" />
          </Field>
          <Field label="Next of kin — phone number">
            <input value={nokPhone} onChange={e => setNokPhone(e.target.value)} disabled={hasPending} style={inputStyle} placeholder="e.g. 07XX XXX XXX" />
          </Field>
          {error && <div style={{ color: THEME.danger, fontSize: 12 }}>{error}</div>}
          <PrimaryButton disabled={busy || hasPending} onClick={submitRequest}>
            {busy ? <Loader2 size={15} className="spin" /> : 'Submit for approval'}
          </PrimaryButton>
        </div>
      </Card>
      {!loadingRequests && myRequests.length > 0 && (
        <Card>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Your change requests</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {myRequests.map(r => (
              <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '6px 0', borderTop: `1px solid ${THEME.line}` }}>
                <span>{fmtDate(r.requested_at)}</span>
                <Badge color={statusColor(r.status === 'approved' ? 'active' : r.status)}>{r.status}</Badge>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

/* ------------------------------ member app ------------------------------ */

function MemberApp({ profile, token, onLogout, themeMode, onToggleTheme }) {
  const [tab, setTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [savings, setSavings] = useState({ balance: 0 });
  const [shares, setShares] = useState({ balance: 0 });
  const [loans, setLoans] = useState([]);
  const [txns, setTxns] = useState([]);
  const [divAlloc, setDivAlloc] = useState([]);
  const [divMap, setDivMap] = useState({});
  const [showLoanForm, setShowLoanForm] = useState(false);
  const [showStatement, setShowStatement] = useState(false);
  const [statementRequests, setStatementRequests] = useState([]);
  const [viewCertifiedRequest, setViewCertifiedRequest] = useState(null);
  const [myPhotoUrl, setMyPhotoUrl] = useState(null);
  const [withdrawalRequests, setWithdrawalRequests] = useState([]);
  const [announcements, setAnnouncements] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    const [sa, sh, ln, tx, da, dv, sr, wr, ann] = await Promise.all([
      sb(`/rest/v1/savings_accounts?member_id=eq.${profile.id}&select=*`, { token }),
      sb(`/rest/v1/shares?member_id=eq.${profile.id}&select=*`, { token }),
      sb(`/rest/v1/loans?member_id=eq.${profile.id}&select=*&order=applied_at.desc`, { token }),
      sb(`/rest/v1/transactions?member_id=eq.${profile.id}&select=*&order=created_at.desc&limit=30`, { token }),
      sb(`/rest/v1/dividend_allocations?member_id=eq.${profile.id}&select=*`, { token }),
      sb(`/rest/v1/dividends?select=*`, { token }),
      sb(`/rest/v1/statement_requests?member_id=eq.${profile.id}&select=*&order=requested_at.desc&limit=5`, { token }),
      sb(`/rest/v1/withdrawal_requests?member_id=eq.${profile.id}&select=*&order=requested_at.desc&limit=10`, { token }),
      sb(`/rest/v1/announcements?select=*&order=created_at.desc&limit=20`, { token }),
    ]);
    setSavings(sa[0] || { balance: 0 });
    setShares(sh[0] || { balance: 0 });
    setLoans(ln || []);
    setTxns(tx || []);
    setDivAlloc(da || []);
    const m = {}; (dv || []).forEach(d => { m[d.id] = d.year; });
    setDivMap(m);
    setStatementRequests(sr || []);
    setWithdrawalRequests(wr || []);
    setAnnouncements(ann || []);
    setLoading(false);
  }, [profile.id, token]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (profile.photo_url) getSignedPhotoUrl(token, profile.photo_url).then(setMyPhotoUrl); }, [profile.photo_url, token]);
  useEffect(() => {
    checkAndNotifyAnnouncements(token);
    const interval = setInterval(() => checkAndNotifyAnnouncements(token), 120000);
    return () => clearInterval(interval);
  }, [token]);

  async function requestWithdrawal(amount, note) {
    await sb('/rest/v1/withdrawal_requests', {
      method: 'POST', token, headers: { Prefer: 'return=minimal' },
      body: { member_id: profile.id, amount: Number(amount), note },
    });
    await load();
  }

  async function requestStatement() {
    await sb('/rest/v1/statement_requests', { method: 'POST', token, headers: { Prefer: 'return=minimal' }, body: { member_id: profile.id } });
    await load();
  }

  const activeLoan = loans.find(l => l.status === 'active');
  const pendingLoan = loans.find(l => l.status === 'pending');

  async function applyForLoan(principal, term_months, purpose, overCeiling, repaymentPlan) {
    await sb('/rest/v1/loans', {
      method: 'POST', token,
      body: {
        member_id: profile.id, principal: Number(principal), term_months: Number(term_months),
        purpose, status: 'pending', flagged_over_ceiling: !!overCeiling, repayment_plan: repaymentPlan || null,
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
    { key: 'messages', label: 'Messages', icon: Megaphone },
    { key: 'profile', label: 'Profile', icon: Users },
  ];

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', minHeight: '100vh', background: THEME.paper, display: 'flex', flexDirection: 'column' }}>
      <Header title={profile.full_name} subtitle="Member" onLogout={onLogout}
        avatarUrl={myPhotoUrl} avatarName={profile.full_name} themeMode={themeMode} onToggleTheme={onToggleTheme}
        roleBadge={<Badge color={THEME.pine}>member</Badge>} />

      <div style={{ flex: 1, padding: '0 20px 20px', overflowY: 'auto' }}>
        {loading ? <Spinner /> : (
          <>
            {tab === 'overview' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <NotificationPrompt />
                <div>
                  <div style={{ fontFamily: 'Fraunces, serif', fontSize: 20, color: THEME.ink }}>Hi, {profile.full_name.split(' ')[0]}</div>
                  <div style={{ fontSize: 13, color: THEME.inkSoft, marginTop: 2 }}>Here's where your savings stand today</div>
                </div>
                <BalanceHeroCard savings={savings} shares={shares} />
                <QuickActions actions={[
                  { label: 'Apply loan', icon: Landmark, onClick: () => setTab('loans') },
                  { label: 'Statement', icon: FileText, onClick: () => setShowStatement(true) },
                  { label: 'Activity', icon: Receipt, onClick: () => setTab('activity') },
                ]} />
                <TierProgressCard total={Number(savings.balance) + Number(shares.balance)} />
                {(() => {
                  const tierInfo = getTierProgress(Number(savings.balance) + Number(shares.balance));
                  const insight = getMemberInsight({ total: Number(savings.balance) + Number(shares.balance), tierInfo, activeLoan, pendingLoan });
                  return (
                    <Card style={{ border: `1px solid ${THEME.pine}33`, background: THEME.mode === 'dark' ? THEME.pine + '14' : THEME.pine + '08' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <TrendingUp size={16} color={THEME.pine} />
                        <span style={{ fontWeight: 700, fontSize: 13, color: THEME.pine }}>Insight</span>
                      </div>
                      <p style={{ fontSize: 13, color: THEME.ink, margin: 0, lineHeight: 1.5 }}>{insight.text}</p>
                    </Card>
                  );
                })()}
                <div style={{ display: 'flex', gap: 10 }}>
                  <StatCard label="Savings" value={fmt(savings.balance)} accent={THEME.pine} icon={PiggyBank} />
                  <StatCard label="Shares" value={fmt(shares.balance)} accent={THEME.gold} icon={Coins} />
                </div>
                {activeLoan && (
                  <div onClick={() => setTab('loans')} style={{ cursor: 'pointer' }}>
                    <Card>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontWeight: 700, fontSize: 14 }}>Active loan</span>
                        <Badge color={statusColor(activeLoan.status)}>{activeLoan.status}</Badge>
                      </div>
                      <div style={{ fontFamily: 'Fraunces, serif', fontSize: 20, color: THEME.ink }}>{fmt(activeLoan.outstanding_balance)}</div>
                      <div style={{ fontSize: 12, color: THEME.inkSoft, marginTop: 2 }}>outstanding of {fmt(activeLoan.principal)} principal</div>
                    </Card>
                  </div>
                )}
                {txns.length > 0 && (
                  <Card>
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>Transaction breakdown</div>
                    <DonutChart
                      data={Object.entries(txns.reduce((acc, t) => { acc[t.type] = (acc[t.type] || 0) + Number(t.amount); return acc; }, {}))
                        .map(([name, value]) => ({ name: name.replace('_', ' '), value }))
                        .sort((a, b) => b.value - a.value)}
                      colors={[THEME.pine, THEME.gold, THEME.danger, THEME.success]}
                    />
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
                    savingsBalance={Number(savings.balance)}
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
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>Transactions</div>
                    <GhostButton onClick={() => setShowStatement(true)}><FileText size={14} /> Mini statement</GhostButton>
                  </div>
                  {txns.length === 0 ? <EmptyState text="No transactions yet." /> : txns.map(t => <TxnRow key={t.id} t={t} />)}
                </Card>
                <Card>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>Certified statement</div>
                    {!statementRequests.some(r => r.status === 'pending') && (
                      <GhostButton onClick={requestStatement}>Request one</GhostButton>
                    )}
                  </div>
                  <p style={{ fontSize: 12, color: THEME.inkSoft, margin: '0 0 10px' }}>
                    Need an officially approved statement (e.g. for a bank or employer)? Request one and a manager will sign off on it.
                  </p>
                  {statementRequests.length === 0 ? <EmptyState text="No statement requests yet." /> : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {statementRequests.map(r => (
                        <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${THEME.line}`, fontSize: 12 }}>
                          <span>Requested {fmtDate(r.requested_at)}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Badge color={statusColor(r.status === 'approved' ? 'active' : r.status)}>{r.status}</Badge>
                            {r.status === 'approved' && (
                              <GhostButton onClick={() => setViewCertifiedRequest(r)} style={{ padding: '5px 10px', fontSize: 11 }}>View</GhostButton>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
                <WithdrawalRequestCard savings={savings} withdrawalRequests={withdrawalRequests} onRequest={requestWithdrawal} />
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

            {tab === 'messages' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <NotificationPrompt />
                {announcements.length === 0 ? <EmptyState text="No messages from the SACCO yet." /> : announcements.map(a => (
                  <Card key={a.id}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <Megaphone size={15} color={THEME.pine} />
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{a.title}</span>
                    </div>
                    <p style={{ fontSize: 13, color: THEME.ink, margin: 0, lineHeight: 1.5 }}>{a.body}</p>
                    <div style={{ fontSize: 11, color: THEME.inkSoft, marginTop: 8 }}>{fmtDateTime(a.created_at)}</div>
                  </Card>
                ))}
              </div>
            )}

            {tab === 'profile' && (
              <ProfileTab profile={profile} token={token} photoUrl={myPhotoUrl} />
            )}
          </>
        )}
      </div>
      {showStatement && (
        <StatementModal profile={profile} savings={savings} shares={shares} txns={txns} onClose={() => setShowStatement(false)} />
      )}
      {viewCertifiedRequest && (
        <StatementModal profile={profile} savings={savings} shares={shares} txns={txns} certifiedRequest={viewCertifiedRequest} onClose={() => setViewCertifiedRequest(null)} />
      )}

      <BottomNav tabs={tabs} active={tab} onChange={setTab} />
    </div>
  );
}

function TxnRow({ t, expandable = true }) {
  const [open, setOpen] = useState(false);
  const isAdjustment = t.type === 'balance_adjustment' || t.type === 'shares_adjustment';
  const isCredit = ['deposit', 'loan_disbursement', 'dividend', 'share_purchase'].includes(t.type);
  return (
    <div style={{ borderBottom: `1px solid ${THEME.line}` }}>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', cursor: expandable ? 'pointer' : 'default' }}
        onClick={() => expandable && setOpen(o => !o)}
      >
        <div style={{
          width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          background: (isAdjustment ? THEME.gold : isCredit ? THEME.success : THEME.danger) + '1a',
        }}>
          {isAdjustment ? <FileText size={14} color={THEME.gold} /> : isCredit ? <ArrowDownRight size={15} color={THEME.success} /> : <ArrowUpRight size={15} color={THEME.danger} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, textTransform: 'capitalize' }}>
            {isAdjustment ? `Opening ${t.type === 'shares_adjustment' ? 'shares' : 'savings'} balance` : t.type.replace('_', ' ')}
          </div>
          <div style={{ fontSize: 11, color: THEME.inkSoft, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {fmtDateTime(t.created_at)}{t.notes ? ` · ${t.notes}` : ''}
          </div>
        </div>
        <div style={{ fontWeight: 700, fontSize: 13, color: isAdjustment ? THEME.gold : isCredit ? THEME.success : THEME.danger, whiteSpace: 'nowrap' }}>
          {isAdjustment ? '' : isCredit ? '+' : '−'}{fmt(t.amount)}
        </div>
      </div>
      {open && (
        <div style={{ padding: '2px 0 12px 40px', fontSize: 12, color: THEME.inkSoft, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div>Transaction ID: <span style={{ fontFamily: 'monospace' }}>{shortId(t.id)}</span></div>
          <div>Payment mode: <span style={{ textTransform: 'capitalize' }}>{(t.payment_mode || 'cash').replace('_', ' ')}</span></div>
          <div>Balance after: <b style={{ color: THEME.ink }}>{fmt(t.balance_after)}</b></div>
        </div>
      )}
    </div>
  );
}

function LoanApplyForm({ onSubmit, onCancel, maxCeiling = 0, savingsBalance = 0 }) {
  const [principal, setPrincipal] = useState('');
  const [term, setTerm] = useState('12');
  const [purpose, setPurpose] = useState('');
  const [repaymentPlan, setRepaymentPlan] = useState('');
  const [busy, setBusy] = useState(false);
  const overCeiling = Number(principal) > maxCeiling && maxCeiling > 0;
  const isSpecial = Number(principal) > 2 * savingsBalance && Number(principal) > 0;
  const canSubmit = principal && (!isSpecial || repaymentPlan.trim().length > 0);
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
        {isSpecial && (
          <div style={{ fontSize: 12, color: THEME.gold, background: THEME.gold + '14', border: `1px solid ${THEME.gold}55`, borderRadius: 8, padding: '8px 10px' }}>
            This is more than 2× your savings — that makes it a <b>special loan request</b>. Describe your repayment
            plan below; a manager will review it specifically because of the higher risk.
          </div>
        )}
        <Field label="Term (months)"><input type="number" min="1" required value={term} onChange={e => setTerm(e.target.value)} style={inputStyle} /></Field>
        <Field label="Purpose"><input value={purpose} onChange={e => setPurpose(e.target.value)} style={inputStyle} placeholder="e.g. School fees" /></Field>
        {isSpecial && (
          <Field label="Repayment plan (required for special loans)">
            <textarea value={repaymentPlan} onChange={e => setRepaymentPlan(e.target.value)} style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }}
              placeholder="e.g. I will repay 200,000 UGX monthly from my business income, starting next month" />
          </Field>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <PrimaryButton style={{ flex: 1 }} disabled={busy || !canSubmit} onClick={async () => {
            setBusy(true);
            try { await onSubmit(principal, term, purpose, overCeiling || isSpecial, isSpecial ? repaymentPlan.trim() : ''); } finally { setBusy(false); }
          }}>{busy ? <Loader2 size={15} className="spin" /> : 'Submit application'}</PrimaryButton>
          <GhostButton onClick={onCancel}>Cancel</GhostButton>
        </div>
      </div>
    </Card>
  );
}

/* ------------------------------- admin app ------------------------------- */

const ROLE_LABELS = {
  manager: 'Manager', cashier: 'Cashier', loans_officer: 'Loans officer',
  supervisor: 'Supervisor', board: 'Board', member: 'Member',
};
function getPerms(role) {
  return {
    manageRoles: role === 'manager',
    approveAccounts: role === 'manager',
    recordCash: role === 'manager' || role === 'cashier',
    viewCash: role === 'manager' || role === 'cashier' || role === 'supervisor',
    manageLoans: role === 'manager' || role === 'loans_officer',
    viewLoans: role === 'manager' || role === 'loans_officer' || role === 'supervisor',
    declareDividends: role === 'manager',
    viewDividends: role === 'manager' || role === 'board' || role === 'supervisor',
  };
}

function DesktopSidebar({ tabs, active, onChange, profile, avatarUrl, themeMode, onToggleTheme, onLogout }) {
  return (
    <div style={{
      width: 240, flexShrink: 0, background: THEME.surface, borderRight: `1px solid ${THEME.line}`,
      display: 'flex', flexDirection: 'column', padding: '24px 16px', height: '100%', overflowY: 'auto',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 8px', marginBottom: 30 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10, background: `linear-gradient(135deg, ${THEME.pine}, ${THEME.pineDark})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <ShieldCheck size={18} color={THEME.goldLight} />
        </div>
        <div style={{ fontFamily: 'Fraunces, serif', fontSize: 16, color: THEME.ink }}>Amani SACCO</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => onChange(t.key)} style={{
            display: 'flex', alignItems: 'center', gap: 11, padding: '11px 12px', borderRadius: 10, border: 'none',
            cursor: 'pointer', textAlign: 'left', fontSize: 14, fontWeight: 600,
            background: active === t.key ? THEME.pine : 'transparent',
            color: active === t.key ? '#fff' : THEME.inkSoft,
          }}>
            <t.icon size={17} />
            {t.label}
          </button>
        ))}
      </div>

      <button onClick={onToggleTheme} style={{
        display: 'flex', alignItems: 'center', gap: 11, padding: '11px 12px', borderRadius: 10, border: 'none',
        cursor: 'pointer', textAlign: 'left', fontSize: 14, fontWeight: 600, background: 'transparent', color: THEME.inkSoft, marginBottom: 4,
      }}>
        {themeMode === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
        {themeMode === 'dark' ? 'Light mode' : 'Dark mode'}
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12, background: THEME.paper, marginTop: 8 }}>
        <Avatar name={profile.full_name} photoUrl={avatarUrl} size={36} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile.full_name}</div>
          <div style={{ fontSize: 11, color: THEME.inkSoft }}>{ROLE_LABELS[profile.role] || profile.role}</div>
        </div>
        <button onClick={onLogout} title="Sign out" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
          <LogOut size={15} color={THEME.inkSoft} />
        </button>
      </div>
    </div>
  );
}

function DesktopOverview({
  profile, totalSavings, totalShares, totalOutstanding, chartData, cashFlowData, statsPeriod, setStatsPeriod,
  txnsAll, profileMap, profiles, memberPhotoUrls, pendingMembers, pendingLoans, setTab,
}) {
  const dailyActivity = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0, 0, 0, 0);
      days.push({ date: d, label: d.toLocaleDateString('en-GB', { weekday: 'short' }), Deposit: 0, Withdraw: 0 });
    }
    txnsAll.forEach(t => {
      const d = new Date(t.created_at); d.setHours(0, 0, 0, 0);
      const bucket = days.find(x => x.date.getTime() === d.getTime());
      if (!bucket) return;
      if (['deposit', 'share_purchase'].includes(t.type)) bucket.Deposit += Number(t.amount);
      if (t.type === 'withdrawal') bucket.Withdraw += Number(t.amount);
    });
    return days.map(d => ({ name: d.label, Deposit: Math.round(d.Deposit), Withdraw: Math.round(d.Withdraw) }));
  }, [txnsAll]);

  const recentTxns = txnsAll.slice(0, 30);
  const recentMembers = profiles.slice(0, 6);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20, alignItems: 'start' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>My cards</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div onClick={() => setTab('transactions')} style={{
              background: `linear-gradient(135deg, ${THEME.pine}, ${THEME.pineDark})`, borderRadius: 16, padding: 18, color: '#fff', minHeight: 130,
              display: 'flex', flexDirection: 'column', justifyContent: 'space-between', cursor: 'pointer',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, fontWeight: 700 }}>AMANI SACCO</span>
                <span style={{ fontSize: 10, background: 'rgba(255,255,255,0.2)', padding: '2px 8px', borderRadius: 999 }}>SAVINGS</span>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>Total member savings</div>
                <div style={{ fontFamily: 'Fraunces, serif', fontSize: 22, marginTop: 2 }}>{fmt(totalSavings)}</div>
              </div>
            </div>
            <div onClick={() => setTab('transactions')} style={{
              background: `linear-gradient(135deg, ${THEME.gold}, #8a5a00)`, borderRadius: 16, padding: 18, color: '#fff', minHeight: 130,
              display: 'flex', flexDirection: 'column', justifyContent: 'space-between', cursor: 'pointer',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, fontWeight: 700 }}>AMANI SACCO</span>
                <span style={{ fontSize: 10, background: 'rgba(255,255,255,0.25)', padding: '2px 8px', borderRadius: 999 }}>SHARES</span>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)' }}>Total member shares</div>
                <div style={{ fontFamily: 'Fraunces, serif', fontSize: 22, marginTop: 2 }}>{fmt(totalShares)}</div>
              </div>
            </div>
          </div>
        </div>
        <Card>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Recent transactions</div>
          <div style={{ maxHeight: 320, overflowY: 'auto', paddingRight: 4 }}>
            {recentTxns.length === 0 ? <EmptyState text="No transactions yet." /> : recentTxns.map(t => {
              const isCredit = ['deposit', 'loan_disbursement', 'dividend', 'share_purchase'].includes(t.type);
              return (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: `1px solid ${THEME.line}` }}>
                  <div style={{
                    width: 26, height: 26, borderRadius: 8, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: (isCredit ? THEME.success : THEME.danger) + '1a',
                  }}>
                    {isCredit ? <ArrowDownRight size={13} color={THEME.success} /> : <ArrowUpRight size={13} color={THEME.danger} />}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {(profileMap[t.member_id] || {}).full_name || 'Member'}
                    </div>
                    <div style={{ fontSize: 10, color: THEME.inkSoft }}>{fmtDate(t.created_at)}</div>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: isCredit ? THEME.success : THEME.danger, whiteSpace: 'nowrap' }}>
                    {isCredit ? '+' : '−'}{fmt(t.amount)}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 20, alignItems: 'start' }}>
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Weekly activity</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {['month', 'year'].map(p => (
                <button key={p} onClick={() => setStatsPeriod(p)} style={{
                  padding: '5px 12px', borderRadius: 8, border: `1px solid ${THEME.line}`, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  background: statsPeriod === p ? THEME.pine : 'transparent', color: statsPeriod === p ? '#fff' : THEME.inkSoft,
                }}>{p === 'month' ? 'This month' : 'This year'}</button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={dailyActivity}>
              <CartesianGrid stroke={THEME.line} vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: THEME.inkSoft }} axisLine={{ stroke: THEME.line }} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: THEME.inkSoft }} axisLine={false} tickLine={false} width={44} />
              <Tooltip formatter={(v) => fmt(v)} contentStyle={{ borderRadius: 8, border: `1px solid ${THEME.line}`, fontSize: 12, background: THEME.surface, color: THEME.ink }} itemStyle={{ color: THEME.ink }} labelStyle={{ color: THEME.ink }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Deposit" fill={THEME.pine} radius={[5, 5, 0, 0]} />
              <Bar dataKey="Withdraw" fill={THEME.gold} radius={[5, 5, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>Fund composition</div>
          {chartData.every(d => d.value === 0) ? <EmptyState text="No funds recorded yet." /> : (
            <DonutChart data={chartData} colors={[THEME.pine, THEME.gold, THEME.danger, THEME.success]} />
          )}
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
        <StatCard label="Members" value={profiles.length} icon={Users} />
        <StatCard label="Pending approvals" value={pendingMembers.length} accent={pendingMembers.length ? THEME.gold : THEME.ink} icon={ShieldCheck} />
        <StatCard label="Pending loans" value={pendingLoans.length} accent={THEME.gold} icon={Landmark} />
      </div>

      <Card>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Members</div>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {recentMembers.length === 0 ? <EmptyState text="No members yet." /> : recentMembers.map(m => (
            <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: 64 }}>
              <Avatar name={m.full_name} photoUrl={memberPhotoUrls[m.id]} size={44} />
              <span style={{ fontSize: 11, color: THEME.inkSoft, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>
                {m.full_name.split(' ')[0]}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function AdminApp({ profile, token, onLogout, themeMode, onToggleTheme }) {
  const perms = getPerms(profile.role);
  const isDesktop = useIsDesktop();
  const [viewMemberId, setViewMemberId] = useState(null);
  const [myPhotoUrl, setMyPhotoUrl] = useState(null);
  const [statsPeriod, setStatsPeriod] = useState('month');
  const [showAddMember, setShowAddMember] = useState(false);
  const [memberPhotoUrls, setMemberPhotoUrls] = useState({});
  const [tab, setTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState([]);
  const [savingsAll, setSavingsAll] = useState([]);
  const [sharesAll, setSharesAll] = useState([]);
  const [loansAll, setLoansAll] = useState([]);
  const [txnsAll, setTxnsAll] = useState([]);
  const [dividendsAll, setDividendsAll] = useState([]);
  const [statementRequestsAll, setStatementRequestsAll] = useState([]);
  const [withdrawalRequestsAll, setWithdrawalRequestsAll] = useState([]);
  const [profileChangeRequestsAll, setProfileChangeRequestsAll] = useState([]);
  const [announcements, setAnnouncements] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    const [pf, sa, sh, ln, tx, dv, sr, wr, pcr, ann] = await Promise.all([
      sb('/rest/v1/profiles?select=*&order=created_at.desc', { token }),
      sb('/rest/v1/savings_accounts?select=*', { token }),
      sb('/rest/v1/shares?select=*', { token }),
      sb('/rest/v1/loans?select=*&order=applied_at.desc', { token }),
      sb('/rest/v1/transactions?select=*&order=created_at.desc&limit=60', { token }),
      sb('/rest/v1/dividends?select=*&order=year.desc', { token }),
      sb('/rest/v1/statement_requests?status=eq.pending&select=*&order=requested_at.asc', { token }),
      sb('/rest/v1/withdrawal_requests?status=eq.pending&select=*&order=requested_at.asc', { token }),
      sb('/rest/v1/profile_change_requests?status=eq.pending&select=*&order=requested_at.asc', { token }),
      sb('/rest/v1/announcements?select=*&order=created_at.desc&limit=20', { token }),
    ]);
    setProfiles(pf || []); setSavingsAll(sa || []); setSharesAll(sh || []);
    setLoansAll(ln || []); setTxnsAll(tx || []); setDividendsAll(dv || []);
    setStatementRequestsAll(sr || []);
    setWithdrawalRequestsAll(wr || []);
    setProfileChangeRequestsAll(pcr || []);
    setAnnouncements(ann || []);
    setLoading(false);
  }, [token]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (profile.photo_url) getSignedPhotoUrl(token, profile.photo_url).then(setMyPhotoUrl); }, [profile.photo_url, token]);
  useEffect(() => {
    checkAndNotifyAnnouncements(token);
    const interval = setInterval(() => checkAndNotifyAnnouncements(token), 120000);
    return () => clearInterval(interval);
  }, [token]);
  useEffect(() => {
    if (tab !== 'members') return;
    const withPhotos = profiles.filter(p => p.photo_url && !(p.id in memberPhotoUrls));
    if (withPhotos.length === 0) return;
    (async () => {
      const entries = await Promise.all(withPhotos.map(async p => [p.id, await getSignedPhotoUrl(token, p.photo_url)]));
      setMemberPhotoUrls(prev => { const next = { ...prev }; entries.forEach(([id, url]) => { next[id] = url; }); return next; });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, profiles]);

  async function decideStatementRequest(req, status) {
    await sb(`/rest/v1/statement_requests?id=eq.${req.id}`, {
      method: 'PATCH', token, headers: { Prefer: 'return=minimal' },
      body: { status, decided_at: new Date().toISOString(), decided_by: profile.id },
    });
    await load();
  }

  async function decideWithdrawalRequest(req, status) {
    if (status === 'approved') {
      const acct = savingsMap[req.member_id] || { balance: 0 };
      const newBal = Number(acct.balance) - Number(req.amount);
      await sb(`/rest/v1/savings_accounts?member_id=eq.${req.member_id}`, {
        method: 'PATCH', token, headers: { Prefer: 'return=minimal' },
        body: { balance: newBal, updated_at: new Date().toISOString() },
      });
      await sb('/rest/v1/transactions', {
        method: 'POST', token, headers: { Prefer: 'return=minimal' },
        body: {
          member_id: req.member_id, type: 'withdrawal', amount: Number(req.amount), balance_after: newBal,
          payment_mode: 'other', notes: req.note ? `Withdrawal request: ${req.note}` : 'Approved withdrawal request', created_by: profile.id,
        },
      });
    }
    await sb(`/rest/v1/withdrawal_requests?id=eq.${req.id}`, {
      method: 'PATCH', token, headers: { Prefer: 'return=minimal' },
      body: { status, decided_at: new Date().toISOString(), decided_by: profile.id },
    });
    await load();
  }

  async function decideProfileChangeRequest(req, status) {
    if (status === 'approved') {
      const patch = {};
      if (req.new_phone) patch.phone = req.new_phone;
      if (req.new_photo_url) patch.photo_url = req.new_photo_url;
      if (req.new_next_of_kin_name) patch.next_of_kin_name = req.new_next_of_kin_name;
      if (req.new_next_of_kin_phone) patch.next_of_kin_phone = req.new_next_of_kin_phone;
      if (req.new_next_of_kin_relationship) patch.next_of_kin_relationship = req.new_next_of_kin_relationship;
      if (Object.keys(patch).length > 0) {
        await sb(`/rest/v1/profiles?id=eq.${req.member_id}`, {
          method: 'PATCH', token, headers: { Prefer: 'return=minimal' }, body: patch,
        });
      }
    }
    await sb(`/rest/v1/profile_change_requests?id=eq.${req.id}`, {
      method: 'PATCH', token, headers: { Prefer: 'return=minimal' },
      body: { status, decided_at: new Date().toISOString(), decided_by: profile.id },
    });
    await load();
  }

  async function postAnnouncement(title, body) {
    await sb('/rest/v1/announcements', {
      method: 'POST', token, headers: { Prefer: 'return=minimal' },
      body: { title, body, created_by: profile.id },
    });
    await load();
  }

  async function addExistingMember(form) {
    // 1. Create the auth account (public signup endpoint — safe, no elevated key needed)
    const signupRes = await sb('/auth/v1/signup', {
      method: 'POST',
      body: { email: form.email, password: form.password, data: { full_name: form.fullName, phone: form.phone } },
    });
    const newUserId = signupRes && signupRes.user && signupRes.user.id;
    if (!newUserId) throw new Error('Could not create the member account — the response did not include a user id.');

    // 2. Photo (optional) — uploaded using the MANAGER's own token, permitted by the
    //    manager-only storage policy added for exactly this onboarding flow.
    let photoPath = null;
    if (form.photoFile) {
      photoPath = await uploadKycPhoto(token, newUserId, form.photoFile);
    }

    // 3. Approve immediately and fill in KYC / next-of-kin, using the manager's own token
    const profilePatch = { status: 'active' };
    if (form.nin) profilePatch.nin = form.nin;
    if (photoPath) profilePatch.photo_url = photoPath;
    if (form.nokName) profilePatch.next_of_kin_name = form.nokName;
    if (form.nokPhone) profilePatch.next_of_kin_phone = form.nokPhone;
    if (form.nokRelationship) profilePatch.next_of_kin_relationship = form.nokRelationship;
    await sb(`/rest/v1/profiles?id=eq.${newUserId}`, { method: 'PATCH', token, headers: { Prefer: 'return=minimal' }, body: profilePatch });

    // 4. Opening balances
    const openingSavings = Number(form.openingSavings) || 0;
    const openingShares = Number(form.openingShares) || 0;
    await sb(`/rest/v1/savings_accounts?member_id=eq.${newUserId}`, {
      method: 'PATCH', token, headers: { Prefer: 'return=minimal' }, body: { balance: openingSavings, updated_at: new Date().toISOString() },
    });
    await sb(`/rest/v1/shares?member_id=eq.${newUserId}`, {
      method: 'PATCH', token, headers: { Prefer: 'return=minimal' }, body: { balance: openingShares, updated_at: new Date().toISOString() },
    });
    await sb('/rest/v1/transactions', {
      method: 'POST', token, headers: { Prefer: 'return=minimal' },
      body: { member_id: newUserId, type: 'balance_adjustment', amount: openingSavings, balance_after: openingSavings, payment_mode: 'other', notes: 'Opening savings balance (existing member onboarded)', created_by: profile.id },
    });
    await sb('/rest/v1/transactions', {
      method: 'POST', token, headers: { Prefer: 'return=minimal' },
      body: { member_id: newUserId, type: 'shares_adjustment', amount: openingShares, balance_after: openingShares, payment_mode: 'other', notes: 'Opening shares balance (existing member onboarded)', created_by: profile.id },
    });

    // 5. Optional: log their most recent known transaction, for audit continuity
    if (form.lastTxnType && form.lastTxnAmount) {
      const createdAt = form.lastTxnDate ? new Date(form.lastTxnDate + 'T12:00:00').toISOString() : new Date().toISOString();
      const balanceAfter = form.lastTxnType === 'share_purchase' ? openingShares : openingSavings;
      await sb('/rest/v1/transactions', {
        method: 'POST', token, headers: { Prefer: 'return=minimal' },
        body: {
          member_id: newUserId, type: form.lastTxnType, amount: Number(form.lastTxnAmount), balance_after: balanceAfter,
          payment_mode: form.lastTxnPaymentMode || 'other', notes: form.lastTxnNotes || 'Most recent transaction on record at onboarding',
          created_by: profile.id, created_at: createdAt,
        },
      });
    }

    await load();
  }

  const profileMap = useMemo(() => { const m = {}; profiles.forEach(p => { m[p.id] = p; }); return m; }, [profiles]);
  const savingsMap = useMemo(() => { const m = {}; savingsAll.forEach(s => { m[s.member_id] = s; }); return m; }, [savingsAll]);
  const sharesMap = useMemo(() => { const m = {}; sharesAll.forEach(s => { m[s.member_id] = s; }); return m; }, [sharesAll]);

  const totalSavings = savingsAll.reduce((s, r) => s + Number(r.balance), 0);
  const totalShares = sharesAll.reduce((s, r) => s + Number(r.balance), 0);
  const totalOutstanding = loansAll.filter(l => l.status === 'active').reduce((s, r) => s + Number(r.outstanding_balance || 0), 0);
  const pendingMembers = profiles.filter(p => p.status === 'pending');
  const pendingLoans = loansAll.filter(l => l.status === 'pending');
  const activeLoans = loansAll.filter(l => l.status === 'active');

  const chartData = [
    { name: 'Savings', value: Math.round(totalSavings) },
    { name: 'Shares', value: Math.round(totalShares) },
    { name: 'Loans out', value: Math.round(totalOutstanding) },
  ];

  const now = new Date();
  const periodTxns = txnsAll.filter(t => {
    const d = new Date(t.created_at);
    if (statsPeriod === 'year') return d.getFullYear() === now.getFullYear();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const sumType = (types) => periodTxns.filter(t => types.includes(t.type)).reduce((s, t) => s + Number(t.amount), 0);
  const cashFlowData = [
    { name: 'Deposits', value: Math.round(sumType(['deposit', 'share_purchase'])) },
    { name: 'Withdrawals', value: Math.round(sumType(['withdrawal'])) },
    { name: 'Disbursed', value: Math.round(sumType(['loan_disbursement'])) },
  ].filter(d => d.value > 0);

  const trendData = useMemo(() => {
    const buckets = {};
    const labels = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      buckets[key] = 0;
      labels.push({ key, label: d.toLocaleDateString('en-GB', { month: 'short' }) });
    }
    txnsAll.forEach(t => {
      if (!['deposit', 'share_purchase'].includes(t.type)) return;
      const d = new Date(t.created_at);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (key in buckets) buckets[key] += Number(t.amount);
    });
    return labels.map(l => ({ name: l.label, value: Math.round(buckets[l.key]) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txnsAll]);

  const DONUT_COLORS = [THEME.pine, THEME.gold, THEME.danger, THEME.success];

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
  async function recordTxn(memberId, type, amount, paymentMode, notes, date) {
    const createdAt = date ? new Date(date + 'T12:00:00').toISOString() : new Date().toISOString();

    if (type === 'shares_adjustment') {
      const newBal = Number(amount);
      await sb(`/rest/v1/shares?member_id=eq.${memberId}`, {
        method: 'PATCH', token, headers: { Prefer: 'return=minimal' },
        body: { balance: newBal, updated_at: new Date().toISOString() },
      });
      await sb('/rest/v1/transactions', {
        method: 'POST', token, headers: { Prefer: 'return=minimal' },
        body: { member_id: memberId, type, amount: newBal, balance_after: newBal, payment_mode: 'other', notes: notes || 'Opening shares balance', created_by: profile.id, created_at: createdAt },
      });
      await load();
      return;
    }
    if (type === 'balance_adjustment') {
      const newBal = Number(amount);
      await sb(`/rest/v1/savings_accounts?member_id=eq.${memberId}`, {
        method: 'PATCH', token, headers: { Prefer: 'return=minimal' },
        body: { balance: newBal, updated_at: new Date().toISOString() },
      });
      await sb('/rest/v1/transactions', {
        method: 'POST', token, headers: { Prefer: 'return=minimal' },
        body: { member_id: memberId, type, amount: newBal, balance_after: newBal, payment_mode: 'other', notes: notes || 'Opening savings balance', created_by: profile.id, created_at: createdAt },
      });
      await load();
      return;
    }
    if (type === 'share_purchase') {
      const acct = sharesMap[memberId] || { balance: 0 };
      const newBal = Number(acct.balance) + Number(amount);
      await sb(`/rest/v1/shares?member_id=eq.${memberId}`, {
        method: 'PATCH', token, headers: { Prefer: 'return=minimal' },
        body: { balance: newBal, updated_at: new Date().toISOString() },
      });
      await sb('/rest/v1/transactions', {
        method: 'POST', token, headers: { Prefer: 'return=minimal' },
        body: { member_id: memberId, type, amount: Number(amount), balance_after: newBal, payment_mode: paymentMode, notes, created_by: profile.id, created_at: createdAt },
      });
      await load();
      return;
    }
    // deposit, withdrawal, dividend — all credit/debit the savings balance
    const acct = savingsMap[memberId] || { balance: 0 };
    const newBal = type === 'withdrawal' ? Number(acct.balance) - Number(amount) : Number(acct.balance) + Number(amount);
    await sb(`/rest/v1/savings_accounts?member_id=eq.${memberId}`, {
      method: 'PATCH', token, headers: { Prefer: 'return=minimal' },
      body: { balance: newBal, updated_at: new Date().toISOString() },
    });
    await sb('/rest/v1/transactions', {
      method: 'POST', token, headers: { Prefer: 'return=minimal' },
      body: { member_id: memberId, type, amount: Number(amount), balance_after: newBal, payment_mode: paymentMode, notes, created_by: profile.id, created_at: createdAt },
    });
    await load();
  }
  async function toggleMemberStatus(m) {
    const newStatus = m.status === 'active' ? 'suspended' : 'active';
    await sb(`/rest/v1/profiles?id=eq.${m.id}`, { method: 'PATCH', token, headers: { Prefer: 'return=minimal' }, body: { status: newStatus } });
    await load();
  }
  async function approveMember(m) {
    await sb(`/rest/v1/profiles?id=eq.${m.id}`, { method: 'PATCH', token, headers: { Prefer: 'return=minimal' }, body: { status: 'active' } });
    await load();
  }
  async function setMemberRole(m, newRole) {
    if (newRole === m.role) return;
    const verb = `change ${m.full_name}'s role from ${ROLE_LABELS[m.role] || m.role} to ${ROLE_LABELS[newRole] || newRole}`;
    if (!window.confirm(`Are you sure you want to ${verb}?`)) return;
    await sb(`/rest/v1/profiles?id=eq.${m.id}`, { method: 'PATCH', token, headers: { Prefer: 'return=minimal' }, body: { role: newRole } });
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
    ...(perms.viewLoans ? [{ key: 'loans', label: 'Loans', icon: Landmark }] : []),
    ...(perms.viewCash ? [{ key: 'transactions', label: 'Finances', icon: Wallet }] : []),
    ...(perms.viewDividends ? [{ key: 'dividends', label: 'Dividends', icon: Gift }] : []),
    { key: 'messages', label: 'Messages', icon: Megaphone },
  ];
  useEffect(() => {
    if (!tabs.some(t => t.key === tab)) setTab('overview');
  }, [profile.role]); // eslint-disable-line react-hooks/exhaustive-deps

  const tabContent = (
    loading ? <Spinner /> : (
      <>
        {tab === 'overview' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <NotificationPrompt />
                <SaccoCard totalAssets={totalSavings + totalShares} />

                <div style={{ display: 'flex', gap: 8 }}>
                  {['month', 'year'].map(p => (
                    <button key={p} onClick={() => setStatsPeriod(p)} style={{
                      flex: 1, padding: '9px 0', borderRadius: 10, border: `1px solid ${THEME.line}`, cursor: 'pointer',
                      background: statsPeriod === p ? THEME.pine : THEME.surface,
                      color: statsPeriod === p ? '#fff' : THEME.inkSoft, fontWeight: 600, fontSize: 13,
                    }}>{p === 'month' ? 'This month' : 'This year'}</button>
                  ))}
                </div>

                <Card>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>Fund composition</div>
                  {chartData.every(d => d.value === 0) ? <EmptyState text="No funds recorded yet." /> : (
                    <DonutChart data={chartData} colors={DONUT_COLORS} />
                  )}
                </Card>

                <Card>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>
                    Cash flow · {statsPeriod === 'month' ? 'this month' : 'this year'}
                  </div>
                  {cashFlowData.length === 0 ? <EmptyState text="No transactions in this period yet." /> : (
                    <DonutChart data={cashFlowData} colors={DONUT_COLORS} />
                  )}
                </Card>

                <Card>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Deposit trend · last 6 months</div>
                  <ResponsiveContainer width="100%" height={160}>
                    <AreaChart data={trendData}>
                      <defs>
                        <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={THEME.pine} stopOpacity={0.35} />
                          <stop offset="100%" stopColor={THEME.pine} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: THEME.inkSoft }} axisLine={{ stroke: THEME.line }} tickLine={false} />
                      <YAxis hide />
                      <Tooltip formatter={(v) => fmt(v)} contentStyle={{ borderRadius: 8, border: `1px solid ${THEME.line}`, fontSize: 12, background: THEME.surface, color: THEME.ink }} itemStyle={{ color: THEME.ink }} labelStyle={{ color: THEME.ink }} />
                      <Area type="monotone" dataKey="value" stroke={THEME.pine} strokeWidth={2.5} fill="url(#trendFill)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </Card>

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <StatCard label="Members" value={profiles.length} icon={Users} />
                  <StatCard label="Pending approvals" value={pendingMembers.length} accent={pendingMembers.length ? THEME.gold : THEME.ink} icon={ShieldCheck} />
                  <StatCard label="Pending loans" value={pendingLoans.length} accent={THEME.gold} icon={Landmark} />
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <StatCard label="Total savings" value={fmt(totalSavings)} accent={THEME.pine} icon={PiggyBank} />
                  <StatCard label="Loans outstanding" value={fmt(totalOutstanding)} accent={THEME.danger} icon={TrendingUp} />
                </div>
              </div>
            )}

            {tab === 'members' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                {['manager', 'admin', 'administrator'].includes(String(profile.role || '').trim().toLowerCase()) && (
                  showAddMember ? (
                    <AddExistingMemberForm onSubmit={addExistingMember} onClose={() => setShowAddMember(false)} />
                  ) : (
                    <PrimaryButton onClick={() => setShowAddMember(true)}><Plus size={15} /> Add an existing member</PrimaryButton>
                  )
                )}
                {(profile.role === 'manager' || profile.role === 'supervisor') && (
                  <Card>
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Export for audit</div>
                    <p style={{ fontSize: 11.5, color: THEME.inkSoft, margin: '0 0 10px' }}>
                      Downloads every member's profile, KYC, next of kin, and current balances.
                    </p>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <GhostButton onClick={() => exportMembersExcel(profiles, savingsMap, sharesMap)}>
                        <FileText size={14} /> Excel
                      </GhostButton>
                      <GhostButton onClick={() => exportMembersPdf(profiles, savingsMap, sharesMap)}>
                        <FileText size={14} /> PDF
                      </GhostButton>
                      <GhostButton onClick={() => exportMembersWord(profiles, savingsMap, sharesMap)}>
                        <FileText size={14} /> Word
                      </GhostButton>
                    </div>
                  </Card>
                )}
                {perms.approveAccounts && profileChangeRequestsAll.length > 0 && (
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, color: THEME.pine }}>
                      Profile change requests ({profileChangeRequestsAll.length})
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {profileChangeRequestsAll.map(r => (
                        <Card key={r.id}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                            <div style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{(profileMap[r.member_id] || {}).full_name || 'Member'}</div>
                            <span style={{ fontSize: 12, color: THEME.inkSoft, flexShrink: 0 }}>{fmtDate(r.requested_at)}</span>
                          </div>
                          <div style={{ fontSize: 12, color: THEME.ink, marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
                            {r.new_photo_url && <span>• Proposes a new profile photo</span>}
                            {r.new_phone && <span>• New phone: <b>{r.new_phone}</b></span>}
                            {r.new_next_of_kin_name && <span>• Next of kin name: <b>{r.new_next_of_kin_name}</b></span>}
                            {r.new_next_of_kin_relationship && <span>• Next of kin relationship: <b>{r.new_next_of_kin_relationship}</b></span>}
                            {r.new_next_of_kin_phone && <span>• Next of kin phone: <b>{r.new_next_of_kin_phone}</b></span>}
                          </div>
                          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                            <PrimaryButton style={{ flex: 1 }} onClick={() => decideProfileChangeRequest(r, 'approved')}><Check size={14} /> Approve</PrimaryButton>
                            <GhostButton style={{ flex: 1, borderColor: THEME.danger, color: THEME.danger }} onClick={() => decideProfileChangeRequest(r, 'rejected')}><X size={14} style={{ marginRight: 4 }} />Reject</GhostButton>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}
                {perms.approveAccounts && statementRequestsAll.length > 0 && (
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, color: THEME.pine }}>
                      Statement requests ({statementRequestsAll.length})
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {statementRequestsAll.map(r => (
                        <Card key={r.id}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                            <div style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{(profileMap[r.member_id] || {}).full_name || 'Member'}</div>
                            <span style={{ fontSize: 12, color: THEME.inkSoft, flexShrink: 0 }}>{fmtDate(r.requested_at)}</span>
                          </div>
                          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                            <PrimaryButton style={{ flex: 1 }} onClick={() => decideStatementRequest(r, 'approved')}><Check size={14} /> Approve</PrimaryButton>
                            <GhostButton style={{ flex: 1, borderColor: THEME.danger, color: THEME.danger }} onClick={() => decideStatementRequest(r, 'rejected')}><X size={14} style={{ marginRight: 4 }} />Reject</GhostButton>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}
                {pendingMembers.length > 0 && (
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, color: THEME.gold }}>
                      Awaiting approval ({pendingMembers.length})
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {pendingMembers.map(m => (
                        <Card key={m.id} style={{ borderColor: THEME.gold }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <Avatar name={m.full_name} photoUrl={memberPhotoUrls[m.id]} size={38} />
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 700, fontSize: 14 }}>{m.full_name}</div>
                              <div style={{ fontSize: 12, color: THEME.inkSoft }}>{m.phone || 'No phone on file'}</div>
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                            {perms.approveAccounts ? (
                              <PrimaryButton style={{ flex: 1 }} onClick={() => approveMember(m)}>
                                <Check size={14} /> Approve
                              </PrimaryButton>
                            ) : (
                              <div style={{ fontSize: 12, color: THEME.inkSoft }}>Only a manager can approve new accounts.</div>
                            )}
                          </div>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  {pendingMembers.length > 0 && (
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>All members</div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {profiles.filter(p => p.status !== 'pending').length === 0 ? <EmptyState text="No approved members yet." /> : profiles.filter(p => p.status !== 'pending').map(m => (
                      <Card key={m.id}>
                        <div
                          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', cursor: 'pointer' }}
                          onClick={() => setViewMemberId(m.id)}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                            <Avatar name={m.full_name} photoUrl={memberPhotoUrls[m.id]} size={38} />
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.full_name}</div>
                              <div style={{ fontSize: 12, color: THEME.inkSoft }}>{m.phone || 'No phone on file'}</div>
                            </div>
                          </div>
                          <Badge color={statusColor(m.status)}>{m.status}</Badge>
                        </div>
                        <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 12 }}>
                          <span>Savings: <b>{fmt((savingsMap[m.id] || {}).balance)}</b></span>
                          <span>Shares: <b>{fmt((sharesMap[m.id] || {}).balance)}</b></span>
                        </div>
                        {m.id !== profile.id && perms.manageRoles && (
                          <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
                            <select
                              value={m.role}
                              onChange={e => setMemberRole(m, e.target.value)}
                              style={{ ...inputStyle, flex: 1, padding: '8px 10px', fontSize: 12 }}
                            >
                              <option value="member">Member</option>
                              <option value="cashier">Cashier</option>
                              <option value="loans_officer">Loans officer</option>
                              <option value="supervisor">Supervisor</option>
                              <option value="board">Board</option>
                              <option value="manager">Manager</option>
                            </select>
                            <GhostButton onClick={() => toggleMemberStatus(m)}>
                              {m.status === 'active' ? 'Suspend' : 'Reactivate'}
                            </GhostButton>
                          </div>
                        )}
                        {m.id !== profile.id && !perms.manageRoles && m.role !== 'member' && (
                          <div style={{ marginTop: 8 }}><Badge color={THEME.pine}>{ROLE_LABELS[m.role] || m.role}</Badge></div>
                        )}
                      </Card>
                    ))}
                  </div>
                </div>
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
                            {l.repayment_plan ? <Badge color={THEME.gold}>special request</Badge> : l.flagged_over_ceiling && <Badge color={THEME.danger}>over ceiling</Badge>}
                          </div>
                          <div style={{ fontFamily: 'Fraunces, serif', fontSize: 18, marginTop: 4 }}>{fmt(l.principal)}</div>
                          <div style={{ fontSize: 12, color: THEME.inkSoft, marginTop: 2 }}>{l.term_months} months{l.purpose ? ` · ${l.purpose}` : ''}</div>
                          {l.repayment_plan && (
                            <div style={{ fontSize: 12, color: THEME.ink, background: THEME.paper, borderRadius: 8, padding: '8px 10px', marginTop: 8 }}>
                              <b>Repayment plan:</b> {l.repayment_plan}
                            </div>
                          )}
                          <GhostButton style={{ marginTop: 10, width: '100%' }} onClick={() => setViewMemberId(l.member_id)}>
                            View applicant's full profile
                          </GhostButton>
                          {perms.manageLoans ? (
                            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                              <PrimaryButton style={{ flex: 1 }} onClick={() => approveLoan(l)}><Check size={14} /> Approve</PrimaryButton>
                              <GhostButton style={{ flex: 1, borderColor: THEME.danger, color: THEME.danger }} onClick={() => rejectLoan(l)}><X size={14} style={{ marginRight: 4 }} />Reject</GhostButton>
                            </div>
                          ) : (
                            <div style={{ fontSize: 12, color: THEME.inkSoft, marginTop: 10 }}>View only — only a manager or loans officer can act on this.</div>
                          )}
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Active loans</div>
                  {activeLoans.length === 0 ? <EmptyState text="No active loans." /> : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {activeLoans.map(l => <ActiveLoanRow key={l.id} loan={l} memberName={(profileMap[l.member_id] || {}).full_name} onRepay={recordRepayment} onViewProfile={() => setViewMemberId(l.member_id)} readOnly={!perms.manageLoans} />)}
                    </div>
                  )}
                </div>
              </div>
            )}

            {tab === 'transactions' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {perms.recordCash && <RecordTxnForm members={profiles} onSubmit={recordTxn} />}
                {perms.recordCash && withdrawalRequestsAll.length > 0 && (
                  <Card>
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Withdrawal requests ({withdrawalRequestsAll.length})</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {withdrawalRequestsAll.map(r => (
                        <div key={r.id} style={{ border: `1px solid ${THEME.line}`, borderRadius: 10, padding: 10 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                            <span style={{ fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{(profileMap[r.member_id] || {}).full_name || 'Member'}</span>
                            <b style={{ fontSize: 13, flexShrink: 0 }}>{fmt(r.amount)}</b>
                          </div>
                          {r.note && <div style={{ fontSize: 12, color: THEME.inkSoft, marginTop: 3 }}>{r.note}</div>}
                          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                            <PrimaryButton style={{ flex: 1, padding: '7px 0', fontSize: 12 }} onClick={() => decideWithdrawalRequest(r, 'approved')}><Check size={13} /> Approve</PrimaryButton>
                            <GhostButton style={{ flex: 1, padding: '7px 0', fontSize: 12, borderColor: THEME.danger, color: THEME.danger }} onClick={() => decideWithdrawalRequest(r, 'rejected')}><X size={13} style={{ marginRight: 4 }} />Reject</GhostButton>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
                <Card>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Recent transactions</div>
                  {txnsAll.length === 0 ? <EmptyState text="No transactions recorded yet." /> : txnsAll.slice(0, 20).map(t => (
                    <div key={t.id} style={{ padding: '8px 0', borderBottom: `1px solid ${THEME.line}`, fontSize: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0, marginRight: 8, fontWeight: 600 }}>
                          {(profileMap[t.member_id] || {}).full_name || 'Member'} · <span style={{ textTransform: 'capitalize' }}>{t.type.replace('_', ' ')}</span>
                        </span>
                        <b>{fmt(t.amount)}</b>
                      </div>
                      <div style={{ color: THEME.inkSoft, fontSize: 11, marginTop: 2, display: 'flex', justifyContent: 'space-between' }}>
                        <span>{fmtDateTime(t.created_at)} · <span style={{ textTransform: 'capitalize' }}>{(t.payment_mode || 'cash').replace('_', ' ')}</span></span>
                        <span style={{ fontFamily: 'monospace' }}>{shortId(t.id)}</span>
                      </div>
                    </div>
                  ))}
                </Card>
              </div>
            )}

            {tab === 'dividends' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {perms.declareDividends && <DeclareDividendForm totalShares={totalShares} onSubmit={declareDividend} />}
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

            {tab === 'messages' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {profile.role === 'manager' && <PostAnnouncementForm onSubmit={postAnnouncement} />}
                {announcements.length === 0 ? <EmptyState text="No messages sent yet." /> : announcements.map(a => (
                  <Card key={a.id}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <Megaphone size={15} color={THEME.pine} />
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{a.title}</span>
                    </div>
                    <p style={{ fontSize: 13, color: THEME.ink, margin: 0, lineHeight: 1.5 }}>{a.body}</p>
                    <div style={{ fontSize: 11, color: THEME.inkSoft, marginTop: 8 }}>{fmtDateTime(a.created_at)}</div>
                  </Card>
                ))}
              </div>
            )}
      </>
    )
  );

  if (isDesktop) {
    return (
      <div style={{ height: '100vh', display: 'flex', background: THEME.paper, overflow: 'hidden' }}>
        <DesktopSidebar
          tabs={tabs} active={tab} onChange={setTab} profile={profile} avatarUrl={myPhotoUrl}
          themeMode={themeMode} onToggleTheme={onToggleTheme} onLogout={onLogout}
        />
        <div style={{ flex: 1, padding: '28px 36px', overflowY: 'auto', minWidth: 0, height: '100%' }}>
          <div style={{ fontFamily: 'Fraunces, serif', fontSize: 24, color: THEME.ink, marginBottom: 22 }}>
            {tabs.find(t => t.key === tab)?.label || 'Overview'}
          </div>
          {loading ? <Spinner /> : (
            tab === 'overview' ? (
              <DesktopOverview
                profile={profile} totalSavings={totalSavings} totalShares={totalShares} totalOutstanding={totalOutstanding}
                chartData={chartData} cashFlowData={cashFlowData} trendData={trendData} statsPeriod={statsPeriod} setStatsPeriod={setStatsPeriod}
                txnsAll={txnsAll} profileMap={profileMap} profiles={profiles} memberPhotoUrls={memberPhotoUrls}
                pendingMembers={pendingMembers} pendingLoans={pendingLoans} setTab={setTab}
              />
            ) : (
              <div style={{ maxWidth: 900 }}>{tabContent}</div>
            )
          )}
        </div>
        {viewMemberId && <MemberDetailModal memberId={viewMemberId} token={token} onClose={() => setViewMemberId(null)} />}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', minHeight: '100vh', background: THEME.paper, display: 'flex', flexDirection: 'column' }}>
      <Header title="Amani SACCO" subtitle={`${ROLE_LABELS[profile.role] || profile.role} · ${profile.full_name}`} onLogout={onLogout}
        avatarUrl={myPhotoUrl} avatarName={profile.full_name} themeMode={themeMode} onToggleTheme={onToggleTheme}
        roleBadge={<Badge color={profile.role === 'manager' ? THEME.gold : THEME.pine}>{ROLE_LABELS[profile.role] || profile.role}</Badge>} />

      <div style={{ flex: 1, padding: '0 20px 20px', overflowY: 'auto' }}>
        {tabContent}
      </div>

      {viewMemberId && <MemberDetailModal memberId={viewMemberId} token={token} onClose={() => setViewMemberId(null)} />}

      <BottomNav tabs={tabs} active={tab} onChange={setTab} />
    </div>
  );
}

function ActiveLoanRow({ loan, memberName, onRepay, onViewProfile, readOnly = false }) {
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <div style={{ fontWeight: 700 }}>{memberName || 'Member'}</div>
        <span style={{ fontSize: 12, color: THEME.inkSoft }}>Outstanding {fmt(loan.outstanding_balance)}</span>
      </div>
      {onViewProfile && (
        <button onClick={onViewProfile} style={{ background: 'none', border: 'none', padding: 0, marginTop: 4, color: THEME.pine, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          View full profile
        </button>
      )}
      {!readOnly && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <input type="number" min="1" placeholder="Repayment amount" value={amount} onChange={e => setAmount(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
          <PrimaryButton disabled={busy || !amount} onClick={async () => {
            setBusy(true);
            try { await onRepay(loan, amount); setAmount(''); } finally { setBusy(false); }
          }}>{busy ? <Loader2 size={14} className="spin" /> : 'Record'}</PrimaryButton>
        </div>
      )}
    </Card>
  );
}

function RecordTxnForm({ members, onSubmit }) {
  const [memberId, setMemberId] = useState('');
  const [type, setType] = useState('deposit');
  const [amount, setAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState('cash');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const isAdjustment = type === 'balance_adjustment' || type === 'shares_adjustment';
  return (
    <Card>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>Record cash movement</div>
      <p style={{ fontSize: 11.5, color: THEME.inkSoft, margin: '0 0 10px' }}>
        Use "Opening balance" once, when first bringing an existing member onto the system with their prior savings/shares.
        Everything else logs a normal dated transaction — backdate it if you're entering something that happened earlier.
      </p>
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
            <option value="dividend">Dividend received (historical)</option>
            <option value="balance_adjustment">Opening savings balance — set to exact amount</option>
            <option value="shares_adjustment">Opening shares balance — set to exact amount</option>
          </select>
        </Field>
        {!isAdjustment && (
          <Field label="Mode of payment">
            <select value={paymentMode} onChange={e => setPaymentMode(e.target.value)} style={inputStyle}>
              {PAYMENT_MODES.map(pm => <option key={pm.value} value={pm.value}>{pm.label}</option>)}
            </select>
          </Field>
        )}
        <Field label={type === 'balance_adjustment' ? 'Set savings balance to (UGX)' : type === 'shares_adjustment' ? 'Set shares balance to (UGX)' : 'Amount (UGX)'}>
          <input type="number" min="0" value={amount} onChange={e => setAmount(e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Date">
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} max={new Date().toISOString().slice(0, 10)} />
        </Field>
        <Field label="Notes"><input value={notes} onChange={e => setNotes(e.target.value)} style={inputStyle} placeholder={isAdjustment ? 'e.g. Opening balance from paper ledger' : 'e.g. Mobile money confirmation code'} /></Field>
        <PrimaryButton disabled={busy || !memberId || amount === ''} onClick={async () => {
          setBusy(true);
          try { await onSubmit(memberId, type, amount, paymentMode, notes, date); setAmount(''); setNotes(''); } finally { setBusy(false); }
        }}>{busy ? <Loader2 size={15} className="spin" /> : isAdjustment ? 'Set opening balance' : 'Record transaction'}</PrimaryButton>
      </div>
    </Card>
  );
}

function AddExistingMemberForm({ onSubmit, onClose }) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [nin, setNin] = useState('');
  const [nokName, setNokName] = useState('');
  const [nokPhone, setNokPhone] = useState('');
  const [nokRelationship, setNokRelationship] = useState('');
  const [openingSavings, setOpeningSavings] = useState('0');
  const [openingShares, setOpeningShares] = useState('0');
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [lastTxnType, setLastTxnType] = useState('');
  const [lastTxnAmount, setLastTxnAmount] = useState('');
  const [lastTxnDate, setLastTxnDate] = useState('');
  const [lastTxnPaymentMode, setLastTxnPaymentMode] = useState('cash');
  const [lastTxnNotes, setLastTxnNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function handlePhoto(f) {
    if (!f) return;
    setPhotoFile(f);
    setPhotoPreview(URL.createObjectURL(f));
  }

  async function handleSubmit() {
    setError('');
    if (!fullName.trim() || !email.trim() || password.length < 6) {
      setError('Full name, email, and a password of at least 6 characters are required.');
      return;
    }
    setBusy(true);
    try {
      await onSubmit({
        fullName: fullName.trim(), email: email.trim(), password, phone: phone.trim(), nin: nin.trim(),
        nokName: nokName.trim(), nokPhone: nokPhone.trim(), nokRelationship: nokRelationship.trim(),
        openingSavings, openingShares, photoFile,
        lastTxnType, lastTxnAmount, lastTxnDate, lastTxnPaymentMode, lastTxnNotes,
      });
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Add an existing member</div>
      <p style={{ fontSize: 11.5, color: THEME.inkSoft, margin: '0 0 12px' }}>
        For someone who was already a SACCO member on paper. This creates their account, approves it immediately, and
        records their current balances so they can start using the app right away. They'll need this email and
        password to log in the first time (Supabase may also require them to confirm their email first, depending on
        your project's auth settings).
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          {photoPreview ? (
            <img src={photoPreview} alt="Preview" style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover' }} />
          ) : <Avatar name={fullName || '?'} size={72} />}
          <CameraCapture onCapture={handlePhoto} />
          <label style={{ cursor: 'pointer' }}>
            <span style={{ fontSize: 12, color: THEME.inkSoft, textDecoration: 'underline' }}>or upload a photo</span>
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handlePhoto(e.target.files[0])} />
          </label>
        </div>
        <Field label="Full name *"><input value={fullName} onChange={e => setFullName(e.target.value)} style={inputStyle} /></Field>
        <Field label="Email * (used to log in)"><input type="email" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} /></Field>
        <Field label="Temporary password * (min 6 characters)"><input type="text" value={password} onChange={e => setPassword(e.target.value)} style={inputStyle} placeholder="Share this with the member" /></Field>
        <Field label="Phone"><input value={phone} onChange={e => setPhone(e.target.value)} style={inputStyle} /></Field>
        <Field label="NIN"><input value={nin} onChange={e => setNin(e.target.value)} style={inputStyle} /></Field>
        <div style={{ display: 'flex', gap: 10 }}>
          <Field label="Opening savings (UGX)"><input type="number" min="0" value={openingSavings} onChange={e => setOpeningSavings(e.target.value)} style={inputStyle} /></Field>
          <Field label="Opening shares (UGX)"><input type="number" min="0" value={openingShares} onChange={e => setOpeningShares(e.target.value)} style={inputStyle} /></Field>
        </div>

        <div style={{ fontWeight: 700, fontSize: 13, marginTop: 4 }}>Next of kin (if provided)</div>
        <Field label="Full name"><input value={nokName} onChange={e => setNokName(e.target.value)} style={inputStyle} /></Field>
        <div style={{ display: 'flex', gap: 10 }}>
          <Field label="Relationship"><input value={nokRelationship} onChange={e => setNokRelationship(e.target.value)} style={inputStyle} /></Field>
          <Field label="Phone"><input value={nokPhone} onChange={e => setNokPhone(e.target.value)} style={inputStyle} /></Field>
        </div>

        <div style={{ fontWeight: 700, fontSize: 13, marginTop: 4 }}>Most recent transaction on record (optional)</div>
        <p style={{ fontSize: 11, color: THEME.inkSoft, margin: 0 }}>Just for audit history — it won't change the opening balance above.</p>
        <Field label="Type">
          <select value={lastTxnType} onChange={e => setLastTxnType(e.target.value)} style={inputStyle}>
            <option value="">Not applicable</option>
            <option value="deposit">Savings deposit</option>
            <option value="withdrawal">Savings withdrawal</option>
            <option value="share_purchase">Share purchase</option>
            <option value="dividend">Dividend received</option>
          </select>
        </Field>
        {lastTxnType && (
          <>
            <div style={{ display: 'flex', gap: 10 }}>
              <Field label="Amount (UGX)"><input type="number" min="0" value={lastTxnAmount} onChange={e => setLastTxnAmount(e.target.value)} style={inputStyle} /></Field>
              <Field label="Date"><input type="date" value={lastTxnDate} onChange={e => setLastTxnDate(e.target.value)} style={inputStyle} max={new Date().toISOString().slice(0, 10)} /></Field>
            </div>
            <Field label="Mode of payment">
              <select value={lastTxnPaymentMode} onChange={e => setLastTxnPaymentMode(e.target.value)} style={inputStyle}>
                {PAYMENT_MODES.map(pm => <option key={pm.value} value={pm.value}>{pm.label}</option>)}
              </select>
            </Field>
            <Field label="Notes"><input value={lastTxnNotes} onChange={e => setLastTxnNotes(e.target.value)} style={inputStyle} /></Field>
          </>
        )}

        {error && <div style={{ color: THEME.danger, fontSize: 12 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <PrimaryButton style={{ flex: 1 }} disabled={busy} onClick={handleSubmit}>
            {busy ? <Loader2 size={15} className="spin" /> : 'Create and approve member'}
          </PrimaryButton>
          <GhostButton onClick={onClose}>Cancel</GhostButton>
        </div>
      </div>
    </Card>
  );
}

function PostAnnouncementForm({ onSubmit }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Card>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Send a message to all members</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Field label="Title"><input value={title} onChange={e => setTitle(e.target.value)} style={inputStyle} placeholder="e.g. Office closed this Friday" /></Field>
        <Field label="Message">
          <textarea value={body} onChange={e => setBody(e.target.value)} style={{ ...inputStyle, minHeight: 90, resize: 'vertical' }} placeholder="Write the full message here…" />
        </Field>
        <PrimaryButton disabled={busy || !title.trim() || !body.trim()} onClick={async () => {
          setBusy(true);
          try { await onSubmit(title.trim(), body.trim()); setTitle(''); setBody(''); } finally { setBusy(false); }
        }}>{busy ? <Loader2 size={15} className="spin" /> : 'Send to all members'}</PrimaryButton>
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

/* -------------------------- pending / suspended -------------------------- */

function AwaitingApprovalScreen({ profile, onLogout }) {
  const isSuspended = profile.status === 'suspended';
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 380, textAlign: 'center' }}>
        <div style={{
          width: 52, height: 52, borderRadius: 14,
          background: isSuspended ? THEME.danger : THEME.gold,
          display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px',
        }}>
          <ShieldCheck size={26} color="#fff" />
        </div>
        <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: 22, color: THEME.ink, margin: '0 0 10px' }}>
          {isSuspended ? 'Account suspended' : 'Awaiting approval'}
        </h1>
        <p style={{ color: THEME.inkSoft, fontSize: 14, lineHeight: 1.5 }}>
          {isSuspended
            ? 'An admin has suspended this account. Contact your SACCO admin if you believe this is a mistake.'
            : `Hi ${profile.full_name}, your account has been created but an admin still needs to approve it before you can sign in. Check back shortly, or contact your SACCO admin.`}
        </p>
        <GhostButton style={{ marginTop: 20 }} onClick={onLogout}>Sign out</GhostButton>
      </div>
    </div>
  );
}

function CameraCapture({ onCapture }) {
  const videoRef = React.useRef(null);
  const streamRef = React.useRef(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState('');

  async function startCamera() {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      streamRef.current = stream;
      setActive(true);
      // video element mounts this render; attach once it exists
      setTimeout(() => { if (videoRef.current) videoRef.current.srcObject = stream; }, 0);
    } catch (err) {
      setError('Could not access your camera. You can upload a photo instead.');
    }
  }

  function stopCamera() {
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setActive(false);
  }

  function capture() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    canvas.toBlob(blob => {
      if (!blob) return;
      const file = new File([blob], 'photo.jpg', { type: 'image/jpeg' });
      onCapture(file);
      stopCamera();
    }, 'image/jpeg', 0.9);
  }

  useEffect(() => () => stopCamera(), []); // eslint-disable-line react-hooks/exhaustive-deps

  if (active) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, width: '100%' }}>
        <video ref={videoRef} autoPlay playsInline muted style={{
          width: '100%', maxWidth: 280, borderRadius: 14, background: '#000', transform: 'scaleX(-1)',
        }} />
        <div style={{ display: 'flex', gap: 8 }}>
          <PrimaryButton onClick={capture}><Camera size={14} /> Capture</PrimaryButton>
          <GhostButton onClick={stopCamera}>Cancel</GhostButton>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <button onClick={startCamera} style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: THEME.pine,
        border: `1px solid ${THEME.pine}`, borderRadius: 10, padding: '8px 14px', background: 'none', cursor: 'pointer',
      }}>
        <Camera size={14} /> Use my camera
      </button>
      {error && <div style={{ color: THEME.danger, fontSize: 11, textAlign: 'center' }}>{error}</div>}
    </div>
  );
}

function KycCompletionScreen({ profile, token, onDone, onLogout }) {
  const [nin, setNin] = useState(profile.nin || '');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function handleFile(f) {
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  async function submit() {
    if (!nin.trim() || !file) { setError('Please provide your NIN and a photo before continuing.'); return; }
    setError(''); setBusy(true);
    try {
      const path = await uploadKycPhoto(token, profile.id, file);
      await sb(`/rest/v1/profiles?id=eq.${profile.id}`, {
        method: 'PATCH', token, headers: { Prefer: 'return=minimal' },
        body: { nin: nin.trim(), photo_url: path },
      });
      onDone({ ...profile, nin: nin.trim(), photo_url: path });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14, background: `linear-gradient(135deg, ${THEME.gold}, ${THEME.pine})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px',
          }}>
            <ShieldCheck size={26} color="#fff" />
          </div>
          <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: 22, color: THEME.ink, margin: 0 }}>Verify your identity</h1>
          <p style={{ color: THEME.inkSoft, fontSize: 13, marginTop: 6 }}>
            One last step, {profile.full_name.split(' ')[0]} — this is required before your account can be reviewed.
          </p>
        </div>
        <Card style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            {preview ? (
              <>
                <img src={preview} alt="Preview" style={{ width: 96, height: 96, borderRadius: '50%', objectFit: 'cover', border: `3px solid ${THEME.paper}`, boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }} />
                <GhostButton onClick={() => { setFile(null); setPreview(null); }}>Retake photo</GhostButton>
              </>
            ) : (
              <>
                <div style={{ width: 96, height: 96, borderRadius: '50%', background: THEME.paper, display: 'flex', alignItems: 'center', justifyContent: 'center', color: THEME.inkSoft, fontSize: 11, textAlign: 'center', padding: 8 }}>
                  No photo yet
                </div>
                <CameraCapture onCapture={handleFile} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', margin: '2px 0' }}>
                  <div style={{ flex: 1, height: 1, background: THEME.line }} />
                  <span style={{ fontSize: 11, color: THEME.inkSoft }}>or</span>
                  <div style={{ flex: 1, height: 1, background: THEME.line }} />
                </div>
                <label style={{ cursor: 'pointer' }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: THEME.inkSoft,
                    border: `1px solid ${THEME.line}`, borderRadius: 10, padding: '8px 14px',
                  }}>
                    Upload a photo instead
                  </span>
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
                </label>
              </>
            )}
          </div>
          <Field label="National ID Number (NIN)">
            <input value={nin} onChange={e => setNin(e.target.value)} placeholder="e.g. CM12345678ABCD" style={inputStyle} />
          </Field>
          {error && <div style={{ color: THEME.danger, fontSize: 13 }}>{error}</div>}
          <PrimaryButton disabled={busy} onClick={submit} style={{ padding: '12px 0', fontSize: 15 }}>
            {busy ? <Loader2 size={16} className="spin" /> : 'Continue'}
          </PrimaryButton>
          <GhostButton onClick={onLogout} style={{ alignSelf: 'center', border: 'none', color: THEME.inkSoft }}>Sign out instead</GhostButton>
        </Card>
      </div>
    </div>
  );
}

/* --------------------------------- app --------------------------------- */

const SESSION_KEY = 'amani_sacco_session';

export default function App() {
  const [session, setSession] = useState(() => {
    try { const raw = sessionStorage.getItem(SESSION_KEY); return raw ? JSON.parse(raw).session : null; } catch { return null; }
  });
  const [profile, setProfile] = useState(() => {
    try { const raw = sessionStorage.getItem(SESSION_KEY); return raw ? JSON.parse(raw).profile : null; } catch { return null; }
  });
  const [checkingSession, setCheckingSession] = useState(!!session);
  const [themeMode, setThemeMode] = useState(() => {
    try { return localStorage.getItem('amani_theme') || 'light'; } catch { return 'light'; }
  });

  applyThemeMode(themeMode); // mutate the shared THEME object before this render paints

  function toggleTheme() {
    const next = themeMode === 'dark' ? 'light' : 'dark';
    setThemeMode(next);
    try { localStorage.setItem('amani_theme', next); } catch { /* ignore */ }
  }

  // Persist whenever session/profile change; clear on logout.
  useEffect(() => {
    try {
      if (session && profile) sessionStorage.setItem(SESSION_KEY, JSON.stringify({ session, profile }));
      else sessionStorage.removeItem(SESSION_KEY);
    } catch { /* storage unavailable — session just won't persist across refresh */ }
  }, [session, profile]);

  // On first load with a cached session, re-fetch the profile so any
  // status/role change made elsewhere (e.g. approval, role change)
  // is picked up rather than trusting a possibly-stale cached copy.
  useEffect(() => {
    if (!session) { setCheckingSession(false); return; }
    (async () => {
      try {
        const fresh = await sb(`/rest/v1/profiles?id=eq.${session.user.id}&select=*`, { token: session.access_token });
        if (fresh && fresh[0]) setProfile(fresh[0]);
        else { setSession(null); setProfile(null); }
      } catch {
        // token likely expired/invalid — fall back to signing out
        setSession(null); setProfile(null);
      } finally {
        setCheckingSession(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (checkingSession) {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spinner /></div>;
  }

  return (
    <div key={themeMode} style={{ minHeight: '100vh', background: THEME.paper, fontFamily: 'Inter, sans-serif', color: THEME.ink, transition: 'background 0.2s' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; min-width: 0; }
        html, body { margin: 0; padding: 0; width: 100%; max-width: 100vw; overflow-x: hidden; }
        #root { width: 100%; max-width: 100vw; overflow-x: hidden; }
        img, svg { max-width: 100%; }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        input:focus, select:focus { border-color: ${THEME.pine} !important; }
        .bottom-nav-scroll { scrollbar-width: none; -ms-overflow-style: none; }
        .bottom-nav-scroll::-webkit-scrollbar { display: none; }
        button { min-height: 34px; }
        textarea { font-family: inherit; }
      `}</style>
      {!session || !profile ? (
        <AuthScreen onAuthed={(sess, prof) => { setSession(sess); setProfile(prof); }} themeMode={themeMode} onToggleTheme={toggleTheme} />
      ) : (!profile.nin || !profile.photo_url) ? (
        <KycCompletionScreen
          profile={profile} token={session.access_token}
          onDone={updated => setProfile(updated)}
          onLogout={() => { setSession(null); setProfile(null); }}
        />
      ) : profile.status !== 'active' ? (
        <AwaitingApprovalScreen profile={profile} onLogout={() => { setSession(null); setProfile(null); }} />
      ) : profile.role !== 'member' ? (
        <AdminApp profile={profile} token={session.access_token} onLogout={() => { setSession(null); setProfile(null); }} themeMode={themeMode} onToggleTheme={toggleTheme} />
      ) : (
        <MemberApp profile={profile} token={session.access_token} onLogout={() => { setSession(null); setProfile(null); }} themeMode={themeMode} onToggleTheme={toggleTheme} />
      )}
    </div>
  );
}
