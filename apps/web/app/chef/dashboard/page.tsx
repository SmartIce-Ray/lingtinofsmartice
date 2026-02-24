// Chef Dashboard - Action items filtered for kitchen (dish_quality)
// Shows: quick stats → pre-meal reminders (yesterday unresolved) → today's tasks

'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { useAuth } from '@/contexts/AuthContext';
import { UserMenu } from '@/components/layout/UserMenu';
import { getApiUrl } from '@/lib/api';
import { getAuthHeaders } from '@/contexts/AuthContext';
import { getDateForSelection } from '@/lib/date-utils';
import type { ActionItem, ActionItemsResponse } from '@/lib/action-item-constants';
import { CATEGORY_LABELS, PRIORITY_CONFIG, STATUS_CONFIG } from '@/lib/action-item-constants';

// Filter: kitchen-relevant items
function isKitchenRelevant(item: ActionItem): boolean {
  if (item.category === 'dish_quality') return true;
  if (/厨师|厨房|后厨|菜品|出品/.test(item.suggestion_text)) return true;
  return false;
}

export default function ChefDashboardPage() {
  const { user } = useAuth();
  const restaurantId = user?.restaurantId;

  const todayDate = getDateForSelection('今日');
  const yesterdayDate = getDateForSelection('昨日');

  // Fetch today's and yesterday's action items
  const todayParams = restaurantId ? new URLSearchParams({ restaurant_id: restaurantId, date: todayDate }).toString() : null;
  const yesterdayParams = restaurantId ? new URLSearchParams({ restaurant_id: restaurantId, date: yesterdayDate }).toString() : null;

  const { data: todayData, isLoading: todayLoading, mutate: mutateToday } = useSWR<ActionItemsResponse>(
    todayParams ? `/api/action-items?${todayParams}` : null,
  );
  const { data: yesterdayData, isLoading: yesterdayLoading, mutate: mutateYesterday } = useSWR<ActionItemsResponse>(
    yesterdayParams ? `/api/action-items?${yesterdayParams}` : null,
  );

  const todayActions = (todayData?.actions ?? []).filter(isKitchenRelevant);
  const yesterdayUnresolved = (yesterdayData?.actions ?? [])
    .filter(isKitchenRelevant)
    .filter(a => a.status === 'pending' || a.status === 'acknowledged');

  // Stats
  const pendingCount = todayActions.filter(a => a.status === 'pending').length + yesterdayUnresolved.length;
  const yesterdayNegativeCount = (yesterdayData?.actions ?? [])
    .filter(a => a.category === 'dish_quality')
    .length;

  // Update status handler
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const handleUpdateStatus = async (id: string, status: string, note?: string) => {
    setUpdatingId(id);
    try {
      const res = await fetch(
        getApiUrl(`api/action-items/${id}`),
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ status, note }),
        },
      );
      if (!res.ok) throw new Error('Update failed');
      await mutateToday();
      await mutateYesterday();
    } catch (err) {
      console.error('Failed to update action item:', err);
    } finally {
      setUpdatingId(null);
    }
  };

  // Date display
  const now = new Date();
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  const dateLabel = `${now.getMonth() + 1}月${now.getDate()}日 周${weekdays[now.getDay()]}`;

  const isLoading = todayLoading || yesterdayLoading;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm px-4 py-3 flex items-center justify-between">
        <div className="text-base font-semibold text-gray-800">{dateLabel}</div>
        <UserMenu />
      </header>

      <main className="px-4 pt-4 pb-4 space-y-5">
        {/* Quick Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-2xl p-4 shadow-sm text-center">
            <div className="text-2xl font-bold text-red-600">{pendingCount}</div>
            <div className="text-xs text-gray-500 mt-1">待处理任务</div>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm text-center">
            <div className="text-2xl font-bold text-yellow-600">{yesterdayNegativeCount}</div>
            <div className="text-xs text-gray-500 mt-1">昨日菜品投诉</div>
          </div>
        </div>

        {isLoading && (
          <div className="text-center py-8 text-gray-400 text-sm">加载中...</div>
        )}

        {/* Pre-meal reminders: yesterday unresolved dish_quality */}
        {!isLoading && yesterdayUnresolved.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
              <span>📋</span> 餐前关注
            </h2>
            <div className="space-y-3">
              {yesterdayUnresolved.map((item) => (
                <ActionCard
                  key={item.id}
                  item={item}
                  updatingId={updatingId}
                  onUpdateStatus={handleUpdateStatus}
                />
              ))}
            </div>
          </section>
        )}

        {/* Today's tasks */}
        {!isLoading && (
          <section>
            <h2 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
              <span>📋</span> 今日待办
            </h2>
            {todayActions.length === 0 ? (
              <div className="bg-white rounded-2xl p-6 shadow-sm text-center">
                <div className="text-green-500 text-lg mb-1">✅</div>
                <p className="text-sm text-gray-500">今日暂无厨房相关任务</p>
              </div>
            ) : (
              <div className="space-y-3">
                {todayActions.map((item) => (
                  <ActionCard
                    key={item.id}
                    item={item}
                    updatingId={updatingId}
                    onUpdateStatus={handleUpdateStatus}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {/* All done state */}
        {!isLoading && todayActions.length > 0 && yesterdayUnresolved.length === 0 &&
          todayActions.every(a => a.status === 'resolved' || a.status === 'dismissed') && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-4 text-center">
            <p className="text-sm text-green-700 font-medium">✅ 今日任务已全部跟进</p>
          </div>
        )}
      </main>
    </div>
  );
}

// Reusable action item card for chef
function ActionCard({
  item,
  updatingId,
  onUpdateStatus,
}: {
  item: ActionItem;
  updatingId: string | null;
  onUpdateStatus: (id: string, status: string, note?: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const priority = PRIORITY_CONFIG[item.priority] || PRIORITY_CONFIG.medium;
  const category = CATEGORY_LABELS[item.category] || item.category;
  const statusConf = STATUS_CONFIG[item.status];

  return (
    <div className={`bg-white rounded-2xl p-4 shadow-sm border ${
      item.status === 'resolved' ? 'border-green-200 bg-green-50/50' :
      item.status === 'acknowledged' ? 'border-blue-200 bg-blue-50/30' :
      'border-gray-200'
    }`}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${priority.bg} ${priority.color}`}>
          {priority.label}
        </span>
        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600">
          {category}
        </span>
        {statusConf && (
          <span className={`ml-auto text-xs ${statusConf.color}`}>
            {statusConf.label}
          </span>
        )}
      </div>

      {/* Suggestion */}
      <p className="text-sm text-gray-800 leading-relaxed">{item.suggestion_text}</p>

      {/* Resolved note */}
      {item.status === 'resolved' && item.resolved_note && (
        <div className="mt-2 text-xs text-green-700 bg-green-50 rounded px-2 py-1">
          备注: {item.resolved_note}
        </div>
      )}

      {/* Evidence toggle */}
      {item.evidence && item.evidence.length > 0 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-2 text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          {expanded ? '收起详情' : `▸ 查看原始反馈 (${item.evidence.length}条)`}
        </button>
      )}

      {/* Evidence list */}
      {expanded && item.evidence && (
        <div className="mt-2 space-y-1.5">
          {item.evidence.map((ev, idx) => (
            <div key={idx} className="text-xs bg-gray-50 rounded-lg px-2.5 py-1.5">
              <span className="text-gray-500">{ev.tableId}桌:</span>{' '}
              <span className="text-gray-700">&ldquo;{ev.feedback}&rdquo;</span>
            </div>
          ))}
        </div>
      )}

      {/* Action buttons — 48px touch targets */}
      {(item.status === 'pending' || item.status === 'acknowledged') && (
        <div className="flex items-center gap-2 mt-3 pt-2 border-t border-gray-100">
          {item.status === 'pending' && (
            <button
              onClick={() => onUpdateStatus(item.id, 'acknowledged')}
              disabled={updatingId === item.id}
              className="min-h-[48px] px-4 py-2 text-sm rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors disabled:opacity-50 font-medium"
            >
              知悉
            </button>
          )}
          <button
            onClick={() => onUpdateStatus(item.id, 'resolved')}
            disabled={updatingId === item.id}
            className="min-h-[48px] px-4 py-2 text-sm rounded-xl bg-green-50 text-green-600 hover:bg-green-100 transition-colors disabled:opacity-50 font-medium"
          >
            已解决
          </button>
          {item.status === 'pending' && (
            <button
              onClick={() => onUpdateStatus(item.id, 'dismissed')}
              disabled={updatingId === item.id}
              className="min-h-[48px] px-4 py-2 text-sm rounded-xl bg-gray-50 text-gray-400 hover:bg-gray-100 transition-colors disabled:opacity-50 ml-auto"
            >
              忽略
            </button>
          )}
        </div>
      )}
    </div>
  );
}
