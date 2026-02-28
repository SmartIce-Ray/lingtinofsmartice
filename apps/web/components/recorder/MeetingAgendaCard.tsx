// MeetingAgendaCard - Show today's agenda items before daily_review recording

'use client';

import { useState, useEffect } from 'react';
import { getApiUrl } from '@/lib/api';
import { getAuthHeaders } from '@/contexts/AuthContext';

interface AgendaItem {
  category: string;
  title: string;
  detail: string;
  severity: 'high' | 'medium' | 'low';
  evidenceCount: number;
  suggestedAction: string;
  feedbacks: Array<{ tableId: string; text: string }>;
}

interface DailySummary {
  total_visits: number;
  avg_sentiment: number | null;
  agenda_items: AgendaItem[];
  ai_overview: string;
}

interface MeetingAgendaCardProps {
  restaurantId: string | undefined;
}

const SEVERITY_CONFIG = {
  high: { dot: 'bg-red-500', label: '严重', bg: 'bg-red-50 border-red-200' },
  medium: { dot: 'bg-yellow-500', label: '注意', bg: 'bg-yellow-50 border-yellow-200' },
  low: { dot: 'bg-primary-500', label: '轻微', bg: 'bg-primary-50 border-primary-200' },
};

const CATEGORY_LABELS: Record<string, string> = {
  dish_quality: '菜品',
  service_speed: '服务',
  environment: '环境',
  staff_attitude: '态度',
  other: '其他',
};

export function MeetingAgendaCard({ restaurantId }: MeetingAgendaCardProps) {
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!restaurantId) return;

    const fetchSummary = async () => {
      try {
        const response = await fetch(
          getApiUrl(`api/daily-summary?restaurant_id=${restaurantId}`),
          { headers: getAuthHeaders() },
        );
        if (response.ok) {
          const { summary: data } = await response.json();
          setSummary(data);
        }
      } catch {
        // Silently ignore — card just won't show
      } finally {
        setLoading(false);
      }
    };

    fetchSummary();
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

  // No summary yet — show prompt
  if (!summary || !summary.agenda_items || summary.agenda_items.length === 0) {
    return (
      <div className="bg-gray-50 rounded-2xl p-4 border border-gray-200">
        <p className="text-sm text-gray-500 text-center">
          今日议题将于 21:00 自动生成
        </p>
      </div>
    );
  }

  const agendaItems = summary.agenda_items;

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full px-4 py-3 flex items-center justify-between bg-gradient-to-r from-primary-50 to-white"
      >
        <div className="flex items-center gap-2">
          <span className="text-base">📋</span>
          <span className="text-sm font-semibold text-gray-800">
            今日议题
          </span>
          <span className="text-xs bg-primary-100 text-primary-700 px-1.5 py-0.5 rounded-full font-medium">
            {agendaItems.length}项
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
          {/* Overview */}
          {summary.ai_overview && (
            <p className="text-xs text-gray-500 leading-relaxed pt-1">
              {summary.ai_overview}
            </p>
          )}

          {/* Agenda Items */}
          {agendaItems.map((item, idx) => {
            const config = SEVERITY_CONFIG[item.severity] || SEVERITY_CONFIG.low;
            const categoryLabel = CATEGORY_LABELS[item.category] || item.category;

            return (
              <div
                key={idx}
                className={`rounded-xl p-3 border ${config.bg}`}
              >
                <div className="flex items-start gap-2">
                  <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${config.dot}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-gray-500 font-medium">{categoryLabel}</span>
                      <span className="text-sm font-semibold text-gray-800">{item.title}</span>
                    </div>
                    <p className="text-xs text-gray-600 mt-0.5">
                      {item.evidenceCount}桌反映 → {item.suggestedAction}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Stats bar */}
          <div className="flex justify-between items-center pt-1 text-xs text-gray-400">
            <span>今日 {summary.total_visits} 次桌访</span>
            {summary.avg_sentiment !== null && (
              <span>均分 {summary.avg_sentiment.toFixed(2)}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
