import React from 'react';
import Link from 'next/link';
import { requireAdminAuth } from '@/lib/auth/admin-auth';
import { BarChart3, TrendingUp, PackageCheck, Layers, RotateCcw } from 'lucide-react';

export default async function ReportsAdminIndexPage() {
  const session = await requireAdminAuth();

  const reportCards = [
    {
      title: 'Sales & Revenue Report',
      description: 'Order-level financial ledger, gross sales, net revenue, FIFO COGS, operating expenses, and net profit analysis.',
      href: '/admin/reports/sales',
      icon: TrendingUp,
      status: 'AVAILABLE',
      color: 'emerald',
    },
    {
      title: 'Inventory Valuation Report',
      description: 'Physical vs available stock, FIFO cost layer valuation, and low-stock alerts.',
      href: '/admin/reports/inventory',
      icon: Layers,
      status: 'AVAILABLE',
      color: 'cyan',
    },
    {
      title: 'Product Performance Report',
      description: 'Sales velocity, unit volumes, revenue attribution, and gross margin per SKU.',
      href: '/admin/reports/products',
      icon: PackageCheck,
      status: 'AVAILABLE',
      color: 'purple',
    },
    {
      title: 'Returns & Refunds Report',
      description: 'Return request statuses, refund reason breakdown, and customer return rates.',
      href: '/admin/reports/returns',
      icon: RotateCcw,
      status: 'AVAILABLE',
      color: 'amber',
    },
  ];

  return (
    <div className="space-y-8 pb-12">
      <div>
        <h1 className="text-2xl font-semibold text-white tracking-tight flex items-center space-x-3">
          <BarChart3 className="w-6 h-6 text-neutral-400" />
          <span>Financial & Operational Reports</span>
        </h1>
        <p className="text-xs text-neutral-400 font-mono tracking-wider uppercase mt-1">
          Centralized Reporting Suite • ({session.email})
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {reportCards.map((card) => {
          const Icon = card.icon;
          const isAvailable = card.status === 'AVAILABLE';

          return (
            <div
              key={card.title}
              className={`bg-neutral-900 border border-neutral-800 rounded-xl p-6 space-y-4 flex flex-col justify-between ${
                isAvailable ? 'hover:border-neutral-700 transition-colors' : 'opacity-70'
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="p-2.5 bg-neutral-950 border border-neutral-800 rounded-lg">
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded border uppercase ${
                      isAvailable
                        ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800'
                        : 'bg-neutral-950 text-neutral-500 border-neutral-800'
                    }`}
                  >
                    {card.status}
                  </span>
                </div>

                <h2 className="text-base font-semibold text-white">{card.title}</h2>
                <p className="text-xs text-neutral-400 leading-relaxed">{card.description}</p>
              </div>

              <div>
                {isAvailable ? (
                  <Link
                    href={card.href}
                    className="inline-flex items-center space-x-2 text-xs font-mono text-cyan-400 hover:text-cyan-300 font-medium transition-colors"
                  >
                    <span>Open Report &rarr;</span>
                  </Link>
                ) : (
                  <span className="text-xs font-mono text-neutral-600">Locked in Phase 13</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
