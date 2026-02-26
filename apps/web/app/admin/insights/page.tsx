// Admin Insights Page - Merged customer insights + product insights
// Segmented control to switch between the two views

'use client';

import { useState } from 'react';
import { UserMenu } from '@/components/layout/UserMenu';
import { CustomerInsights } from '@/components/admin/CustomerInsights';
import { ProductInsights } from '@/components/admin/ProductInsights';
import { getChinaYesterday, shiftDate, formatDateDisplay } from '@/lib/date-utils';

type InsightTab = 'customer' | 'product';

export default function InsightsPage() {
  const [activeTab, setActiveTab] = useState<InsightTab>('customer');
  const [selectedDate, setSelectedDate] = useState(getChinaYesterday);
  const maxDate = getChinaYesterday();
  const canGoForward = selectedDate < maxDate;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">洞察</h1>
        <div className="flex items-center gap-2">
          {/* Date navigation */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setSelectedDate(shiftDate(selectedDate, -1))}
              className="w-7 h-7 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 active:bg-gray-200"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            </button>
            <span className="text-sm text-gray-500 font-medium px-1">{formatDateDisplay(selectedDate)}</span>
            <button
              onClick={() => canGoForward && setSelectedDate(shiftDate(selectedDate, 1))}
              disabled={!canGoForward}
              className={`w-7 h-7 flex items-center justify-center rounded-full transition-colors ${
                canGoForward ? 'text-gray-400 hover:bg-gray-100 active:bg-gray-200' : 'text-gray-200'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
          <UserMenu />
        </div>
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
        {activeTab === 'customer' ? <CustomerInsights date={selectedDate} /> : <ProductInsights />}
      </div>

      {/* Bottom spacing for nav */}
      <div className="h-4" />
    </div>
  );
}
