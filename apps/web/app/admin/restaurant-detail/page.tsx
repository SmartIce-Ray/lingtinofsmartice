// Restaurant Detail Page - View visit records for a specific restaurant
// v1.2 - Added: Expandable transcript view for each visit record

'use client';

import { Suspense, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import useSWR from 'swr';

// Types
interface VisitRecord {
  id: string;
  table_id: string;
  visit_period: string;
  sentiment_score: number | null;
  ai_summary: string | null;
  keywords: string[];
  manager_questions: string[];
  customer_answers: string[];
  corrected_transcript: string | null;
  created_at: string;
}

interface RestaurantDetailResponse {
  restaurant: {
    id: string;
    name: string;
  };
  visits: VisitRecord[];
  summary: {
    total_visits: number;
    avg_sentiment: number | null;
  };
}

// Keyword sentiment detection
const POSITIVE_KEYWORDS = ['好吃', '超好吃', '很好吃', '服务好', '服务热情', '环境好', '环境不错', '干净', '新鲜', '分量足', '实惠', '会再来', '推荐朋友', '肉质好', '火候刚好', '味道好', '蘸料好', '烤肉香', '小菜好吃'];
const NEGATIVE_KEYWORDS = ['偏咸', '太咸', '太油', '上菜慢', '服务差', '服务一般', '态度不好', '不新鲜', '退菜', '空调冷', '等位久', '一般般', '还行'];

function getKeywordStyle(keyword: string): string {
  if (POSITIVE_KEYWORDS.some(pk => keyword.includes(pk))) return 'bg-green-50 text-green-600';
  if (NEGATIVE_KEYWORDS.some(nk => keyword.includes(nk))) return 'bg-red-50 text-red-600';
  return 'bg-gray-100 text-gray-600';
}

function getSatisfactionDisplay(score: number | null): { color: string; bg: string; label: string } {
  if (score === null) return { color: 'text-gray-400', bg: 'bg-gray-100', label: '暂无' };
  if (score >= 70) return { color: 'text-green-600', bg: 'bg-green-100', label: '满意' };
  if (score >= 50) return { color: 'text-yellow-600', bg: 'bg-yellow-100', label: '一般' };
  return { color: 'text-red-600', bg: 'bg-red-100', label: '不满意' };
}

function formatTime(dateString: string): string {
  return new Date(dateString).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function RestaurantDetailContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const restaurantId = searchParams.get('id');
  const date = searchParams.get('date');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading, error } = useSWR<RestaurantDetailResponse>(
    restaurantId ? `/api/dashboard/restaurant/${restaurantId}${date ? `?date=${date}` : ''}` : null
  );

  const restaurant = data?.restaurant;
  const visits = data?.visits || [];

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <header className="bg-white shadow-sm px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button
          onClick={() => router.back()}
          className="p-1 -ml-1 text-gray-600"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-lg font-semibold text-gray-900 truncate">
          {restaurant?.name || '门店详情'}
        </h1>
      </header>

      <main className="p-4 space-y-4 max-w-7xl mx-auto">
        {!restaurantId && (
          <div className="bg-white rounded-2xl p-8 shadow-sm text-center text-gray-500">
            缺少门店ID参数
          </div>
        )}

        {isLoading && (
          <div className="bg-white rounded-2xl p-8 shadow-sm text-center text-gray-500">
            加载中...
          </div>
        )}

        {error && (
          <div className="bg-white rounded-2xl p-8 shadow-sm text-center text-red-500">
            加载失败，请刷新重试
          </div>
        )}

        {!isLoading && !error && restaurantId && visits.length === 0 && (
          <div className="bg-white rounded-2xl p-8 shadow-sm text-center">
            <div className="text-gray-400 mb-2">
              <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </div>
            <div className="text-gray-500 text-sm">今日暂无桌访记录</div>
          </div>
        )}

        {/* Visit Records - responsive grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {visits.map((visit) => {
            const sentiment = getSatisfactionDisplay(visit.sentiment_score);
            const isExpanded = expandedId === visit.id;
            return (
              <div
                key={visit.id}
                className={`bg-white rounded-2xl p-4 shadow-sm transition-shadow ${
                  visit.corrected_transcript ? 'cursor-pointer hover:shadow-md' : ''
                }`}
                onClick={() => {
                  if (visit.corrected_transcript) {
                    setExpandedId(isExpanded ? null : visit.id);
                  }
                }}
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-primary-600 font-medium">{visit.table_id}</span>
                    </div>
                    <div>
                      <div className="font-medium text-gray-900">{visit.table_id}桌</div>
                      <div className="text-xs text-gray-400">
                        {visit.visit_period === 'lunch' ? '午市' : '晚市'} · {formatTime(visit.created_at)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className={`px-2.5 py-1 rounded-full ${sentiment.bg} flex-shrink-0`}>
                      <span className={`text-xs font-medium ${sentiment.color}`}>
                        {visit.sentiment_score !== null ? Math.round(visit.sentiment_score) : '--'}
                        <span className="ml-0.5">{sentiment.label}</span>
                      </span>
                    </div>
                    {/* Expand indicator */}
                    {visit.corrected_transcript && (
                      <svg
                        className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    )}
                  </div>
                </div>

                {/* AI Summary */}
                {visit.ai_summary && (
                  <div className="text-sm text-gray-600 mb-3 italic bg-gray-50 rounded-lg p-2">
                    &quot;{visit.ai_summary}&quot;
                  </div>
                )}

                {/* Q&A Conversation */}
                {((visit.manager_questions && visit.manager_questions.length > 0) ||
                  (visit.customer_answers && visit.customer_answers.length > 0)) && (
                  <div className="mb-3 border-l-2 border-primary-200 pl-3 space-y-1">
                    {visit.manager_questions && visit.manager_questions.length > 0 && (
                      <div className="flex gap-2">
                        <span className="w-7 text-right text-[10px] text-gray-400 pt-0.5 flex-shrink-0">店长</span>
                        <p className="text-sm text-gray-600">{visit.manager_questions.join(' ')}</p>
                      </div>
                    )}
                    {visit.customer_answers && visit.customer_answers.length > 0 && (
                      <div className="flex gap-2">
                        <span className="w-7 text-right text-[10px] text-gray-400 pt-0.5 flex-shrink-0">顾客</span>
                        <p className="text-sm text-gray-800">{visit.customer_answers.join(' ')}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Expanded transcript */}
                {isExpanded && visit.corrected_transcript && (
                  <div className="mb-3 p-3 bg-gray-50 rounded-lg">
                    <div className="text-xs text-gray-500 mb-1 font-medium">录音全文</div>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                      {visit.corrected_transcript}
                    </p>
                  </div>
                )}

                {/* Keywords */}
                {visit.keywords && visit.keywords.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {visit.keywords.map((kw, idx) => (
                      <span
                        key={idx}
                        className={`px-2 py-0.5 rounded text-xs ${getKeywordStyle(kw)}`}
                      >
                        {kw}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}

export default function RestaurantDetailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">加载中...</div>
      </div>
    }>
      <RestaurantDetailContent />
    </Suspense>
  );
}
