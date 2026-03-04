'use client';

import { clsx } from 'clsx';

// ─── Status Badge ─────────────────────────────────────────────
const STATUS_CONFIG = {
  'In-Transit':    { dot: 'bg-blue-400',   text: 'text-blue-300',   bg: 'bg-blue-900/30 border-blue-700/40'   },
  'In-Warehouse':  { dot: 'bg-amber-400',  text: 'text-amber-300',  bg: 'bg-amber-900/30 border-amber-700/40' },
  'Sold':          { dot: 'bg-purple-400', text: 'text-purple-300', bg: 'bg-purple-900/30 border-purple-700/40' },
  'Cash-Received': { dot: 'bg-emerald-400',text: 'text-emerald-300',bg: 'bg-emerald-900/30 border-emerald-700/40' },
  'Rejected':      { dot: 'bg-red-400',    text: 'text-red-300',    bg: 'bg-red-900/30 border-red-700/40'    },
  'Completed':     { dot: 'bg-emerald-400',text: 'text-emerald-300',bg: 'bg-emerald-900/30 border-emerald-700/40' },
  'Cancelled':     { dot: 'bg-red-400',    text: 'text-red-300',    bg: 'bg-red-900/30 border-red-700/40'    },
};

export function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG['In-Transit'];
  return (
    <span className={clsx('status-pill border', cfg.text, cfg.bg)}>
      <span className={clsx('w-1.5 h-1.5 rounded-full', cfg.dot)} />
      {status}
    </span>
  );
}

// ─── Metric Card ──────────────────────────────────────────────
export function MetricCard({ label, value, sub, accent = false, trend, icon: Icon }) {
  return (
    <div className={clsx(
      'rounded-xl border p-5 transition-all duration-200 card-glow animate-slide-up',
      accent
        ? 'bg-amber-500/5 border-amber-500/20'
        : 'bg-[#0b1015] border-slate-800/60'
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold tracking-widest uppercase text-slate-500 mb-2">{label}</p>
          <p className={clsx(
            'num text-2xl font-semibold leading-none truncate',
            accent ? 'text-amber-400' : 'text-slate-100'
          )}>{value}</p>
          {sub && <p className="text-xs text-slate-500 mt-2">{sub}</p>}
          {trend != null && (
            <p className={clsx('text-xs mt-1 num', trend >= 0 ? 'text-emerald-400' : 'text-red-400')}>
              {trend >= 0 ? '▲' : '▼'} {Math.abs(trend).toFixed(1)}%
            </p>
          )}
        </div>
        {Icon && (
          <div className={clsx(
            'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0',
            accent ? 'bg-amber-500/15' : 'bg-slate-800'
          )}>
            <Icon size={17} className={accent ? 'text-amber-400' : 'text-slate-400'} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page Header ─────────────────────────────────────────────
export function PageHeader({ title, subtitle, action }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-8">
      <div>
        <h1
          className="text-2xl font-bold text-white"
          style={{ fontFamily: 'Syne, sans-serif' }}
        >{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

// ─── Section Card ─────────────────────────────────────────────
export function SectionCard({ title, children, className = '' }) {
  return (
    <div className={clsx('bg-[#0b1015] rounded-xl border border-slate-800/60', className)}>
      {title && (
        <div className="px-6 py-4 border-b border-slate-800/60">
          <h2 className="text-sm font-semibold text-slate-300" style={{ fontFamily: 'Syne, sans-serif' }}>{title}</h2>
        </div>
      )}
      <div className="p-6">{children}</div>
    </div>
  );
}

// ─── Loading Spinner ─────────────────────────────────────────
export function Spinner({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="animate-spin text-amber-500">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeOpacity="0.2" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" />
    </svg>
  );
}

// ─── Empty State ─────────────────────────────────────────────
export function EmptyState({ icon: Icon, message, sub }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {Icon && <Icon size={40} className="text-slate-700 mb-4" />}
      <p className="text-slate-500 font-medium">{message}</p>
      {sub && <p className="text-xs text-slate-600 mt-1">{sub}</p>}
    </div>
  );
}

// ─── Form Field ───────────────────────────────────────────────
export function Field({ label, required, children, hint }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1.5">
        {label} {required && <span className="text-amber-500">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-slate-600 mt-1">{hint}</p>}
    </div>
  );
}

// ─── Button ───────────────────────────────────────────────────
export function Button({ children, variant = 'primary', loading, disabled, ...props }) {
  return (
    <button
      disabled={disabled || loading}
      className={clsx(
        'px-5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-150 flex items-center gap-2 justify-center',
        variant === 'primary'  && 'bg-amber-500 text-black hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed',
        variant === 'secondary' && 'bg-slate-800 text-slate-200 border border-slate-700 hover:border-slate-500 disabled:opacity-50',
        variant === 'danger'   && 'bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20',
        variant === 'ghost'    && 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50',
      )}
      {...props}
    >
      {loading && <Spinner size={14} />}
      {children}
    </button>
  );
}

// ─── Alert ───────────────────────────────────────────────────
export function Alert({ type = 'info', message, onClose }) {
  const styles = {
    info:    'bg-blue-900/20 border-blue-700/40 text-blue-300',
    success: 'bg-emerald-900/20 border-emerald-700/40 text-emerald-300',
    warning: 'bg-amber-900/20 border-amber-700/40 text-amber-300',
    error:   'bg-red-900/20 border-red-700/40 text-red-300',
  };
  return (
    <div className={clsx('flex items-center gap-3 px-4 py-3 rounded-lg border text-sm', styles[type])}>
      <span className="flex-1">{message}</span>
      {onClose && (
        <button onClick={onClose} className="opacity-60 hover:opacity-100 text-lg leading-none">×</button>
      )}
    </div>
  );
}
