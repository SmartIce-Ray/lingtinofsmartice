// PreMealReminder - Show yesterday's pending action items before pre_meal recording

'use client';

import { useState, useEffect } from 'react';
import { getApiUrl } from '@/lib/api';
import { getAuthHeaders } from '@/contexts/AuthContext';

interface ActionItem {
  id: string;
  suggestion_text: string;
  assignee: string | null;
  deadline: string | null;
  category: string;
  priority: string;
  status: string;
}

interface PreMealReminderProps {
  restaurantId: string | undefined;
}

function getYesterdayDateString(): string {
  const now = new Date();
  const chinaOffset = 8 * 60;
  const localOffset = now.getTimezoneOffset();
  const chinaTime = new Date(now.getTime() + (chinaOffset + localOffset) * 60 * 1000);
  chinaTime.setDate(chinaTime.getDate() - 1);
  const year = chinaTime.getFullYear();
  const month = String(chinaTime.getMonth() + 1).padStart(2, '0');
  const day = String(chinaTime.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function PreMealReminder({ restaurantId }: PreMealReminderProps) {
  const [items, setItems] = useState<ActionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!restaurantId) return;

    const fetchItems = async () => {
      try {
        const yesterday = getYesterdayDateString();
        const response = await fetch(
          getApiUrl(`api/action-items?restaurant_id=${restaurantId}&date=${yesterday}`),
          { headers: getAuthHeaders() },
        );
        if (response.ok) {
          const { actions } = await response.json();
          // Only show pending/acknowledged items (not resolved/dismissed)
          const pending = (actions || []).filter(
            (a: ActionItem) => a.status === 'pending' || a.status === 'acknowledged',
          );
          setItems(pending);
        }
      } catch {
        // Silently ignore
      } finally {
        setLoading(false);
      }
    };

    fetchItems();
  }, [restaurantId]);

  if (loading) {
    return (
      <div className="bg-white rounded-2xl p-4 shadow-sm animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-1/3 mb-3"></div>
        <div className="h-3 bg-gray-200 rounded w-full mb-2"></div>
        <div className="h-3 bg-gray-200 rounded w-2/3"></div>
      </div>
    );
  }

  // No pending items — show a ready card instead of nothing
  if (items.length === 0) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-2xl px-4 py-3 flex items-center gap-3">
        <span className="text-xl flex-shrink-0">✅</span>
        <div>
          <p className="text-sm font-medium text-green-800">昨日待办全部跟进完毕</p>
          <p className="text-xs text-green-600 mt-0.5">今天开门红！开始录制餐前会吧</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full px-4 py-3 flex items-center justify-between bg-gradient-to-r from-amber-50 to-white"
      >
        <div className="flex items-center gap-2">
          <span className="text-base">🔔</span>
          <span className="text-sm font-semibold text-gray-800">
            昨日复盘待办
          </span>
          <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">
            {items.length}项
          </span>
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${collapsed ? '' : 'rotate-180'}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Content */}
      {!collapsed && (
        <div className="px-4 pb-4 space-y-2">
          {items.map(item => (
            <div
              key={item.id}
              className="flex items-start gap-2.5 p-2.5 rounded-xl bg-gray-50"
            >
              <span className="w-4 h-4 rounded border-2 border-gray-300 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-800 leading-snug">
                  {item.suggestion_text}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  {item.assignee && (
                    <span className="text-xs text-gray-500">@{item.assignee}</span>
                  )}
                  {item.deadline && (
                    <span className="text-xs text-gray-400">{item.deadline}</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
