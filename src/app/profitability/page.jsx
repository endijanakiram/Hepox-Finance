'use client';

import { useEffect, useState, useMemo } from 'react';
import { TrendingUp, TrendingDown, DollarSign, Award, AlertCircle } from 'lucide-react';
import { fetchSettings } from '../../lib/supabase';
import { fetchEnrichedUnits, calculateProfitability, formatINR } from '../../lib/engines';
import { PageHeader, MetricCard, StatusBadge, Spinner, EmptyState } from '../../components/UI';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { clsx } from 'clsx';

export default function ProfitabilityPage() {
  const [units, setUnits]       = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [view, setView]         = useState('cash-received'); // 'cash-received' | 'all'

  useEffect(() => {
    (async () => {
      try {
        const s = await fetchSettings();
        setSettings(s);
        const enriched = await fetchEnrichedUnits(s);
        setUnits(enriched);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Enrich with profitability data
  const enrichedWithPnl = useMemo(() => {
    if (!settings) return [];
    return units
      .filter(u => u.selling_price && (view === 'all' || u.status === 'Cash-Received'))
      .map(u => {
        const pnl = calculateProfitability(u, u.costBreakdown, settings);
        return { ...u, pnl };
      })
      .sort((a, b) => b.pnl.netProfit - a.pnl.netProfit);
  }, [units, settings, view]);

  // Aggregate stats
  const agg = useMemo(() => {
    const profitable = enrichedWithPnl.filter(u => u.pnl.netProfit >= 0);
    const losing     = enrichedWithPnl.filter(u => u.pnl.netProfit < 0);
    const totalRevenue = enrichedWithPnl.reduce((s, u) => s + u.pnl.netRevenue, 0);
    const totalCost    = enrichedWithPnl.reduce((s, u) => s + u.pnl.totalCostWithRisk, 0);
    const totalProfit  = enrichedWithPnl.reduce((s, u) => s + u.pnl.netProfit, 0);
    const avgMargin    = enrichedWithPnl.length > 0
      ? enrichedWithPnl.reduce((s, u) => s + u.pnl.marginPct, 0) / enrichedWithPnl.length
      : 0;
    return { profitable: profitable.length, losing: losing.length, totalRevenue, totalCost, totalProfit, avgMargin };
  }, [enrichedWithPnl]);

  // Chart data — top 10 by profit
  const chartData = enrichedWithPnl.slice(0, 10).map(u => ({
    name:   u.serial_number.slice(-8),
    profit: parseFloat(u.pnl.netProfit.toFixed(0)),
  }));

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const v = payload[0].value;
    return (
      <div className="bg-[#111820] border border-slate-700 rounded-lg px-3 py-2 text-xs">
        <p className={v >= 0 ? 'text-emerald-400' : 'text-red-400'}>{formatINR(v)}</p>
      </div>
    );
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <PageHeader
        title="Profitability"
        subtitle="Net profit per unit after platform fees, interest, and risk buffer"
        action={
          <div className="flex gap-2 bg-slate-900 border border-slate-800 rounded-lg p-1">
            {[
              { key: 'cash-received', label: 'Cash Received' },
              { key: 'all',           label: 'All Sold' },
            ].map(v => (
              <button
                key={v.key}
                onClick={() => setView(v.key)}
                className={clsx(
                  'px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                  view === v.key
                    ? 'bg-amber-500 text-black'
                    : 'text-slate-500 hover:text-slate-300'
                )}
              >{v.label}</button>
            ))}
          </div>
        }
      />

      {loading ? (
        <div className="flex justify-center py-24"><Spinner size={28} /></div>
      ) : (
        <div className="space-y-8 animate-fade-in">
          {/* KPI row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard label="Total Net Profit" value={formatINR(agg.totalProfit)} accent icon={TrendingUp} />
            <MetricCard label="Avg. Margin" value={`${agg.avgMargin.toFixed(1)}%`} icon={Award} />
            <MetricCard label="Profitable Units" value={agg.profitable} sub={`${agg.losing} at a loss`} icon={TrendingUp} />
            <MetricCard label="Net Revenue" value={formatINR(agg.totalRevenue)} sub={`vs ₹${formatINR(agg.totalCost)} cost`} icon={DollarSign} />
          </div>

          {/* Chart */}
          {chartData.length > 0 && (
            <div className="bg-[#0b1015] border border-slate-800/60 rounded-xl p-6">
              <h2 className="text-sm font-semibold text-slate-300 mb-5" style={{ fontFamily: 'Syne, sans-serif' }}>
                Net Profit per Unit (Top 10)
              </h2>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={chartData} barSize={28}>
                  <XAxis dataKey="name" tick={{ fill: '#475569', fontSize: 10, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#475569', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `₹${v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}`} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                  <Bar dataKey="profit" radius={[4, 4, 0, 0]}>
                    {chartData.map((entry, i) => (
                      <Cell key={i} fill={entry.profit >= 0 ? '#10b981' : '#ef4444'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Table */}
          {enrichedWithPnl.length === 0 ? (
            <EmptyState icon={TrendingUp} message="No sold units yet" sub="Mark units as Cash-Received and set a selling price to see P&L" />
          ) : (
            <div className="bg-[#0b1015] border border-slate-800/60 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full ledger-table">
                  <thead>
                    <tr>
                      <th className="text-left">Serial No.</th>
                      <th className="text-left">Product</th>
                      <th className="text-left">Status</th>
                      <th className="text-right">Sell Price</th>
                      <th className="text-right">Platform Fee</th>
                      <th className="text-right">Net Revenue</th>
                      <th className="text-right">Total Cost</th>
                      <th className="text-right">Risk Buffer</th>
                      <th className="text-right font-bold">Net Profit</th>
                      <th className="text-right">Margin</th>
                      <th className="text-right">ROI</th>
                    </tr>
                  </thead>
                  <tbody>
                    {enrichedWithPnl.map(u => {
                      const p = u.pnl;
                      const profitable = p.netProfit >= 0;
                      return (
                        <tr key={u.id}>
                          <td className="num text-sm text-slate-200">{u.serial_number}</td>
                          <td className="text-sm text-slate-400">{u.product_name}</td>
                          <td><StatusBadge status={u.status} /></td>
                          <td className="text-right num text-sm text-slate-300">{formatINR(p.sellingPrice)}</td>
                          <td className="text-right num text-sm text-slate-500">
                            {formatINR(p.platformFee)}
                            <span className="text-xs ml-1">({p.platformFeePct}%)</span>
                          </td>
                          <td className="text-right num text-sm text-slate-300">{formatINR(p.netRevenue)}</td>
                          <td className="text-right num text-sm text-amber-400">{formatINR(u.costBreakdown.totalCost)}</td>
                          <td className="text-right num text-sm text-slate-500">{formatINR(p.riskBuffer)}</td>
                          <td className="text-right">
                            <span className={clsx('num text-base font-bold', profitable ? 'text-emerald-400' : 'text-red-400')}>
                              {profitable ? '+' : ''}{formatINR(p.netProfit)}
                            </span>
                          </td>
                          <td className="text-right">
                            <span className={clsx('num text-sm font-semibold', profitable ? 'text-emerald-400' : 'text-red-400')}>
                              {p.marginPct.toFixed(1)}%
                            </span>
                          </td>
                          <td className="text-right">
                            <span className={clsx('num text-sm', p.roi >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                              {p.roi.toFixed(1)}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {/* Summary footer */}
                  <tfoot>
                    <tr className="border-t border-slate-700 bg-slate-900/50">
                      <td colSpan={5} className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-widest">Total</td>
                      <td className="text-right num text-sm font-semibold text-slate-300 px-4 py-3">{formatINR(agg.totalRevenue)}</td>
                      <td colSpan={2} className="text-right num text-sm font-semibold text-amber-400 px-4 py-3">{formatINR(agg.totalCost)}</td>
                      <td className={clsx('text-right num text-base font-bold px-4 py-3', agg.totalProfit >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                        {agg.totalProfit >= 0 ? '+' : ''}{formatINR(agg.totalProfit)}
                      </td>
                      <td className={clsx('text-right num text-sm font-semibold px-4 py-3', agg.avgMargin >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                        {agg.avgMargin.toFixed(1)}%
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Settings reminder */}
          {settings && (
            <div className="flex items-start gap-3 px-5 py-3 bg-slate-900/50 border border-slate-800 rounded-xl">
              <AlertCircle size={16} className="text-slate-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-slate-500">
                Calculations use: Platform fee {settings.standard_platform_fee_pct}% ·
                Risk buffer {settings.risk_buffer_percentage}% ·
                Interest {settings.annual_interest_rate}% p.a. ·
                CNY rate ₹{settings.default_currency_conversion}.
                Change these in <a href="/admin" className="text-amber-400 hover:underline">Admin Settings</a>.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
