'use client';

import { useEffect, useState, useMemo } from 'react';
import { Plus, Search, Filter, Package, Info, Edit3, X, RefreshCw } from 'lucide-react';
import { supabase, fetchSettings } from '../../lib/supabase';
import { fetchEnrichedUnits, calculateUnitCost, formatINR } from '../../lib/engines';
import { PageHeader, StatusBadge, Button, Field, Alert, Spinner, EmptyState } from '../../components/UI';
import { clsx } from 'clsx';

const STATUSES   = ['In-Transit', 'In-Warehouse', 'Sold', 'Cash-Received', 'Rejected'];
const CATEGORIES = ['Smartphone', 'Tablet', 'Laptop', 'Accessory', 'Other'];

const emptyUnit = {
  serial_number: '', product_name: '', category: 'Smartphone', status: 'In-Transit',
  shipment_id: '', purchase_price_cny: '', purchase_price_inr: '',
  selling_price: '', date_advance_paid: '', date_arrived: '', date_sold: '', date_cash_received: '', notes: '',
};

export default function UnitsPage() {
  const [units, setUnits]         = useState([]);
  const [settings, setSettings]   = useState(null);
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [form, setForm]           = useState(emptyUnit);
  const [editId, setEditId]       = useState(null);
  const [saving, setSaving]       = useState(false);
  const [alert, setAlert]         = useState(null);
  const [search, setSearch]       = useState('');
  const [filterStatus, setFilterStatus] = useState('All');
  const [selectedUnit, setSelectedUnit] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const [s, { data: ships }] = await Promise.all([
        fetchSettings(),
        supabase.from('shipments').select('id, shipment_code').order('date', { ascending: false }),
      ]);
      setSettings(s);
      setShipments(ships || []);
      const enriched = await fetchEnrichedUnits(s);
      setUnits(enriched);
    } catch (e) {
      setAlert({ type: 'error', message: e.message });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  // Auto-convert CNY → INR using global rate
  function handleChange(e) {
    const { name, value } = e.target;
    setForm(prev => {
      const next = { ...prev, [name]: value };
      if (name === 'purchase_price_cny' && settings?.default_currency_conversion) {
        next.purchase_price_inr = (parseFloat(value || 0) * settings.default_currency_conversion).toFixed(2);
      }
      return next;
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setAlert(null);
    try {
      const payload = {
        ...form,
        purchase_price_cny: parseFloat(form.purchase_price_cny) || 0,
        purchase_price_inr: parseFloat(form.purchase_price_inr) || 0,
        selling_price:      form.selling_price ? parseFloat(form.selling_price) : null,
        shipment_id:        form.shipment_id || null,
        date_advance_paid:  form.date_advance_paid || null,
        date_arrived:       form.date_arrived || null,
        date_sold:          form.date_sold || null,
        date_cash_received: form.date_cash_received || null,
      };

      let error;
      if (editId) {
        ({ error } = await supabase.from('units').update(payload).eq('id', editId));
      } else {
        ({ error } = await supabase.from('units').insert([payload]));
      }
      if (error) throw error;

      setAlert({ type: 'success', message: editId ? 'Unit updated.' : 'Unit created successfully.' });
      setForm(emptyUnit);
      setEditId(null);
      setShowForm(false);
      load();
    } catch (err) {
      setAlert({ type: 'error', message: err.message });
    } finally {
      setSaving(false);
    }
  }

  function startEdit(unit) {
    setForm({
      serial_number:      unit.serial_number,
      product_name:       unit.product_name,
      category:           unit.category,
      status:             unit.status,
      shipment_id:        unit.shipment_id || '',
      purchase_price_cny: unit.purchase_price_cny || '',
      purchase_price_inr: unit.purchase_price_inr || '',
      selling_price:      unit.selling_price || '',
      date_advance_paid:  unit.date_advance_paid || '',
      date_arrived:       unit.date_arrived || '',
      date_sold:          unit.date_sold || '',
      date_cash_received: unit.date_cash_received || '',
      notes:              unit.notes || '',
    });
    setEditId(unit.id);
    setShowForm(true);
    setSelectedUnit(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Filter + search
  const filtered = useMemo(() => {
    return units.filter(u => {
      const matchStatus = filterStatus === 'All' || u.status === filterStatus;
      const q = search.toLowerCase();
      const matchSearch = !q ||
        u.serial_number.toLowerCase().includes(q) ||
        u.product_name.toLowerCase().includes(q) ||
        u.category.toLowerCase().includes(q);
      return matchStatus && matchSearch;
    });
  }, [units, search, filterStatus]);

  // Cost colour coding
  function interestColor(days) {
    if (days > 90) return 'text-red-400';
    if (days > 45) return 'text-amber-400';
    return 'text-emerald-400';
  }

  return (
    <div className="p-8 max-w-full">
      <PageHeader
        title="Unit Ledger"
        subtitle="Real-time ABC cost per serial number — interest accruing live"
        action={
          <div className="flex gap-3">
            <Button variant="secondary" onClick={load}>
              <RefreshCw size={14} />
            </Button>
            <Button variant="primary" onClick={() => { setShowForm(!showForm); setEditId(null); setForm(emptyUnit); }}>
              <Plus size={15} />
              Add Unit
            </Button>
          </div>
        }
      />

      {alert && (
        <div className="mb-6">
          <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} />
        </div>
      )}

      {/* Add/Edit form */}
      {showForm && (
        <div className="mb-8 bg-[#0b1015] border border-amber-500/20 rounded-xl p-6 animate-slide-up">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-semibold text-white" style={{ fontFamily: 'Syne, sans-serif' }}>
              {editId ? 'Edit Unit' : 'New Unit'}
            </h2>
            <button onClick={() => { setShowForm(false); setEditId(null); }} className="text-slate-500 hover:text-slate-300">
              <X size={18} />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            <Field label="Serial Number" required>
              <input className="form-input" name="serial_number" value={form.serial_number} onChange={handleChange} placeholder="e.g. SN-2024-001" required disabled={!!editId} />
            </Field>
            <Field label="Product Name" required>
              <input className="form-input" name="product_name" value={form.product_name} onChange={handleChange} placeholder="e.g. iPhone 15 Pro" required />
            </Field>
            <Field label="Category">
              <select className="form-input" name="category" value={form.category} onChange={handleChange}>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Shipment">
              <select className="form-input" name="shipment_id" value={form.shipment_id} onChange={handleChange}>
                <option value="">— None —</option>
                {shipments.map(s => <option key={s.id} value={s.id}>{s.shipment_code}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select className="form-input" name="status" value={form.status} onChange={handleChange}>
                {STATUSES.map(s => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Purchase Price (CNY)" hint={settings ? `≈ ₹${(parseFloat(form.purchase_price_cny||0)*settings.default_currency_conversion).toFixed(2)}` : ''}>
              <input className="form-input" type="number" step="0.01" name="purchase_price_cny" value={form.purchase_price_cny} onChange={handleChange} placeholder="0.00" />
            </Field>
            <Field label="Purchase Price (INR)" required>
              <input className="form-input" type="number" step="0.01" name="purchase_price_inr" value={form.purchase_price_inr} onChange={handleChange} placeholder="0.00" required />
            </Field>
            <Field label="Selling Price (INR)">
              <input className="form-input" type="number" step="0.01" name="selling_price" value={form.selling_price} onChange={handleChange} placeholder="0.00" />
            </Field>
            <Field label="Date Advance Paid" hint="Interest starts from this date">
              <input className="form-input" type="date" name="date_advance_paid" value={form.date_advance_paid} onChange={handleChange} />
            </Field>
            <Field label="Date Arrived">
              <input className="form-input" type="date" name="date_arrived" value={form.date_arrived} onChange={handleChange} />
            </Field>
            <Field label="Date Sold">
              <input className="form-input" type="date" name="date_sold" value={form.date_sold} onChange={handleChange} />
            </Field>
            <Field label="Date Cash Received" hint="Interest stops here">
              <input className="form-input" type="date" name="date_cash_received" value={form.date_cash_received} onChange={handleChange} />
            </Field>
            <div className="col-span-full">
              <Field label="Notes">
                <input className="form-input" name="notes" value={form.notes} onChange={handleChange} placeholder="Optional notes" />
              </Field>
            </div>
            <div className="col-span-full flex gap-3 pt-2">
              <Button type="submit" variant="primary" loading={saving}>{editId ? 'Update Unit' : 'Create Unit'}</Button>
              <Button type="button" variant="secondary" onClick={() => { setShowForm(false); setEditId(null); }}>Cancel</Button>
            </div>
          </form>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="flex items-center gap-2 bg-[#0b1015] border border-slate-800/60 rounded-lg px-3 py-2 flex-1 min-w-48 max-w-sm">
          <Search size={14} className="text-slate-500 flex-shrink-0" />
          <input
            className="bg-transparent text-sm text-slate-200 outline-none flex-1 placeholder-slate-600"
            placeholder="Search serial, product, category…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-slate-500" />
          <div className="flex gap-1.5">
            {['All', ...STATUSES].map(s => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={clsx(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                  filterStatus === s
                    ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                    : 'bg-slate-900 text-slate-500 border border-slate-800 hover:border-slate-600'
                )}
              >{s}</button>
            ))}
          </div>
        </div>
        <p className="ml-auto text-xs text-slate-600 num">{filtered.length} units</p>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-24"><Spinner size={28} /></div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Package} message="No units found" sub="Adjust your filters or add a new unit" />
      ) : (
        <div className="bg-[#0b1015] border border-slate-800/60 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full ledger-table">
              <thead>
                <tr>
                  <th className="text-left">Serial No.</th>
                  <th className="text-left">Product</th>
                  <th className="text-left">Status</th>
                  <th className="text-right">Base Cost</th>
                  <th className="text-right">Expenses</th>
                  <th className="text-right">Days Active</th>
                  <th className="text-right">Interest</th>
                  <th className="text-right font-bold text-amber-400/80">Total Cost</th>
                  <th className="text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(u => {
                  const cb = u.costBreakdown;
                  return (
                    <tr key={u.id}>
                      <td>
                        <span className="num text-sm font-medium text-slate-200">{u.serial_number}</span>
                        <p className="text-xs text-slate-500">{u.category}</p>
                      </td>
                      <td>
                        <span className="text-sm text-slate-300">{u.product_name}</span>
                        {u.shipments && (
                          <p className="text-xs text-slate-600 num">{u.shipments.shipment_code}</p>
                        )}
                      </td>
                      <td><StatusBadge status={u.status} /></td>
                      <td className="text-right num text-sm text-slate-300">{formatINR(cb.baseCost)}</td>
                      <td className="text-right num text-sm text-blue-400">{formatINR(cb.allocatedExpenses)}</td>
                      <td className={clsx('text-right num text-sm font-medium', interestColor(cb.daysAccrued))}>
                        {cb.daysAccrued}d
                      </td>
                      <td className={clsx('text-right num text-sm', interestColor(cb.daysAccrued))}>
                        {formatINR(cb.accruedInterest)}
                        <p className="text-xs text-slate-600">{(cb.annualRate)}% p.a.</p>
                      </td>
                      <td className="text-right">
                        <span className="num text-base font-bold text-amber-400">{formatINR(cb.totalCost)}</span>
                        {u.selling_price && (
                          <p className="text-xs text-slate-500">Sell: {formatINR(u.selling_price)}</p>
                        )}
                      </td>
                      <td className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => setSelectedUnit(u)}
                            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-slate-300 transition"
                            title="Details"
                          >
                            <Info size={14} />
                          </button>
                          <button
                            onClick={() => startEdit(u)}
                            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-amber-400 transition"
                            title="Edit"
                          >
                            <Edit3 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detail drawer */}
      {selectedUnit && (
        <UnitDetailDrawer unit={selectedUnit} settings={settings} onClose={() => setSelectedUnit(null)} />
      )}
    </div>
  );
}

// ─── Unit Detail Drawer ────────────────────────────────────────
function UnitDetailDrawer({ unit, settings, onClose }) {
  const cb = unit.costBreakdown;
  const rows = [
    ['Serial Number',          unit.serial_number,                          'num'],
    ['Product',                unit.product_name,                           ''],
    ['Category',               unit.category,                               ''],
    ['Shipment',               unit.shipments?.shipment_code || 'N/A',      'num'],
    ['Status',                 <StatusBadge key="s" status={unit.status} />, ''],
    ['Date Advance Paid',      unit.date_advance_paid || 'N/A',             ''],
    ['Date Cash Received',     unit.date_cash_received || 'Still Accruing', ''],
    ['───', null, ''],
    ['Purchase Price (INR)',   formatINR(cb.baseCost),                       'num text-slate-300'],
    ['Allocated Expenses',     formatINR(cb.allocatedExpenses),              'num text-blue-400'],
    ['Total Base + Expenses',  formatINR(cb.totalBaseCost),                  'num text-slate-100'],
    ['Days Accruing',          `${cb.daysAccrued} days`,                    'num'],
    ['Daily Rate',             `${(cb.dailyRate * 100).toFixed(6)}%`,        'num text-slate-400'],
    ['Accrued Interest',       formatINR(cb.accruedInterest),               'num text-amber-400'],
    ['───', null, ''],
    ['TOTAL COST',             formatINR(cb.totalCost),                      'num text-xl font-bold text-amber-400'],
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div
        className="w-full max-w-sm bg-[#0b1015] border-l border-slate-800 h-full overflow-y-auto p-6 shadow-2xl animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-bold text-white" style={{ fontFamily: 'Syne, sans-serif' }}>Cost Breakdown</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-500"><X size={16} /></button>
        </div>

        <div className="space-y-1">
          {rows.map(([label, value, cls], i) => {
            if (label === '───') return <hr key={i} className="border-slate-800 my-3" />;
            return (
              <div key={i} className="flex items-center justify-between py-1.5">
                <span className="text-xs text-slate-500 uppercase tracking-wide">{label}</span>
                <span className={clsx('text-sm', cls || 'text-slate-200')}>{value}</span>
              </div>
            );
          })}
        </div>

        {/* Expense allocation list */}
        {unit.allocations?.length > 0 && (
          <div className="mt-6">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3">Expense Allocations</p>
            <div className="space-y-1.5">
              {unit.allocations.map((a, i) => (
                <div key={i} className="flex justify-between text-xs py-1 border-b border-slate-800/40">
                  <span className="text-slate-500">{a.allocation_date}</span>
                  <span className="num text-blue-400">{formatINR(a.allocated_amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
