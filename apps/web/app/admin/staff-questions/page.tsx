// Admin Product Insights Page - Cross-store topic clustering from employee questions
// v2.0 - Redesigned from raw chat/visit display to 产品洞察

'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { UserMenu } from '@/components/layout/UserMenu';

// --- Types ---
interface TopicItem {
  text: string;
  employeeName: string;
  role: string;
  restaurantName: string;
  count: number;
}

interface Topic {
  code: string;
  label: string;
  icon: string;
  peopleCount: number;
  restaurants: string[];
  roles: string[];
  items: TopicItem[];
}

interface CrossStoreItem {
  label: string;
  icon: string;
  storeCount: number;
}

interface InsightsResponse {
  days: number;
  totalPeople: number;
  totalQuestions: number;
  crossStore: CrossStoreItem[];
  topics: Topic[];
}

export default function ProductInsightsPage() {
  const [days, setDays] = useState(7);

  const { data, isLoading } = useSWR<InsightsResponse>(
    `/api/staff/insights?days=${days}`
  );

  const topics = data?.topics ?? [];
  const crossStore = data?.crossStore ?? [];
  const totalPeople = data?.totalPeople ?? 0;
  const totalQuestions = data?.totalQuestions ?? 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">产品洞察</h1>
        <UserMenu />
      </header>

      <div className="px-4 py-4 space-y-4">
        {/* Summary + time range */}
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-500">
            {!isLoading && totalPeople > 0 && (
              <>近 {days} 天 · {totalPeople} 位员工 · {totalQuestions} 个问题</>
            )}
            {!isLoading && totalPeople === 0 && (
              <>近 {days} 天</>
            )}
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => setDays(7)}
              className={`px-3 py-1 text-xs rounded-full transition-colors ${
                days === 7
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              近7天
            </button>
            <button
              onClick={() => setDays(30)}
              className={`px-3 py-1 text-xs rounded-full transition-colors ${
                days === 30
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              近30天
            </button>
          </div>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white rounded-2xl p-4 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-1/2 mb-3" />
                <div className="h-3 bg-gray-100 rounded w-full mb-2" />
                <div className="h-3 bg-gray-100 rounded w-3/4" />
              </div>
            ))}
          </div>
        )}

        {/* Cross-store highlights */}
        {crossStore.length > 0 && (
          <div className="bg-amber-50 rounded-2xl p-4">
            <div className="flex items-center gap-1.5 mb-2">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              <span className="text-sm font-semibold text-amber-800">多家门店共同关注</span>
            </div>
            <div className="space-y-1">
              {crossStore.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2 text-sm text-amber-700">
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                  <span className="text-xs text-amber-500">· {item.storeCount} 家门店</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Topic cards */}
        {!isLoading && topics.length > 0 && (
          <div className="space-y-3">
            {topics.map((topic) => (
              <div key={topic.code} className="bg-white rounded-2xl p-4">
                {/* Topic header */}
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-base">{topic.icon}</span>
                    <span className="text-sm font-semibold text-gray-900">{topic.label}</span>
                  </div>
                  <span className="text-xs text-gray-400">{topic.peopleCount} 人关注</span>
                </div>

                {/* Restaurant + role tags */}
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {topic.restaurants.map((r, idx) => (
                    <span key={idx} className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                      {r}
                    </span>
                  ))}
                  {topic.roles.length > 0 && (
                    <span className="text-xs text-gray-400">
                      角色：{topic.roles.join(' · ')}
                    </span>
                  )}
                </div>

                {/* Question items */}
                <div className="space-y-2">
                  {topic.items.map((item, idx) => (
                    <div key={idx} className="bg-gray-50 rounded-lg p-3">
                      <p className="text-sm text-gray-700 mb-1">
                        &ldquo;{item.text}&rdquo;
                      </p>
                      <div className="flex items-center justify-between text-xs text-gray-400">
                        <span>
                          {item.role} · {item.restaurantName}
                        </span>
                        {item.count > 1 && (
                          <span className="text-primary-600 font-medium">×{item.count}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && topics.length === 0 && (
          <div className="bg-white rounded-2xl p-8 text-center">
            <div className="text-4xl mb-3">📊</div>
            <h3 className="text-base font-medium text-gray-700 mb-1">暂无产品洞察</h3>
            <p className="text-sm text-gray-400">
              员工使用 AI 智库或完成桌访后，洞察将显示在这里
            </p>
          </div>
        )}

        {/* Bottom spacing for nav */}
        <div className="h-4" />
      </div>
    </div>
  );
}
