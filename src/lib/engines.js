/**
 * engines.js — Core Business Logic
 *
 * 1. Expense Distribution Engine
 * 2. Daily Interest Engine
 * 3. Unit Cost Calculator
 */

import { supabase, fetchSettings } from './supabase';
import { differenceInDays, parseISO, startOfDay } from 'date-fns';

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

/** Safe date diff (returns 0 if start is missing / negative) */
function daysBetween(startDateStr, endDateStr) {
  if (!startDateStr) return 0;
  const start = startOfDay(parseISO(startDateStr));
  const end   = startOfDay(endDateStr ? parseISO(endDateStr) : new Date());
  return Math.max(0, differenceInDays(end, start));
}

/** Format number to ₹ string */
export function formatINR(value) {
  if (value == null || isNaN(value)) return '₹0.00';
  return new Intl.NumberFormat('en-IN', {
    style:                 'currency',
    currency:              'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

// ─────────────────────────────────────────────────────────────
// ENGINE 1 — EXPENSE DISTRIBUTION ENGINE
//
// Rules:
//   'Shipment' → divide equally among units in that shipment
//   'Global'   → divide equally among units with status 'In-Warehouse'
//                on the expense date
//   'Category' → divide equally among units matching category_target
// ─────────────────────────────────────────────────────────────

export async function distributeExpense(expenseId) {
  // 1. Fetch the expense
  const { data: expense, error: expErr } = await supabase
    .from('expenses')
    .select('*')
    .eq('id', expenseId)
    .single();

  if (expErr || !expense) throw new Error(`Expense not found: ${expenseId}`);
  if (expense.distributed) return { skipped: true, message: 'Already distributed' };

  // 2. Determine which units are liable
  let eligibleUnits = [];

  if (expense.expense_type === 'Shipment') {
    // Units belonging to this specific shipment (any status except Rejected)
    const { data, error } = await supabase
      .from('units')
      .select('id, serial_number')
      .eq('shipment_id', expense.shipment_id)
      .neq('status', 'Rejected');

    if (error) throw error;
    eligibleUnits = data || [];

  } else if (expense.expense_type === 'Global') {
    // All units physically in the warehouse on the expense date
    // "In-Warehouse" on that day = status is 'In-Warehouse' AND they arrived <= expense date
    const { data, error } = await supabase
      .from('units')
      .select('id, serial_number')
      .eq('status', 'In-Warehouse')
      .lte('date_arrived', expense.date);

    if (error) throw error;
    eligibleUnits = data || [];

    // Also include units already sold but arrived before expense date (retroactive overhead)
    // Uncomment if you want this behaviour:
    // const { data: soldUnits } = await supabase
    //   .from('units')
    //   .select('id, serial_number')
    //   .in('status', ['Sold', 'Cash-Received'])
    //   .lte('date_arrived', expense.date)
    //   .gte('date_sold', expense.date);
    // eligibleUnits = [...eligibleUnits, ...(soldUnits || [])];

  } else if (expense.expense_type === 'Category') {
    // Units in the specified category
    const { data, error } = await supabase
      .from('units')
      .select('id, serial_number')
      .eq('category', expense.category_target)
      .neq('status', 'Rejected');

    if (error) throw error;
    eligibleUnits = data || [];
  }

  if (eligibleUnits.length === 0) {
    // No eligible units — mark as distributed with 0 allocations
    await supabase.from('expenses').update({ distributed: true }).eq('id', expenseId);
    return { allocated: 0, units: 0, warning: 'No eligible units found for this expense.' };
  }

  // 3. Calculate per-unit share
  const perUnit = parseFloat(expense.amount) / eligibleUnits.length;

  // 4. Insert allocations (upsert to be safe)
  const allocations = eligibleUnits.map(unit => ({
    expense_id:       expenseId,
    unit_id:          unit.id,
    allocated_amount: parseFloat(perUnit.toFixed(4)),
    allocation_date:  expense.date,
  }));

  const { error: allocErr } = await supabase
    .from('expense_allocations')
    .upsert(allocations, { onConflict: 'expense_id,unit_id' });

  if (allocErr) throw allocErr;

  // 5. Mark expense as distributed
  const { error: markErr } = await supabase
    .from('expenses')
    .update({ distributed: true })
    .eq('id', expenseId);

  if (markErr) throw markErr;

  return {
    allocated: parseFloat(expense.amount),
    units:     eligibleUnits.length,
    perUnit:   perUnit,
  };
}

/** Re-distribute ALL undistributed expenses (useful after seeding) */
export async function distributeAllPending() {
  const { data: pending, error } = await supabase
    .from('expenses')
    .select('id')
    .eq('distributed', false);

  if (error) throw error;
  if (!pending?.length) return { processed: 0 };

  const results = await Promise.allSettled(
    pending.map(e => distributeExpense(e.id))
  );

  const succeeded = results.filter(r => r.status === 'fulfilled').length;
  const failed    = results.filter(r => r.status === 'rejected').length;

  return { processed: pending.length, succeeded, failed };
}

// ─────────────────────────────────────────────────────────────
// ENGINE 2 — DAILY INTEREST ENGINE
//
// Formula (Simple Interest per day):
//   daily_rate    = annual_rate / 100 / 365
//   days_active   = date_advance_paid → today (or date_cash_received)
//   interest      = total_base_cost × daily_rate × days_active
//
// total_base_cost = purchase_price_inr + SUM(expense_allocations)
// ─────────────────────────────────────────────────────────────

/**
 * Calculate the complete, real-time cost for a single unit.
 * Returns a breakdown object.
 */
export function calculateUnitCost(unit, allocations, settings) {
  const annualRate = settings?.annual_interest_rate ?? 12;
  const dailyRate  = annualRate / 100 / 365;

  const baseCost       = parseFloat(unit.purchase_price_inr) || 0;
  const allocatedTotal = allocations.reduce((sum, a) => sum + parseFloat(a.allocated_amount), 0);
  const totalBaseCost  = baseCost + allocatedTotal;

  // Interest accrues from date_advance_paid to date_cash_received (or today)
  const isActive = !['Cash-Received', 'Rejected'].includes(unit.status);
  const endDate  = unit.date_cash_received && !isActive ? unit.date_cash_received : null;
  const daysAccrued = daysBetween(unit.date_advance_paid, endDate);

  const accruedInterest = totalBaseCost * dailyRate * daysAccrued;
  const totalCost       = totalBaseCost + accruedInterest;

  return {
    baseCost,
    allocatedExpenses: allocatedTotal,
    totalBaseCost,
    daysAccrued,
    dailyRate,
    annualRate,
    accruedInterest,
    totalCost,
    isActive,
  };
}

/**
 * Calculate profitability for a sold unit.
 * Returns: grossRevenue, platformFee, netRevenue, netProfit, marginPct
 */
export function calculateProfitability(unit, costBreakdown, settings) {
  const platformFeePct = unit.platform_fee_override != null
    ? parseFloat(unit.platform_fee_override)
    : (settings?.standard_platform_fee_pct ?? 10);

  const riskBufferPct = settings?.risk_buffer_percentage ?? 3;

  const sellingPrice = parseFloat(unit.selling_price) || 0;
  const platformFee  = sellingPrice * (platformFeePct / 100);
  const netRevenue   = sellingPrice - platformFee;

  // Risk buffer on total cost
  const riskBuffer   = costBreakdown.totalCost * (riskBufferPct / 100);
  const totalCostWithRisk = costBreakdown.totalCost + riskBuffer;

  const netProfit    = netRevenue - totalCostWithRisk;
  const marginPct    = sellingPrice > 0 ? (netProfit / sellingPrice) * 100 : 0;
  const roi          = totalCostWithRisk > 0 ? (netProfit / totalCostWithRisk) * 100 : 0;

  return {
    sellingPrice,
    platformFeePct,
    platformFee,
    netRevenue,
    riskBufferPct,
    riskBuffer,
    totalCostWithRisk,
    netProfit,
    marginPct,
    roi,
  };
}

// ─────────────────────────────────────────────────────────────
// DATA LOADERS — fetch everything needed for the unit ledger
// ─────────────────────────────────────────────────────────────

/** Fetch all units with their allocations, enriched with cost breakdown */
export async function fetchEnrichedUnits(settings) {
  const [{ data: units, error: uErr }, { data: allocs, error: aErr }] =
    await Promise.all([
      supabase.from('units').select('*, shipments(shipment_code)').order('created_at', { ascending: false }),
      supabase.from('expense_allocations').select('unit_id, allocated_amount'),
    ]);

  if (uErr) throw uErr;
  if (aErr) throw aErr;

  // Group allocations by unit_id
  const allocByUnit = (allocs || []).reduce((acc, a) => {
    if (!acc[a.unit_id]) acc[a.unit_id] = [];
    acc[a.unit_id].push(a);
    return acc;
  }, {});

  return (units || []).map(unit => {
    const allocations = allocByUnit[unit.id] || [];
    const costBreakdown = calculateUnitCost(unit, allocations, settings);
    return { ...unit, allocations, costBreakdown };
  });
}

/** Fetch dashboard summary stats */
export async function fetchDashboardStats(settings) {
  const units = await fetchEnrichedUnits(settings);

  const stats = {
    totalUnits:       units.length,
    inWarehouse:      0,
    inTransit:        0,
    sold:             0,
    cashReceived:     0,
    totalPortfolioCost: 0,
    totalInterestAccruing: 0,
    totalInterestLocked:   0,
    totalRealised:         0,
  };

  units.forEach(u => {
    const cb = u.costBreakdown;
    if (u.status === 'In-Warehouse') stats.inWarehouse++;
    if (u.status === 'In-Transit')   stats.inTransit++;
    if (u.status === 'Sold')         stats.sold++;
    if (u.status === 'Cash-Received') stats.cashReceived++;

    if (['In-Warehouse', 'In-Transit', 'Sold'].includes(u.status)) {
      stats.totalPortfolioCost     += cb.totalCost;
      stats.totalInterestAccruing  += cb.accruedInterest;
    }
    if (u.status === 'Cash-Received') {
      stats.totalInterestLocked += cb.accruedInterest;
      if (u.selling_price) {
        const prof = calculateProfitability(u, cb, settings);
        stats.totalRealised += prof.netProfit;
      }
    }
  });

  return { stats, units };
}
