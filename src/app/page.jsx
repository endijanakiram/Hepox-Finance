'use client';

import { useEffect, useState } from 'react';
import { Package, Ship, TrendingUp, DollarSign, Clock, AlertTriangle, RefreshCw } from 'lucide-react';
import { fetchSettings } from '../lib/supabase';
import { fetchDashboardStats, formatINR } from '../lib/engines';
import { MetricCard, Spinner, SectionCard } from '../components/UI';
import { StatusBadge } from '../components/UI';

export default function DashboardPage() {
  const [stats, setStats]     = useState(null);
  const [units, setUnits]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [refreshed, setRefreshed] = useState(null);

  async function load() {
    try {
      setLoading(true);
      setError(null);
      const settings = await fetchSettings();
      const result   = await fetchDashboardStats(settings);
      setStats(result.stats);
      setUnits(result.units.slice(0, 8)); // Latest 8 for table preview
      setRefreshed(new Date());
    } catch (e) {
      console.error(e);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  // Top 5 units by interest accrued
  const topInterestUnits = [...units]
    .sort((a, b) => b.costBreakdown.accruedInterest - a.costBreakdown.accruedInterest)
    .slice(0, 5);

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white" style={{ fontFamily: 'Syne, sans-serif' }}>
            Portfolio Overview
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Activity-Based Costing · Daily Interest Engine
            {refreshed && (
              <span className="ml-3 text-slate-600">
                Last updated: {refreshed.toLocaleTimeString('en-IN')}
              </span>
            )}
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-300 hover:border-slate-500 transition-all"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-6 px-4 py-3 bg-red-900/20 border border-red-700/40 rounded-lg text-red-300 text-sm flex items-center gap-2">
          <AlertTriangle size={16} />
          {error} — Check your Supabase credentials in .env.local
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-32">
          <Spinner size={32} />
        </div>
      ) : stats && (
        <div className="space-y-8 animate-fade-in">
          {/* ── KPI Grid ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              label="Total Units"
              value={stats.totalUnits}
              sub={`${stats.inWarehouse} in warehouse · ${stats.inTransit} in transit`}
              icon={Package}
            />
            <MetricCard
              label="Portfolio Cost"
              value={formatINR(stats.totalPortfolioCost)}
              sub="Base + expenses + interest"
              icon={DollarSign}
              accent
            />
            <MetricCard
              label="Interest Accruing"
              value={formatINR(stats.totalInterestAccruing)}
              sub={`Across ${stats.inWarehouse + stats.inTransit} active units`}
              icon={Clock}
            />
            <MetricCard
              label="Realised P&L"
              value={formatINR(stats.totalRealised)}
              sub={`${stats.cashReceived} units cash received`}
              icon={TrendingUp}
              trend={stats.totalRealised >= 0 ? 12.4 : -5.2}
            />
          </div>

          {/* ── Status row ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'In Transit', value: stats.inTransit, color: 'text-blue-400' },
              { label: 'In Warehouse', value: stats.inWarehouse, color: 'text-amber-400' },
              { label: 'Sold', value: stats.sold, color: 'text-purple-400' },
              { label: 'Cash Received', value: stats.cashReceived, color: 'text-emerald-400' },
            ].map(s => (
              <div key={s.label} className="bg-[#0b1015] border border-slate-800/60 rounded-xl p-4 flex items-center gap-4">
                <div className="flex-1">
                  <p className="text-xs text-slate-500 uppercase tracking-widest font-semibold">{s.label}</p>
                  <p className={`num text-3xl font-bold mt-1 ${s.color}`}>{s.value}</p>
                </div>
              </div>
            ))}
          </div>

          {/* ── Two-column section ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top interest-accruing units */}
            <SectionCard title="⏱ Highest Interest Accrual">
              {topInterestUnits.length === 0 ? (
                <p className="text-sm text-slate-500 py-4">No active units yet.</p>
              ) : (
                <div className="space-y-2">
                  {topInterestUnits.map((u, i) => (
                    <div key={u.id} className="flex items-center gap-3 py-2 border-b border-slate-800/40 last:border-0">
                      <span className="num text-xs text-slate-600 w-4">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-200 truncate num">{u.serial_number}</p>
                        <p className="text-xs text-slate-500">{u.product_name} · {u.costBreakdown.daysAccrued}d</p>
                      </div>
                      <div className="text-right">
                        <p className="num text-sm text-amber-400">{formatINR(u.costBreakdown.accruedInterest)}</p>
                        <p className="text-xs text-slate-600">{formatINR(u.costBreakdown.totalCost)} total</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            {/* Recent units */}
            <SectionCard title="📦 Recent Units">
              {units.length === 0 ? (
                <p className="text-sm text-slate-500 py-4">No units yet.</p>
              ) : (
                <div className="space-y-2">
                  {units.slice(0, 5).map(u => (
                    <div key={u.id} className="flex items-center gap-3 py-2 border-b border-slate-800/40 last:border-0">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-200 truncate num">{u.serial_number}</p>
                        <p className="text-xs text-slate-500">{u.product_name}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <StatusBadge status={u.status} />
                        <p className="num text-xs text-slate-500">{formatINR(u.costBreakdown.totalCost)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>

          {/* ── Interest Cost Warning ── */}
          {stats.totalInterestAccruing > 50000 && (
            <div className="flex items-start gap-3 px-5 py-4 bg-amber-900/10 border border-amber-700/30 rounded-xl">
              <Clock size={18} className="text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-300">High Interest Accrual Alert</p>
                <p className="text-xs text-amber-400/70 mt-0.5">
                  {formatINR(stats.totalInterestAccruing)} in interest is accruing across your active inventory.
                  Consider accelerating sales to reduce carrying costs.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
