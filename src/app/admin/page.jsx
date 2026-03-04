'use client';

import { useEffect, useState } from 'react';
import { Settings, Save, History, AlertTriangle, CheckCircle, Info } from 'lucide-react';
import { supabase, fetchSettings, updateSetting } from '../../lib/supabase';
import { PageHeader, SectionCard, Button, Field, Alert, Spinner } from '../../components/UI';
import { clsx } from 'clsx';

const SETTING_META = {
  annual_interest_rate: {
    label:       'Annual Interest Rate',
    unit:        '%',
    description: 'Applied daily to each unit\'s accumulated cost. Formula: cost × (rate/100/365) × days.',
    min: 0, max: 50, step: 0.01,
    impact:      'high',
    warning:     'Changing this affects all future interest calculations. Historical snapshots are unaffected.',
  },
  risk_buffer_percentage: {
    label:       'Risk Buffer',
    unit:        '%',
    description: 'Added on top of total cost to account for rejections, cancellations, and unforeseen losses.',
    min: 0, max: 20, step: 0.01,
    impact:      'medium',
    warning:     'Affects profitability calculations for all units.',
  },
  default_currency_conversion: {
    label:       'CNY → INR Rate',
    unit:        '₹/CNY',
    description: 'Default exchange rate used to auto-fill the INR price when entering CNY purchase price.',
    min: 1, max: 30, step: 0.01,
    impact:      'low',
    warning:     'Used only for quick estimates. Actual INR price should be confirmed at time of purchase.',
  },
  standard_platform_fee_pct: {
    label:       'Platform Fee',
    unit:        '%',
    description: 'Percentage deducted from selling price (e.g. Amazon, Flipkart commission). Can be overridden per unit.',
    min: 0, max: 50, step: 0.01,
    impact:      'high',
    warning:     'Affects net revenue and profit calculations for all units without a unit-level fee override.',
  },
};

const IMPACT_COLORS = {
  high:   'text-red-400 bg-red-900/20 border-red-700/30',
  medium: 'text-amber-400 bg-amber-900/20 border-amber-700/30',
  low:    'text-emerald-400 bg-emerald-900/20 border-emerald-700/30',
};

export default function AdminPage() {
  const [settings, setSettings]   = useState({});
  const [original, setOriginal]   = useState({});
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(null);
  const [alert, setAlert]         = useState(null);
  const [history, setHistory]     = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const s = await fetchSettings();
      setSettings({ ...s });
      setOriginal({ ...s });

      // Load raw rows for history display
      const { data } = await supabase
        .from('global_settings')
        .select('*')
        .order('updated_at', { ascending: false });
      setHistory(data || []);
    } catch (e) {
      setAlert({ type: 'error', message: e.message });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function handleChange(key, value) {
    setSettings(prev => ({ ...prev, [key]: value }));
  }

  async function saveSetting(key) {
    setSaving(key);
    setAlert(null);
    try {
      await updateSetting(key, settings[key]);
      setOriginal(prev => ({ ...prev, [key]: settings[key] }));
      setAlert({
        type: 'success',
        message: `${SETTING_META[key]?.label || key} updated to ${settings[key]}${SETTING_META[key]?.unit || ''}.`,
      });
      load(); // Refresh history
    } catch (e) {
      setAlert({ type: 'error', message: e.message });
    } finally {
      setSaving(null);
    }
  }

  async function saveAll() {
    setSaving('all');
    setAlert(null);
    try {
      const changed = Object.keys(settings).filter(k => settings[k] !== original[k]);
      if (changed.length === 0) {
        setAlert({ type: 'info', message: 'No changes to save.' });
        setSaving(null);
        return;
      }
      await Promise.all(changed.map(k => updateSetting(k, settings[k])));
      setOriginal({ ...settings });
      setAlert({ type: 'success', message: `${changed.length} setting(s) saved successfully.` });
      load();
    } catch (e) {
      setAlert({ type: 'error', message: e.message });
    } finally {
      setSaving(null);
    }
  }

  const hasChanges = Object.keys(settings).some(k => settings[k] !== original[k]);

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <PageHeader
        title="Admin Settings"
        subtitle="Global variables controlling all calculations — changes apply going forward"
        action={
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setShowHistory(!showHistory)}>
              <History size={14} />
              History
            </Button>
            <Button variant="primary" onClick={saveAll} loading={saving === 'all'} disabled={!hasChanges}>
              <Save size={14} />
              Save All Changes
            </Button>
          </div>
        }
      />

      {alert && (
        <div className="mb-6">
          <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} />
        </div>
      )}

      {/* Forward-only notice */}
      <div className="flex items-start gap-3 px-5 py-4 bg-blue-900/10 border border-blue-700/20 rounded-xl mb-8">
        <Info size={17} className="text-blue-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-blue-300">Forward-Only Updates</p>
          <p className="text-xs text-blue-400/70 mt-0.5">
            When you update a rate (e.g. interest from 12% → 11%), the new rate applies to all calculations made from
            this point forward. Interest already logged in the accrual log retains its historical rate. This preserves
            audit integrity while allowing flexible rate management.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner size={28} /></div>
      ) : (
        <div className="space-y-5">
          {Object.entries(SETTING_META).map(([key, meta]) => {
            const current  = settings[key] ?? '';
            const orig     = original[key] ?? '';
            const changed  = current !== orig;
            const impactCls = IMPACT_COLORS[meta.impact];

            return (
              <div
                key={key}
                className={clsx(
                  'bg-[#0b1015] border rounded-xl p-6 transition-all',
                  changed ? 'border-amber-500/30 shadow-amber-500/5 shadow-lg' : 'border-slate-800/60'
                )}
              >
                <div className="flex items-start gap-6">
                  {/* Left: info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="font-semibold text-white" style={{ fontFamily: 'Syne, sans-serif' }}>
                        {meta.label}
                      </h3>
                      <span className={clsx('text-xs px-2 py-0.5 rounded border font-semibold', impactCls)}>
                        {meta.impact} impact
                      </span>
                      {changed && (
                        <span className="text-xs px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-400">
                          Modified
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mb-2">{meta.description}</p>
                    {meta.warning && (
                      <p className="text-xs text-slate-600 flex items-center gap-1">
                        <AlertTriangle size={11} className="text-amber-600" />
                        {meta.warning}
                      </p>
                    )}
                  </div>

                  {/* Right: input + save */}
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="relative">
                      <input
                        type="number"
                        step={meta.step}
                        min={meta.min}
                        max={meta.max}
                        value={current}
                        onChange={e => handleChange(key, parseFloat(e.target.value) || 0)}
                        className={clsx(
                          'w-32 bg-[#111820] border rounded-lg text-right num text-white px-3 py-2.5 pr-10 outline-none transition-all',
                          changed
                            ? 'border-amber-500/50 focus:border-amber-400'
                            : 'border-slate-700 focus:border-slate-500'
                        )}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">
                        {meta.unit}
                      </span>
                    </div>
                    {changed && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500 num line-through">{orig}{meta.unit}</span>
                        <button
                          onClick={() => saveSetting(key)}
                          disabled={!!saving}
                          className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 transition"
                          title="Save this setting"
                        >
                          {saving === key ? <Spinner size={14} /> : <Save size={14} />}
                        </button>
                        <button
                          onClick={() => handleChange(key, orig)}
                          className="p-2 rounded-lg bg-slate-800 text-slate-500 hover:text-slate-300 transition"
                          title="Revert"
                        >
                          ×
                        </button>
                      </div>
                    )}
                    {!changed && (
                      <CheckCircle size={16} className="text-slate-700" />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Formula preview */}
      {!loading && settings && (
        <SectionCard title="📐 Live Formula Preview" className="mt-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div className="bg-slate-900/60 rounded-lg p-4 font-mono text-xs space-y-1.5">
              <p className="text-slate-500">// Daily Interest Engine</p>
              <p className="text-amber-400">daily_rate = {settings.annual_interest_rate}% ÷ 365</p>
              <p className="text-slate-300">           = {(settings.annual_interest_rate / 365).toFixed(6)}% per day</p>
              <p className="text-slate-500 mt-2">// Example: ₹50,000 unit for 30 days</p>
              <p className="text-emerald-400">interest = ₹50,000 × {(settings.annual_interest_rate/100/365).toFixed(6)} × 30</p>
              <p className="text-slate-200">         = {formatINR(50000 * (settings.annual_interest_rate/100/365) * 30)}</p>
            </div>
            <div className="bg-slate-900/60 rounded-lg p-4 font-mono text-xs space-y-1.5">
              <p className="text-slate-500">// Profitability Engine</p>
              <p className="text-amber-400">platform_fee = sell_price × {settings.standard_platform_fee_pct}%</p>
              <p className="text-amber-400">risk_buffer  = total_cost × {settings.risk_buffer_percentage}%</p>
              <p className="text-slate-500 mt-2">// Example: Sell ₹80,000, Cost ₹60,000</p>
              <p className="text-slate-300">platform_fee = {formatINR(80000 * settings.standard_platform_fee_pct / 100)}</p>
              <p className="text-slate-300">risk_buffer  = {formatINR(60000 * settings.risk_buffer_percentage / 100)}</p>
              <p className="text-emerald-400">net_profit   = {formatINR(80000 - (80000*settings.standard_platform_fee_pct/100) - 60000 - (60000*settings.risk_buffer_percentage/100))}</p>
            </div>
          </div>
          <p className="text-xs text-slate-600 mt-3">
            CNY → INR: 1 CNY = ₹{settings.default_currency_conversion} (used for quick purchase price estimates)
          </p>
        </SectionCard>
      )}

      {/* Settings history */}
      {showHistory && (
        <SectionCard title="📋 Settings History" className="mt-6">
          {history.length === 0 ? (
            <p className="text-sm text-slate-500">No history available.</p>
          ) : (
            <table className="w-full ledger-table">
              <thead>
                <tr>
                  <th className="text-left">Setting</th>
                  <th className="text-right">Current Value</th>
                  <th className="text-left">Last Updated</th>
                </tr>
              </thead>
              <tbody>
                {history.map(row => (
                  <tr key={row.id}>
                    <td className="text-sm text-slate-300">{SETTING_META[row.key]?.label || row.key}</td>
                    <td className="text-right num text-sm text-amber-400">
                      {row.value}{SETTING_META[row.key]?.unit || ''}
                    </td>
                    <td className="text-xs text-slate-500">
                      {new Date(row.updated_at).toLocaleString('en-IN')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>
      )}
    </div>
  );
}
