import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useKit, tints, STAGES, stageIndex } from './kit.js';

/* Styles that cannot be written inline (range inputs, animation, scrollbars). */
export function LoanStyles() {
  const { THEME } = useKit();
  const T = tints(THEME);
  return (
    <style>{`
      .ln-range { -webkit-appearance: none; appearance: none; width: 100%; height: 6px; border-radius: 99px;
        background: ${THEME.line}; outline: none; margin: 0; }
      .ln-range::-webkit-slider-thumb { -webkit-appearance: none; width: 26px; height: 26px; border-radius: 50%;
        background: ${T.sun}; border: 4px solid ${THEME.surface}; box-shadow: 0 2px 8px rgba(0,0,0,.28); cursor: grab; }
      .ln-range::-moz-range-thumb { width: 20px; height: 20px; border-radius: 50%; background: ${T.sun};
        border: 4px solid ${THEME.surface}; box-shadow: 0 2px 8px rgba(0,0,0,.28); cursor: grab; }
      .ln-range:focus-visible::-webkit-slider-thumb { outline: 3px solid ${THEME.pine}66; }
      .ln-rise { animation: lnRise .22s ease-out; }
      @keyframes lnRise { from { transform: translateY(14px); opacity: 0; } to { transform: none; opacity: 1; } }
      .ln-fade { animation: lnFade .18s ease-out; }
      @keyframes lnFade { from { opacity: 0; } to { opacity: 1; } }
      .ln-hscroll { scrollbar-width: none; -ms-overflow-style: none; }
      .ln-hscroll::-webkit-scrollbar { display: none; }
      .ln-press:active { transform: scale(.98); }
      .ln-row:hover { background: ${THEME.mode === 'dark' ? '#ffffff08' : '#0f3d3a06'}; }
    `}</style>
  );
}

export function useInputStyle() {
  const { THEME } = useKit();
  return {
    border: `1px solid ${THEME.line}`, borderRadius: 12, padding: '11px 13px', fontSize: 14, outline: 'none',
    color: THEME.ink, fontFamily: 'Inter, sans-serif', background: THEME.surface, width: '100%',
  };
}

/* Pastel surface used for the big friendly cards. */
export function Tile({ tone = 'mint', children, style, onClick, pad = 16 }) {
  const { THEME } = useKit();
  const T = tints(THEME);
  const interactive = onClick
    ? {
        role: 'button', tabIndex: 0, onClick,
        onKeyDown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(e); } },
      }
    : {};
  return (
    <div {...interactive} className={onClick ? 'ln-press' : undefined} style={{
      background: T[tone] || tone, borderRadius: 24, padding: pad, border: 'none', textAlign: 'left',
      color: THEME.ink, width: '100%', cursor: onClick ? 'pointer' : 'default', font: 'inherit', display: 'block',
      boxSizing: 'border-box', ...style,
    }}>{children}</div>
  );
}

export function Pill({ children, onClick, tone = 'dark', style, disabled, title, decorative }) {
  const { THEME } = useKit();
  const T = tints(THEME);
  const bg = tone === 'dark' ? (THEME.mode === 'dark' ? '#F2F3F0' : '#16241F') : tone === 'sun' ? T.sun : tone === 'ghost' ? 'transparent' : THEME.surface;
  const fg = tone === 'dark' ? (THEME.mode === 'dark' ? '#0A0F0E' : '#fff') : tone === 'sun' ? T.sunInk : THEME.ink;
  const look = {
    background: bg, color: fg, border: tone === 'ghost' ? `1px solid ${THEME.line}` : 'none', borderRadius: 999,
    padding: '8px 16px', fontWeight: 700, fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6,
    whiteSpace: 'nowrap', minHeight: 34, boxSizing: 'border-box', ...style,
  };
  if (decorative) return <span style={look}>{children}</span>;
  return (
    <button onClick={onClick} disabled={disabled} title={title} className="ln-press"
      style={{ ...look, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.55 : 1 }}>{children}</button>
  );
}

export function Money({ value, size = 28, style }) {
  const { THEME, fmt } = useKit();
  const s = fmt(value);
  const [cur, num] = [s.slice(0, 3), s.slice(4)];
  return (
    <span style={{ fontFamily: 'Fraunces, serif', color: THEME.ink, lineHeight: 1.05, whiteSpace: 'nowrap', ...style }}>
      <span style={{ fontSize: Math.round(size * 0.46), fontFamily: 'Inter, sans-serif', fontWeight: 600, opacity: 0.6, marginRight: 5 }}>{cur}</span>
      <span style={{ fontSize: size }}>{num}</span>
    </span>
  );
}

export function Eyebrow({ children, style }) {
  const { THEME } = useKit();
  return <div style={{ fontSize: 11.5, fontWeight: 600, color: THEME.inkSoft, letterSpacing: 0.2, ...style }}>{children}</div>;
}

export function ErrorNote({ msg, onClose }) {
  const { THEME } = useKit();
  if (!msg) return null;
  return (
    <div role="alert" className="ln-fade" style={{
      background: THEME.danger + '16', border: `1px solid ${THEME.danger}55`, color: THEME.danger, borderRadius: 12,
      padding: '10px 12px', fontSize: 13, display: 'flex', gap: 10, alignItems: 'flex-start', justifyContent: 'space-between',
    }}>
      <span>{msg}</span>
      {onClose && <button onClick={onClose} aria-label="Dismiss" style={{ background: 'none', border: 'none', cursor: 'pointer', color: THEME.danger, padding: 0, minHeight: 0 }}><X size={15} /></button>}
    </div>
  );
}

export function OkNote({ msg }) {
  const { THEME } = useKit();
  if (!msg) return null;
  return (
    <div role="status" className="ln-fade" style={{
      background: THEME.success + '16', border: `1px solid ${THEME.success}55`, color: THEME.success, borderRadius: 12,
      padding: '10px 12px', fontSize: 13,
    }}>{msg}</div>
  );
}

/* Bottom sheet on phones, centred dialog on wide screens. */
export function Sheet({ title, onClose, children, width = 520 }) {
  const { THEME, useIsDesktop } = useKit();
  const wide = useIsDesktop();
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  return (
    <div className="ln-fade" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }} style={{
      position: 'fixed', inset: 0, background: 'rgba(8,18,16,.55)', zIndex: 60, display: 'flex',
      alignItems: wide ? 'center' : 'flex-end', justifyContent: 'center',
    }}>
      <div role="dialog" aria-modal="true" aria-label={title} className="ln-rise" style={{
        background: THEME.surface, color: THEME.ink, width: '100%', maxWidth: width, maxHeight: '92vh', overflowY: 'auto',
        borderRadius: wide ? 24 : '26px 26px 0 0', padding: '18px 18px calc(22px + env(safe-area-inset-bottom))',
        boxShadow: '0 20px 60px rgba(0,0,0,.35)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontFamily: 'Fraunces, serif', fontSize: 20 }}>{title}</div>
          <button onClick={onClose} aria-label="Close" style={{
            background: THEME.paper, border: 'none', borderRadius: '50%', width: 36, height: 36, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: THEME.ink,
          }}><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* Slider with a floating value bubble. */
export function RangeField({ label, value, min, max, step = 1, onChange, format = v => String(v), hint }) {
  const { THEME } = useKit();
  const T = tints(THEME);
  if (max <= min) {
    // nothing to choose (e.g. a product with one fixed term): show the value instead of a dead slider
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600, color: THEME.inkSoft }}>
        <span>{label}</span><span style={{ color: THEME.ink }}>{format(min)}</span>
      </div>
    );
  }
  const safeMax = Math.max(max, min + step);
  const pct = Math.min(100, Math.max(0, ((value - min) / (safeMax - min)) * 100));
  return (
    <div style={{ paddingTop: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: THEME.inkSoft, fontWeight: 600 }}>
        <span>{label}</span>{hint && <span style={{ fontWeight: 500 }}>{hint}</span>}
      </div>
      <div style={{ position: 'relative', marginTop: 30, padding: '0 4px' }}>
        <div aria-hidden style={{
          position: 'absolute', top: -30, left: `calc(${pct}% - ${pct * 0.26}px)`, transform: 'translateX(-30%)',
          background: THEME.surface, color: THEME.ink, fontWeight: 700, fontSize: 12, padding: '3px 10px', borderRadius: 999,
          boxShadow: '0 2px 10px rgba(0,0,0,.14)', border: `1px solid ${THEME.line}`, whiteSpace: 'nowrap',
        }}><span style={{ color: T.sunInk === '#3A2E05' ? '#B8860B' : T.sun }}>●</span> {format(value)}</div>
        <input className="ln-range" type="range" min={min} max={safeMax} step={step} value={Math.min(Math.max(value, min), safeMax)}
          aria-label={label} onChange={e => onChange(Number(e.target.value))}
          style={{ background: `linear-gradient(90deg, ${T.sun} ${pct}%, ${THEME.line} ${pct}%)` }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: THEME.inkSoft, marginTop: 6 }}>
        <span>{format(min)}</span><span>{format(safeMax)}</span>
      </div>
    </div>
  );
}

/* Chevron pipeline, as in a loan-origination CRM. */
export function StageTrack({ stage, rejected, compact }) {
  const { THEME } = useKit();
  const current = stageIndex(stage);
  const shape = (first) => first
    ? 'polygon(0 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 0 100%)'
    : 'polygon(0 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 0 100%, 10px 50%)';
  return (
    <div role="list" aria-label="Loan stage" className="ln-hscroll" style={{ display: 'flex', gap: 3, overflowX: 'auto' }}>
      {STAGES.map((s, i) => {
        const done = !rejected && i < current;
        const now = !rejected && i === current;
        const bg = rejected ? THEME.line : now ? THEME.success : done ? THEME.success + '38' : THEME.mode === 'dark' ? '#ffffff12' : '#00000010';
        const fg = now ? '#fff' : done ? THEME.success : THEME.inkSoft;
        return (
          <div key={s.key} role="listitem" aria-current={now ? 'step' : undefined} style={{
            flex: '1 0 auto', minWidth: compact ? 34 : 92, height: compact ? 22 : 34, background: bg, color: fg,
            clipPath: shape(i === 0), display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: compact ? 10 : 12, fontWeight: 700, padding: '0 14px', whiteSpace: 'nowrap',
          }}>{compact ? (now ? s.label : i + 1) : `${i + 1}  ${s.label}`}</div>
        );
      })}
    </div>
  );
}

export function Ring({ pct, size = 64, stroke = 7, color, children }) {
  const { THEME } = useKit();
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const v = Math.min(100, Math.max(0, pct));
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }} role="img" aria-label={`${v}% repaid`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={THEME.mode === 'dark' ? '#ffffff1c' : '#00000014'} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color || THEME.pine} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c - (c * v) / 100} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.24, fontWeight: 700 }}>{children ?? `${v}%`}</div>
    </div>
  );
}

export function Bar({ pct, color, height = 8, bg }) {
  const { THEME } = useKit();
  return (
    <div style={{ background: bg || (THEME.mode === 'dark' ? '#ffffff1c' : '#0000001a'), borderRadius: 99, height, overflow: 'hidden' }}>
      <div style={{ width: `${Math.min(100, Math.max(0, pct))}%`, height: '100%', background: color || THEME.pine, borderRadius: 99, transition: 'width .3s' }} />
    </div>
  );
}

export function Seg({ options, value, onChange, style }) {
  const { THEME } = useKit();
  return (
    <div role="tablist" className="ln-hscroll" style={{ display: 'flex', gap: 6, overflowX: 'auto', ...style }}>
      {options.map(o => {
        const on = o.value === value;
        return (
          <button key={o.value} role="tab" aria-selected={on} onClick={() => onChange(o.value)} style={{
            flex: '0 0 auto', border: on ? 'none' : `1px solid ${THEME.line}`, borderRadius: 999, padding: '8px 15px', cursor: 'pointer',
            fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', minHeight: 36,
            background: on ? (THEME.mode === 'dark' ? '#F2F3F0' : '#16241F') : 'transparent',
            color: on ? (THEME.mode === 'dark' ? '#0A0F0E' : '#fff') : THEME.inkSoft,
          }}>{o.label}{o.count != null && <span style={{ opacity: 0.7, marginLeft: 6 }}>{o.count}</span>}</button>
        );
      })}
    </div>
  );
}

/* Activity feed: oldest at the bottom, newest first. */
export function Timeline({ events, empty = 'Nothing has happened on this loan yet.' }) {
  const { THEME, fmtDateTime, EmptyState } = useKit();
  if (!events || events.length === 0) return <EmptyState text={empty} />;
  const tone = k => k === 'payment' ? THEME.success : k === 'note' ? THEME.gold : k === 'guarantor' ? '#5B8DEF' : k === 'collateral' ? '#9B6BDF' : THEME.pine;
  return (
    <div style={{ position: 'relative', paddingLeft: 22 }}>
      <div aria-hidden style={{ position: 'absolute', left: 6, top: 6, bottom: 6, width: 2, background: THEME.line }} />
      {events.map(e => (
        <div key={e.id} style={{ position: 'relative', paddingBottom: 14 }}>
          <span aria-hidden style={{ position: 'absolute', left: -22, top: 3, width: 14, height: 14, borderRadius: '50%', background: THEME.surface, border: `3px solid ${tone(e.kind)}` }} />
          <div style={{ fontSize: 13, color: THEME.ink, lineHeight: 1.45 }}>{e.message}</div>
          <div style={{ fontSize: 11, color: THEME.inkSoft, marginTop: 2 }}>
            {fmtDateTime(e.created_at)}{e.visibility === 'internal' ? ' · internal' : ''}
          </div>
        </div>
      ))}
    </div>
  );
}

export function Kpi({ label, value, sub, tone, icon: Icon, accent }) {
  const { THEME } = useKit();
  const T = tints(THEME);
  return (
    <div style={{
      background: tone ? T[tone] : THEME.surface, border: tone ? 'none' : `1px solid ${THEME.line}`, borderRadius: 20,
      padding: '14px 16px', minWidth: 0, flex: '1 1 150px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: THEME.inkSoft, fontWeight: 600 }}>
        {Icon && <span style={{ width: 26, height: 26, borderRadius: 9, background: (accent || THEME.pine) + '22', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon size={14} color={accent || THEME.pine} /></span>}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      </div>
      <div style={{ fontFamily: 'Fraunces, serif', fontSize: 24, marginTop: 8, color: THEME.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: THEME.inkSoft, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

export function Row({ label, value, strong }) {
  const { THEME } = useKit();
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '7px 0', fontSize: 13 }}>
      <span style={{ color: THEME.inkSoft }}>{label}</span>
      <span style={{ fontWeight: strong ? 700 : 600, textAlign: 'right', color: THEME.ink }}>{value}</span>
    </div>
  );
}

export const stageTone = (stage) => ({
  application: 'sky', appraisal: 'butter', committee: 'lilac', approved: 'mint', disbursed: 'mint', closed: 'sky', rejected: 'blush',
}[stage] || 'sky');

export function useToggle(initial = false) {
  const [v, setV] = useState(initial);
  return [v, () => setV(x => !x), setV];
}
