'use client';

import { useEffect, useState } from 'react';
import { Plus, Receipt, Zap, AlertTriangle, CheckCircle, Trash2, RefreshCw } from 'lucide-react';
import { supabase, fetchSettings } from '../../lib/supabase';
import { distributeExpense, distributeAllPending, formatINR } from '../../lib/engines';
import { PageHeader, SectionCard, Button, Field, Alert, Spinner, EmptyState } from '../../components/UI';
import { clsx } from 'clsx';

const CATEGORIES_BY_TYPE = {
  Shipment: ['Advance Payment', 'Customs Duty', 'Freight / Shipping', 'Port Charges', 'Insurance', 'Other Shipment Cost'],
  Global:   ['Warehouse Rent', 'Staff Salary', 'Internet / Utilities', 'Office Expenses', 'Security', 'Risk Buffer', 'Other Overhead'],
  Category: ['Warranty / Accessories', 'Travel (Sourcing)', 'Marketing', 'Certification', 'Other Category Cost'],
};

const TYPE_INFO = {
  Shipment: { color: 'text-blue-400', bg: 'bg-blue-900/20 border-blue-700/30',  desc: 'Split equally among all units in the selected shipment.' },
  Global:   { color: 'text-amber-400', bg: 'bg-amber-900/20 border-amber-700/30', desc: 'Split equally among all units In-Warehouse on the expense date.' },
  Category: { color: 'text-purple-400', bg: 'bg-purple-900/20 border-purple-700/30', desc: 'Split equally among all units in the selected product category.' },
};

const CATEGORIES_LIST = ['Smartphone', 'Tablet', 'Laptop', 'Accessory', 'Other'];

const emptyForm = {
  amount: '', category: '', expense_type: 'Global',
  shipment_id: '', category_target: '', date: '', description: '',
};

export default function ExpensesPage() {
  const [expenses, setExpenses]   = useState([]);
  const [shipments, setShipments] = useState([]);
  const [settings, setSettings]   = useState(null);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [distributing, setDistributing] = useState(null);
  const [form, setForm]           = useState(emptyForm);
  const [alert, setAlert]         = useState(null);
  const [showForm, setShowForm]   = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [s, { data: exps }, { data: ships }] = await Promise.all([
        fetchSettings(),
        supabase.from('expenses').select('*').order('date', { ascending: false }),
        supabase.from('shipments').select('id, shipment_code').order('date', { ascending: false }),
      ]);
      setSettings(s);
      setExpenses(exps || []);
      setShipments(ships || []);

      // Default category to first of the selected type
      setForm(prev => ({
        ...prev,
        category: CATEGORIES_BY_TYPE[prev.expense_type]?.[0] || '',
        date: new Date().toISOString().split('T')[0],
      }));
    } catch (e) {
      setAlert({ type: 'error', message: e.message });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm(prev => {
      const next = { ...prev, [name]: value };
      if (name === 'expense_type') {
        next.category = CATEGORIES_BY_TYPE[value]?.[0] || '';
        next.shipment_id = '';
        next.category_target = '';
      }
      return next;
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setAlert(null);
    try {
      // Validate
      if (form.expense_type === 'Shipment' && !form.shipment_id)
        throw new Error('Please select a shipment for Shipment-level expenses.');
      if (form.expense_type === 'Category' && !form.category_target)
        throw new Error('Please select a product category.');

      const payload = {
        amount:          parseFloat(form.amount),
        category:        form.category,
        expense_type:    form.expense_type,
        shipment_id:     form.shipment_id || null,
        category_target: form.category_target || null,
        date:            form.date,
        description:     form.description,
        distributed:     false,
      };

      const { data, error } = await supabase.from('expenses').insert([payload]).select().single();
      if (error) throw error;

      // Immediately distribute
      const result = await distributeExpense(data.id);
      setAlert({
        type: 'success',
        message: result.warning
          ? `Expense saved. Warning: ${result.warning}`
          : `Expense saved & distributed: ₹${formatINR(result.allocated)} across ${result.units} units (₹${result.perUnit?.toFixed(2)}/unit).`,
      });

      setForm(prev => ({ ...emptyForm, expense_type: prev.expense_type, date: prev.date }));
      setShowForm(false);
      load();
    } catch (err) {
      setAlert({ type: 'error', message: err.message });
    } finally {
      setSaving(false);
    }
  }

  async function runDistributeAll() {
    setDistributing('all');
    setAlert(null);
    try {
      const result = await distributeAllPending();
      setAlert({ type: 'success', message: `Distributed ${result.succeeded} expenses. ${result.failed} failed.` });
      load();
    } catch (e) {
      setAlert({ type: 'error', message: e.message });
    } finally {
      setDistributing(null);
    }
  }

  async function redistributeSingle(expenseId) {
    setDistributing(expenseId);
    setAlert(null);
    try {
      // Reset distributed flag
      await supabase.from('expense_allocations').delete().eq('expense_id', expenseId);
      await supabase.from('expenses').update({ distributed: false }).eq('id', expenseId);
      const result = await distributeExpense(expenseId);
      setAlert({ type: 'success', message: `Re-distributed: ${result.units} units.` });
      load();
    } catch (e) {
      setAlert({ type: 'error', message: e.message });
    } finally {
      setDistributing(null);
    }
  }

  async function deleteExpense(id) {
    if (!confirm('Delete this expense? All allocations will also be removed.')) return;
    await supabase.from('expense_allocations').delete().eq('expense_id', id);
    await supabase.from('expenses').delete().eq('id', id);
    load();
  }

  const pending = expenses.filter(e => !e.distributed);
  const ti = TYPE_INFO[form.expense_type];

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <PageHeader
        title="Expenses"
        subtitle="Log costs and distribute them across units automatically"
        action={
          <div className="flex gap-3">
            {pending.length > 0 && (
              <Button variant="secondary" onClick={runDistributeAll} loading={distributing === 'all'}>
                <Zap size={14} />
                Distribute All ({pending.length})
              </Button>
            )}
            <Button variant="primary" onClick={() => setShowForm(!showForm)}>
              <Plus size={15} />
              Log Expense
            </Button>
          </div>
        }
      />

      {alert && (
        <div className="mb-6">
          <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} />
        </div>
      )}

      {/* Expense form */}
      {showForm && (
        <div className="mb-8 bg-[#0b1015] border border-amber-500/20 rounded-xl p-6 animate-slide-up">
          <h2 className="text-base font-semibold text-white mb-5" style={{ fontFamily: 'Syne, sans-serif' }}>
            Log New Expense
          </h2>

          {/* Type selector */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            {Object.entries(TYPE_INFO).map(([type, cfg]) => (
              <button
                key={type}
                type="button"
                onClick={() => setForm(prev => ({ ...prev, expense_type: type, category: CATEGORIES_BY_TYPE[type][0], shipment_id: '', category_target: '' }))}
                className={clsx(
                  'p-3 rounded-xl border text-left transition-all',
                  form.expense_type === type
                    ? `${cfg.bg} ${cfg.color} border-opacity-80`
                    : 'bg-slate-900 border-slate-800 text-slate-500 hover:border-slate-600'
                )}
              >
                <p className="text-sm font-semibold">{type}</p>
                <p className="text-xs mt-1 opacity-70 leading-snug">{cfg.desc}</p>
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="grid grid-cols-2 md:grid-cols-3 gap-5">
            <Field label="Amount (₹)" required>
              <input className="form-input" type="number" step="0.01" min="0.01" name="amount" value={form.amount} onChange={handleChange} placeholder="0.00" required />
            </Field>
            <Field label="Category" required>
              <select className="form-input" name="category" value={form.category} onChange={handleChange} required>
                {(CATEGORIES_BY_TYPE[form.expense_type] || []).map(c => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Date" required>
              <input className="form-input" type="date" name="date" value={form.date} onChange={handleChange} required />
            </Field>

            {form.expense_type === 'Shipment' && (
              <Field label="Shipment" required>
                <select className="form-input" name="shipment_id" value={form.shipment_id} onChange={handleChange} required>
                  <option value="">— Select Shipment —</option>
                  {shipments.map(s => <option key={s.id} value={s.id}>{s.shipment_code}</option>)}
                </select>
              </Field>
            )}

            {form.expense_type === 'Category' && (
              <Field label="Product Category" required>
                <select className="form-input" name="category_target" value={form.category_target} onChange={handleChange} required>
                  <option value="">— Select Category —</option>
                  {CATEGORIES_LIST.map(c => <option key={c}>{c}</option>)}
                </select>
              </Field>
            )}

            <Field label="Description">
              <input className="form-input" name="description" value={form.description} onChange={handleChange} placeholder="Optional notes" />
            </Field>

            <div className="col-span-full flex gap-3 pt-2">
              <Button type="submit" variant="primary" loading={saving}>
                <Zap size={14} />
                Save & Distribute
              </Button>
              <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </form>
        </div>
      )}

      {/* Summary cards */}
      {!loading && (
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { label: 'Total Logged', value: formatINR(expenses.reduce((s, e) => s + parseFloat(e.amount), 0)), sub: `${expenses.length} entries` },
            { label: 'Distributed', value: expenses.filter(e => e.distributed).length, sub: 'expenses allocated' },
            { label: 'Pending', value: pending.length, sub: 'not yet distributed', warn: pending.length > 0 },
          ].map(c => (
            <div key={c.label} className={clsx('rounded-xl border p-4', c.warn ? 'bg-amber-900/10 border-amber-700/30' : 'bg-[#0b1015] border-slate-800/60')}>
              <p className="text-xs uppercase tracking-widest text-slate-500 font-semibold">{c.label}</p>
              <p className={clsx('num text-2xl font-bold mt-1', c.warn ? 'text-amber-400' : 'text-slate-100')}>{c.value}</p>
              <p className="text-xs text-slate-500 mt-1">{c.sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* Expense table */}
      {loading ? (
        <div className="flex justify-center py-24"><Spinner size={28} /></div>
      ) : expenses.length === 0 ? (
        <EmptyState icon={Receipt} message="No expenses logged yet" sub="Log your first expense above" />
      ) : (
        <div className="bg-[#0b1015] border border-slate-800/60 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full ledger-table">
              <thead>
                <tr>
                  <th className="text-left">Date</th>
                  <th className="text-left">Category</th>
                  <th className="text-left">Type</th>
                  <th className="text-left">Target</th>
                  <th className="text-right">Amount</th>
                  <th className="text-center">Status</th>
                  <th className="text-left">Description</th>
                  <th className="text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map(exp => {
                  const ti = TYPE_INFO[exp.expense_type] || TYPE_INFO.Global;
                  const ship = shipments.find(s => s.id === exp.shipment_id);
                  return (
                    <tr key={exp.id}>
                      <td className="num text-sm text-slate-400">{exp.date}</td>
                      <td className="text-sm text-slate-200">{exp.category}</td>
                      <td>
                        <span className={clsx('text-xs font-semibold px-2 py-0.5 rounded border', ti.bg, ti.color)}>
                          {exp.expense_type}
                        </span>
                      </td>
                      <td className="text-xs text-slate-500 num">
                        {exp.expense_type === 'Shipment' && (ship?.shipment_code || '—')}
                        {exp.expense_type === 'Category' && (exp.category_target || '—')}
                        {exp.expense_type === 'Global' && 'All Warehouse'}
                      </td>
                      <td className="text-right num font-semibold text-slate-200">{formatINR(exp.amount)}</td>
                      <td className="text-center">
                        {exp.distributed ? (
                          <CheckCircle size={15} className="text-emerald-400 mx-auto" />
                        ) : (
                          <AlertTriangle size={15} className="text-amber-400 mx-auto" />
                        )}
                      </td>
                      <td className="text-xs text-slate-500">{exp.description || '—'}</td>
                      <td className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => redistributeSingle(exp.id)}
                            disabled={!!distributing}
                            className="p-1.5 rounded hover:bg-slate-800 text-slate-500 hover:text-amber-400 transition"
                            title="Re-distribute"
                          >
                            {distributing === exp.id ? <Spinner size={12} /> : <RefreshCw size={12} />}
                          </button>
                          <button
                            onClick={() => deleteExpense(exp.id)}
                            className="p-1.5 rounded hover:bg-red-900/20 text-slate-600 hover:text-red-400 transition"
                            title="Delete"
                          >
                            <Trash2 size={12} />
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
    </div>
  );
}
