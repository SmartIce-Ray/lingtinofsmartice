// ActionItemsCard - AI-generated improvement suggestions card for dashboard
// v1.0 - Display, generate, and manage action items

'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { getApiUrl } from '@/lib/api';

interface EvidenceItem {
  visitId: string;
  tableId: string;
  feedback: string;
  sentiment: string;
}

interface ActionItem {
  id: string;
  category: string;
  suggestion_text: string;
  priority: 'high' | 'medium' | 'low';
  evidence: EvidenceItem[];
  status: 'pending' | 'acknowledged' | 'resolved' | 'dismissed';
  acknowledged_at?: string;
  resolved_at?: string;
  resolved_note?: string;
}

interface ActionItemsResponse {
  actions: ActionItem[];
  message?: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  dish_quality: '菜品质量',
  service_speed: '服务速度',
  environment: '环境',
  staff_attitude: '员工态度',
  other: '其他',
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  high: { label: '高', color: 'text-red-700', bg: 'bg-red-100' },
  medium: { label: '中', color: 'text-yellow-700', bg: 'bg-yellow-100' },
  low: { label: '低', color: 'text-blue-700', bg: 'bg-blue-100' },
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending: { label: '待处理', color: 'text-orange-600' },
  acknowledged: { label: '已知悉', color: 'text-blue-600' },
  resolved: { label: '已解决', color: 'text-green-600' },
};

interface ActionItemsCardProps {
  restaurantId: string;
  date: string;
}

export function ActionItemsCard({ restaurantId, date }: ActionItemsCardProps) {
  const [generating, setGenerating] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolveNote, setResolveNote] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const params = new URLSearchParams({ restaurant_id: restaurantId, date }).toString();
  const { data, isLoading, mutate } = useSWR<ActionItemsResponse>(
    `/api/action-items?${params}`,
  );

  const actions = data?.actions ?? [];

  // Generate action items via POST
  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const token = localStorage.getItem('lingtin_auth_token');
      const res = await fetch(
        getApiUrl(`api/action-items/generate?${params}`),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        },
      );
      if (!res.ok) throw new Error('Generate failed');
      await mutate();
    } catch (err) {
      console.error('Failed to generate action items:', err);
    } finally {
      setGenerating(false);
    }
  };

  // Update action item status via PATCH
  const handleUpdateStatus = async (id: string, status: string, note?: string) => {
    setUpdatingId(id);
    try {
      const token = localStorage.getItem('lingtin_auth_token');
      const res = await fetch(
        getApiUrl(`api/action-items/${id}`),
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ status, note }),
        },
      );
      if (!res.ok) throw new Error('Update failed');
      await mutate();
      if (status === 'resolved') {
        setResolvingId(null);
        setResolveNote('');
      }
    } catch (err) {
      console.error('Failed to update action item:', err);
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium text-gray-700">AI 行动建议</h2>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-full bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors disabled:opacity-50"
        >
          {generating ? (
            <>
              <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span>生成中...</span>
            </>
          ) : actions.length > 0 ? (
            <>
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>重新生成</span>
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707" strokeLinecap="round" />
                <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
              </svg>
              <span>生成今日建议</span>
            </>
          )}
        </button>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="text-center py-6 text-gray-400 text-sm">加载中...</div>
      )}

      {/* Empty state */}
      {!isLoading && actions.length === 0 && (
        <div className="text-center py-6">
          <div className="text-gray-400 text-sm">
            {generating ? '正在分析今日反馈...' : '暂无行动建议，点击上方按钮生成'}
          </div>
        </div>
      )}

      {/* Action items list */}
      {actions.length > 0 && (
        <div className="space-y-3">
          {actions.map((item) => (
            <div
              key={item.id}
              className={`rounded-xl border p-3 transition-colors ${
                item.status === 'resolved'
                  ? 'border-green-200 bg-green-50/50'
                  : item.status === 'acknowledged'
                    ? 'border-blue-200 bg-blue-50/30'
                    : 'border-gray-200'
              }`}
            >
              {/* Header: priority + category + status */}
              <div className="flex items-center gap-2 mb-2">
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${PRIORITY_CONFIG[item.priority]?.bg} ${PRIORITY_CONFIG[item.priority]?.color}`}>
                  {PRIORITY_CONFIG[item.priority]?.label || item.priority}
                </span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600">
                  {CATEGORY_LABELS[item.category] || item.category}
                </span>
                <span className={`ml-auto text-xs ${STATUS_CONFIG[item.status]?.color || 'text-gray-500'}`}>
                  {STATUS_CONFIG[item.status]?.label || item.status}
                </span>
              </div>

              {/* Suggestion text */}
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
                  onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                  className="mt-2 text-xs text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {expandedId === item.id ? '收起详情' : `查看原始反馈 (${item.evidence.length}条)`}
                </button>
              )}

              {/* Evidence list */}
              {expandedId === item.id && item.evidence && (
                <div className="mt-2 space-y-1.5">
                  {item.evidence.map((ev, idx) => (
                    <div key={idx} className="text-xs bg-gray-50 rounded-lg px-2.5 py-1.5">
                      <span className="text-gray-500">{ev.tableId}桌:</span>{' '}
                      <span className="text-gray-700">"{ev.feedback}"</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Action buttons */}
              {item.status === 'pending' && (
                <div className="flex items-center gap-2 mt-3 pt-2 border-t border-gray-100">
                  <button
                    onClick={() => handleUpdateStatus(item.id, 'acknowledged')}
                    disabled={updatingId === item.id}
                    className="px-3 py-1 text-xs rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors disabled:opacity-50"
                  >
                    知悉
                  </button>
                  <button
                    onClick={() => setResolvingId(resolvingId === item.id ? null : item.id)}
                    disabled={updatingId === item.id}
                    className="px-3 py-1 text-xs rounded-full bg-green-50 text-green-600 hover:bg-green-100 transition-colors disabled:opacity-50"
                  >
                    已解决
                  </button>
                  <button
                    onClick={() => handleUpdateStatus(item.id, 'dismissed')}
                    disabled={updatingId === item.id}
                    className="px-3 py-1 text-xs rounded-full bg-gray-50 text-gray-400 hover:bg-gray-100 transition-colors disabled:opacity-50 ml-auto"
                  >
                    忽略
                  </button>
                </div>
              )}

              {/* Acknowledged: still allow resolving */}
              {item.status === 'acknowledged' && (
                <div className="flex items-center gap-2 mt-3 pt-2 border-t border-gray-100">
                  <button
                    onClick={() => setResolvingId(resolvingId === item.id ? null : item.id)}
                    disabled={updatingId === item.id}
                    className="px-3 py-1 text-xs rounded-full bg-green-50 text-green-600 hover:bg-green-100 transition-colors disabled:opacity-50"
                  >
                    标记已解决
                  </button>
                </div>
              )}

              {/* Resolve note input */}
              {resolvingId === item.id && (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="text"
                    value={resolveNote}
                    onChange={(e) => setResolveNote(e.target.value)}
                    placeholder="备注（可选）"
                    className="flex-1 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-green-400"
                  />
                  <button
                    onClick={() => handleUpdateStatus(item.id, 'resolved', resolveNote || undefined)}
                    disabled={updatingId === item.id}
                    className="px-3 py-1.5 text-xs rounded-lg bg-green-500 text-white hover:bg-green-600 transition-colors disabled:opacity-50"
                  >
                    确认
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
