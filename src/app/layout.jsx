'use client';

import './globals.css';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Package, Receipt, Ship, TrendingUp, Settings, ChevronRight
} from 'lucide-react';

const NAV = [
  { href: '/',              label: 'Dashboard',     icon: LayoutDashboard },
  { href: '/shipments',     label: 'Shipments',     icon: Ship },
  { href: '/units',         label: 'Unit Ledger',   icon: Package },
  { href: '/expenses',      label: 'Expenses',      icon: Receipt },
  { href: '/profitability', label: 'Profitability', icon: TrendingUp },
  { href: '/admin',         label: 'Admin',         icon: Settings },
];

export default function RootLayout({ children }) {
  const pathname = usePathname();

  return (
    <html lang="en">
      <head>
        <title>ImportLedger Pro</title>
        <meta name="description" content="Activity-Based Costing for Import Businesses" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="min-h-screen bg-[#060a0f] text-slate-200 grid-pattern">
        <div className="flex h-screen overflow-hidden">
          {/* ── Sidebar ── */}
          <aside className="w-64 flex-shrink-0 bg-[#0b1015] border-r border-slate-800/60 flex flex-col">
            {/* Logo */}
            <div className="px-6 py-6 border-b border-slate-800/60">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center">
                  <span className="text-black font-bold text-sm" style={{ fontFamily: 'Syne, sans-serif' }}>IL</span>
                </div>
                <div>
                  <p className="font-bold text-white leading-none" style={{ fontFamily: 'Syne, sans-serif', fontSize: '0.95rem' }}>ImportLedger</p>
                  <p className="text-xs text-slate-500 mt-0.5">Pro · ABC Engine</p>
                </div>
              </div>
            </div>

            {/* Nav links */}
            <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
              {NAV.map(({ href, label, icon: Icon }) => {
                const active = pathname === href;
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 group
                      ${active
                        ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                      }`}
                  >
                    <Icon size={16} className={active ? 'text-amber-400' : 'text-slate-500 group-hover:text-slate-300'} />
                    <span className="text-sm font-medium">{label}</span>
                    {active && <ChevronRight size={12} className="ml-auto text-amber-500" />}
                  </Link>
                );
              })}
            </nav>

            {/* Footer */}
            <div className="px-4 py-4 border-t border-slate-800/60">
              <p className="text-xs text-slate-600 text-center">China → India · ABC Costing</p>
            </div>
          </aside>

          {/* ── Main content ── */}
          <main className="flex-1 overflow-y-auto">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
