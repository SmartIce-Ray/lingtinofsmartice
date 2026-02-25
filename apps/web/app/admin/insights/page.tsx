// Admin Insights Page - Merged customer insights + product insights
// Segmented control to switch between the two views

'use client';

import { useState } from 'react';
import { UserMenu } from '@/components/layout/UserMenu';
import { CustomerInsights } from '@/components/admin/CustomerInsights';
import { ProductInsights } from '@/components/admin/ProductInsights';

type InsightTab = 'customer' | 'product';

export default function InsightsPage() {
  const [activeTab, setActiveTab] = useState<InsightTab>('customer');

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">洞察</h1>
        <UserMenu />
      </header>

      {/* Segmented Control */}
      <div className="px-4 pt-3 pb-1">
        <div className="flex bg-gray-100 rounded-lg p-0.5">
          <button
            onClick={() => setActiveTab('customer')}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'customer'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            顾客
          </button>
          <button
            onClick={() => setActiveTab('product')}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'product'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            产品
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-3">
        {activeTab === 'customer' ? <CustomerInsights /> : <ProductInsights />}
      </div>

      {/* Bottom spacing for nav */}
      <div className="h-4" />
    </div>
  );
}
