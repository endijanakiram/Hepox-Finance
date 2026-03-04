# ImportLedger Pro

**Activity-Based Costing (ABC) with Dynamic Daily Interest Accrual**
for import businesses (China → India).

---

## What This App Does

| Engine | What It Does |
|--------|-------------|
| **Expense Distribution Engine** | When you log an expense, it automatically splits it across the correct units based on liability rules (Shipment / Global / Category) |
| **Daily Interest Engine** | Calculates `cost × (annual_rate/365) × days` for every active unit in real-time |
| **Profitability Engine** | Computes net profit per unit: `selling_price − platform_fee − (total_cost + risk_buffer)` |
| **Admin Settings** | All rates stored in DB — change them without redeploying |

---

## Tech Stack

- **Frontend:** Next.js 14 (App Router) + Tailwind CSS
- **Backend/DB:** Supabase (PostgreSQL)
- **Deploy:** Vercel (recommended) or Replit

---

## Step 1 — Supabase Setup

### 1a. Create a Supabase Project

1. Go to [https://supabase.com](https://supabase.com) → Sign Up / Log In
2. Click **"New Project"**
3. Choose a name, password, and region (choose `ap-south-1` for India)
4. Wait ~2 minutes for provisioning

### 1b. Run the Database Schema

1. In your Supabase dashboard, click **"SQL Editor"** in the left sidebar
2. Click **"New Query"**
3. Open `schema.sql` from this project
4. Paste the entire contents into the SQL editor
5. Click **"Run"** (▶)
6. You should see: `Success. No rows returned.`

**This creates:**
- `global_settings` table (with default rates pre-seeded)
- `shipments` table
- `units` table
- `expenses` table
- `expense_allocations` table
- `interest_accrual_log` table
- `unit_cost_summary` view
- All indexes and Row Level Security policies

### 1c. Get Your API Keys

1. In Supabase → **Settings** → **API**
2. Copy:
   - **Project URL** (looks like `https://xxxxx.supabase.co`)
   - **anon / public key** (safe to use in browser)

---

## Step 2 — Local Development

### Prerequisites

- Node.js 18+ (`node --version`)
- npm or yarn

### 2a. Install Dependencies

```bash
cd importledger-pro
npm install
```

### 2b. Configure Environment Variables

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

### 2c. Run the Dev Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### 2d. Verify Setup

1. Navigate to **Admin** → You should see the 4 default settings
2. Navigate to **Shipments** → Create a test shipment
3. Navigate to **Unit Ledger** → Add a test unit with a purchase price and `date_advance_paid`
4. Navigate to **Expenses** → Log an expense and click "Save & Distribute"
5. Go back to **Unit Ledger** → The unit's cost should now include the allocated expense + interest

---

## Step 3 — Understanding the Business Logic

### Expense Distribution Rules

```
expense_type = 'Shipment'
  → Divides amount equally among all units in that shipment
  → Use for: Advance payment, Customs duty, Freight, Port charges

expense_type = 'Global'
  → Divides among all units with status = 'In-Warehouse' on the expense date
  → Use for: Warehouse rent, Staff salary, Internet, Overheads

expense_type = 'Category'
  → Divides among all units matching the target product category
  → Use for: Warranty accessories, Category-specific travel, Marketing
```

### Interest Accrual Formula

```
daily_rate     = annual_interest_rate / 100 / 365
days_active    = today - date_advance_paid
                 (stops at date_cash_received if status = Cash-Received)
base_cost      = purchase_price_inr + SUM(expense_allocations)
accrued_int    = base_cost × daily_rate × days_active
total_cost     = base_cost + accrued_int
```

### Profitability Formula

```
platform_fee      = selling_price × platform_fee_pct / 100
net_revenue       = selling_price - platform_fee
risk_buffer       = total_cost × risk_buffer_pct / 100
total_cost_adj    = total_cost + risk_buffer
net_profit        = net_revenue - total_cost_adj
margin_pct        = net_profit / selling_price × 100
roi               = net_profit / total_cost_adj × 100
```

### Changing Global Rates

Navigate to **Admin Settings** and update any value:
- **Annual Interest Rate**: 12% → 11%  
  _Effect_: All future interest calculations use 11%. Historical data unchanged.
- **Platform Fee**: 10% → 8%  
  _Effect_: All profitability pages recalculate immediately using 8%.

---

## Step 4 — Typical Workflow

```
1. Create Shipment        → /shipments (e.g. SHP-2024-001)
2. Add Units              → /units (enter serial numbers, purchase price, date_advance_paid)
3. Assign units to shipment
4. Log shipment expenses  → /expenses (Customs, Freight = type: Shipment)
5. Units arrive → Update status to 'In-Warehouse'
6. Log monthly overheads  → /expenses (Rent, Salary = type: Global)
7. Sell units → Update status to 'Sold', add selling_price
8. Mark Cash Received → Update status to 'Cash-Received', add date_cash_received
9. View P&L               → /profitability
```

---

## Step 5 — Deploy to Vercel

### Option A: Vercel (Recommended, Free)

1. Push this folder to a GitHub repository:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   gh repo create importledger-pro --public --push
   ```

2. Go to [https://vercel.com](https://vercel.com) → Import Project → Select your GitHub repo

3. In **Environment Variables**, add:
   ```
   NEXT_PUBLIC_SUPABASE_URL     = https://xxxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY = your-anon-key
   ```

4. Click **Deploy** → Done! You get a live URL like `https://importledger-pro.vercel.app`

5. Every `git push` auto-deploys.

### Option B: Replit

1. Go to [https://replit.com](https://replit.com) → Create Repl → Import from GitHub
2. In **Secrets** (🔒 icon), add:
   ```
   NEXT_PUBLIC_SUPABASE_URL
   NEXT_PUBLIC_SUPABASE_ANON_KEY
   ```
3. In Shell: `npm install && npm run build && npm start`
4. Click **Run**

---

## Step 6 — Production Hardening (Optional)

### Add Authentication
1. In Supabase → **Auth** → Enable email/password
2. Wrap your app in a Supabase auth provider
3. Update RLS policies to use `auth.uid()` instead of `auth.role() = 'authenticated'`

### Remove Dev RLS Policies
In Supabase SQL Editor, run:
```sql
DROP POLICY IF EXISTS "Anon read" ON global_settings;
DROP POLICY IF EXISTS "Anon read" ON shipments;
DROP POLICY IF EXISTS "Anon read" ON units;
DROP POLICY IF EXISTS "Anon read" ON expenses;
DROP POLICY IF EXISTS "Anon read" ON expense_allocations;
DROP POLICY IF EXISTS "Anon read" ON interest_accrual_log;
```

### Daily Interest Cron Job (Optional Audit Trail)
To store daily interest snapshots (for accounting records), create a Supabase Edge Function
or use a Vercel cron:

```typescript
// api/cron/accrue-interest.ts
// Runs daily at midnight IST
// Fetches all active units, calculates daily interest, inserts into interest_accrual_log
```

---

## Database Schema Overview

```
global_settings       → key-value store for all admin variables
shipments             → incoming cargo batches from China
units                 → individual serialized products (core entity)
expenses              → logged costs with liability type
expense_allocations   → computed split of each expense per unit
interest_accrual_log  → optional daily audit snapshots
```

### Key Fields on `units`

| Field | Purpose |
|-------|---------|
| `serial_number` | Unique product identifier |
| `purchase_price_inr` | Base cost in Indian Rupees |
| `date_advance_paid` | **Interest starts here** |
| `date_cash_received` | **Interest stops here** |
| `status` | Controls which expenses it receives |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "Missing Supabase env vars" | Check `.env.local` has both variables |
| Expenses not distributing | Check units have correct status on expense date |
| Interest is 0 | Make sure `date_advance_paid` is set on the unit |
| RLS error | Re-run the RLS policies section of `schema.sql` |
| CNY auto-fill not working | Check Admin Settings has `default_currency_conversion` value |

---

## File Structure

```
src/
├── app/
│   ├── layout.jsx          # Sidebar navigation
│   ├── page.jsx            # Dashboard
│   ├── shipments/page.jsx  # Shipment management
│   ├── units/page.jsx      # Unit Ledger (core feature)
│   ├── expenses/page.jsx   # Expense logging + distribution
│   ├── profitability/page.jsx  # P&L dashboard
│   └── admin/page.jsx      # Global settings
├── lib/
│   ├── supabase.js         # Supabase client + helpers
│   └── engines.js          # ABC + Interest algorithms
└── components/
    └── UI.jsx              # Shared UI components
```

---

*Built for China→India import businesses with 3-5 month cash conversion cycles.*
