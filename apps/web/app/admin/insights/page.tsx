// Admin Insights Page - Customer insights + Product insights + Employee feedback
// Segmented control to switch between views

'use client';

import { useState } from 'react';
import { UserMenu } from '@/components/layout/UserMenu';
import { useAuth } from '@/contexts/AuthContext';
import { useManagedScope } from '@/hooks/useManagedScope';
import { CustomerInsights } from '@/components/admin/CustomerInsights';
import { ProductInsights } from '@/components/admin/ProductInsights';
import { FeedbackManagement } from '@/components/admin/FeedbackManagement';
import { getChinaYesterday, singleDay, dateRangeParams } from '@/lib/date-utils';
import type { DateRange } from '@/lib/date-utils';
import { DatePicker, adminPresets } from '@/components/shared/DatePicker';

type InsightTab = 'customer' | 'product' | 'feedback';

export default function InsightsPage() {
  const { user } = useAuth();
  const { managedIdsParam } = useManagedScope();
  const isSuperAdmin = user?.isSuperAdmin === true;
  const [activeTab, setActiveTab] = useState<InsightTab>('customer');
  const [dateRange, setDateRange] = useState<DateRange>(() => singleDay(getChinaYesterday()));

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">洞察</h1>
        <div className="flex items-center gap-2">
          {activeTab !== 'feedback' && (
            <DatePicker
              value={dateRange}
              onChange={setDateRange}
              maxDate={getChinaYesterday()}
              presets={adminPresets}
            />
          )}
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
          {isSuperAdmin && (
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
          )}
          <button
            onClick={() => setActiveTab('feedback')}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'feedback'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            员工反馈
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-3">
        {activeTab === 'customer' && <CustomerInsights startDate={dateRange.startDate} endDate={dateRange.endDate} managedIdsParam={managedIdsParam} />}
        {activeTab === 'product' && <ProductInsights />}
        {activeTab === 'feedback' && <FeedbackManagement />}
      </div>

      {/* Bottom spacing for nav */}
      <div className="h-4" />
    </div>
  );
}
