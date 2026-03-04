'use client';

import { useEffect, useState } from 'react';
import { Plus, Ship, Trash2, ChevronDown, ChevronUp, Package } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { PageHeader, SectionCard, StatusBadge, Button, Field, Alert, Spinner, EmptyState } from '../../components/UI';

const STATUSES = ['In-Transit', 'In-Warehouse', 'Completed', 'Cancelled'];

const emptyShipment = {
  shipment_code: '', date: '', status: 'In-Transit', notes: '', origin_country: 'China', destination: 'India',
};

export default function ShipmentsPage() {
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [form, setForm]           = useState(emptyShipment);
  const [saving, setSaving]       = useState(false);
  const [alert, setAlert]         = useState(null);
  const [expanded, setExpanded]   = useState(null);
  const [unitMap, setUnitMap]     = useState({});

  async function loadShipments() {
    setLoading(true);
    const { data, error } = await supabase
      .from('shipments')
      .select('*')
      .order('date', { ascending: false });
    if (error) setAlert({ type: 'error', message: error.message });
    else setShipments(data || []);
    setLoading(false);
  }

  async function loadUnitsForShipment(shipmentId) {
    if (unitMap[shipmentId]) return;
    const { data } = await supabase
      .from('units')
      .select('serial_number, product_name, status, category')
      .eq('shipment_id', shipmentId);
    setUnitMap(prev => ({ ...prev, [shipmentId]: data || [] }));
  }

  useEffect(() => { loadShipments(); }, []);

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setAlert(null);
    try {
      const { error } = await supabase.from('shipments').insert([form]);
      if (error) throw error;
      setAlert({ type: 'success', message: 'Shipment created successfully.' });
      setForm(emptyShipment);
      setShowForm(false);
      loadShipments();
    } catch (err) {
      setAlert({ type: 'error', message: err.message });
    } finally {
      setSaving(false);
    }
  }

  async function deleteShipment(id) {
    if (!confirm('Delete this shipment? Units will not be deleted but will lose their shipment link.')) return;
    const { error } = await supabase.from('shipments').delete().eq('id', id);
    if (error) setAlert({ type: 'error', message: error.message });
    else loadShipments();
  }

  async function updateStatus(id, status) {
    const { error } = await supabase.from('shipments').update({ status }).eq('id', id);
    if (error) setAlert({ type: 'error', message: error.message });
    else loadShipments();
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <PageHeader
        title="Shipments"
        subtitle="Manage incoming shipments from China"
        action={
          <Button variant="primary" onClick={() => setShowForm(!showForm)}>
            <Plus size={15} />
            New Shipment
          </Button>
        }
      />

      {alert && (
        <div className="mb-6">
          <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} />
        </div>
      )}

      {/* New shipment form */}
      {showForm && (
        <SectionCard title="New Shipment" className="mb-6 animate-slide-up">
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            <Field label="Shipment Code" required>
              <input
                className="form-input"
                name="shipment_code"
                value={form.shipment_code}
                onChange={handleChange}
                placeholder="e.g. SHP-2024-001"
                required
              />
            </Field>
            <Field label="Date" required>
              <input
                className="form-input"
                type="date"
                name="date"
                value={form.date}
                onChange={handleChange}
                required
              />
            </Field>
            <Field label="Status">
              <select className="form-input" name="status" value={form.status} onChange={handleChange}>
                {STATUSES.map(s => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Origin">
              <input className="form-input" name="origin_country" value={form.origin_country} onChange={handleChange} />
            </Field>
            <Field label="Destination">
              <input className="form-input" name="destination" value={form.destination} onChange={handleChange} />
            </Field>
            <Field label="Notes">
              <input className="form-input" name="notes" value={form.notes} onChange={handleChange} placeholder="Optional notes" />
            </Field>
            <div className="col-span-full flex gap-3 pt-2">
              <Button type="submit" variant="primary" loading={saving}>Create Shipment</Button>
              <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </form>
        </SectionCard>
      )}

      {/* Shipments list */}
      {loading ? (
        <div className="flex justify-center py-20"><Spinner size={28} /></div>
      ) : shipments.length === 0 ? (
        <EmptyState icon={Ship} message="No shipments yet" sub="Create your first shipment above" />
      ) : (
        <div className="space-y-3">
          {shipments.map(s => (
            <div key={s.id} className="bg-[#0b1015] border border-slate-800/60 rounded-xl overflow-hidden card-glow transition-all">
              {/* Header row */}
              <div className="flex items-center gap-4 px-5 py-4">
                <div className="w-9 h-9 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0">
                  <Ship size={16} className="text-slate-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-white num">{s.shipment_code}</p>
                  <p className="text-xs text-slate-500">{s.date} · {s.origin_country} → {s.destination}</p>
                </div>
                <StatusBadge status={s.status} />
                {/* Status changer */}
                <select
                  value={s.status}
                  onChange={e => updateStatus(s.id, e.target.value)}
                  className="text-xs bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-300 outline-none"
                >
                  {STATUSES.map(st => <option key={st}>{st}</option>)}
                </select>
                <button
                  onClick={() => {
                    const next = expanded === s.id ? null : s.id;
                    setExpanded(next);
                    if (next) loadUnitsForShipment(next);
                  }}
                  className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 transition"
                >
                  {expanded === s.id ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                </button>
                <button
                  onClick={() => deleteShipment(s.id)}
                  className="p-2 rounded-lg hover:bg-red-900/20 text-slate-600 hover:text-red-400 transition"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              {/* Expanded units */}
              {expanded === s.id && (
                <div className="border-t border-slate-800/60 px-5 py-4 animate-fade-in">
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3">Units in this shipment</p>
                  {!unitMap[s.id] ? (
                    <Spinner size={16} />
                  ) : unitMap[s.id].length === 0 ? (
                    <p className="text-sm text-slate-600">No units assigned to this shipment yet. Add them in the Unit Ledger.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                      {unitMap[s.id].map(u => (
                        <div key={u.serial_number} className="flex items-center gap-3 bg-slate-900/60 rounded-lg px-3 py-2">
                          <Package size={12} className="text-slate-500 flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="text-xs num text-slate-200 truncate">{u.serial_number}</p>
                            <p className="text-xs text-slate-500">{u.product_name}</p>
                          </div>
                          <StatusBadge status={u.status} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
