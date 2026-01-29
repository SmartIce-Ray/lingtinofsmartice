// Admin Dashboard Page - Multi-store overview for administrator/boss role
// v3.1 - Added: Keyword sentiment colors (green/red), clickable restaurant cards

'use client';

import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { UserMenu } from '@/components/layout/UserMenu';

// Types for API response
interface RestaurantOverview {
  id: string;
  name: string;
  visit_count: number;
  open_count: number;
  coverage: number;
  avg_sentiment: number | null;
  keywords: string[];
}

interface OverviewResponse {
  summary: {
    total_visits: number;
    avg_sentiment: number | null;
    restaurant_count: number;
  };
  restaurants: RestaurantOverview[];
  recent_keywords: string[];
}

// Sentiment score to color and label
function getSentimentDisplay(score: number | null): { color: string; bg: string; label: string } {
  if (score === null) return { color: 'text-gray-400', bg: 'bg-gray-100', label: '暂无' };
  if (score >= 0.7) return { color: 'text-green-600', bg: 'bg-green-100', label: '优秀' };
  if (score >= 0.5) return { color: 'text-yellow-600', bg: 'bg-yellow-100', label: '一般' };
  return { color: 'text-red-600', bg: 'bg-red-100', label: '需关注' };
}

// Format sentiment score as percentage
function formatSentiment(score: number | null): string {
  if (score === null) return '--';
  return `${Math.round(score * 100)}`;
}

// Keyword sentiment detection - returns 'positive', 'negative', or 'neutral'
const POSITIVE_KEYWORDS = ['好吃', '超好吃', '很好吃', '服务好', '服务热情', '环境好', '环境不错', '干净', '新鲜', '分量足', '实惠', '会再来', '推荐朋友', '肉质好', '火候刚好', '味道好', '蘸料好', '烤肉香', '小菜好吃'];
const NEGATIVE_KEYWORDS = ['偏咸', '太咸', '太油', '上菜慢', '服务差', '服务一般', '态度不好', '不新鲜', '退菜', '空调冷', '等位久', '一般般', '还行'];

function getKeywordSentiment(keyword: string): 'positive' | 'negative' | 'neutral' {
  if (POSITIVE_KEYWORDS.some(pk => keyword.includes(pk))) return 'positive';
  if (NEGATIVE_KEYWORDS.some(nk => keyword.includes(nk))) return 'negative';
  return 'neutral';
}

function getKeywordStyle(keyword: string): string {
  const sentiment = getKeywordSentiment(keyword);
  if (sentiment === 'positive') return 'bg-green-50 text-green-600';
  if (sentiment === 'negative') return 'bg-red-50 text-red-600';
  return 'bg-gray-100 text-gray-600';
}

export default function AdminDashboardPage() {
  const router = useRouter();

  // Fetch restaurants overview data
  const { data, isLoading, error } = useSWR<OverviewResponse>(
    '/api/dashboard/restaurants-overview'
  );

  const summary = data?.summary;
  const restaurants = data?.restaurants || [];
  const recentKeywords = data?.recent_keywords || [];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">经营看板</h1>
        <UserMenu />
      </header>

      <main className="p-4 space-y-4">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <div className="text-xs text-gray-500 mb-1">今日桌访</div>
            <div className="text-2xl font-bold text-gray-900">
              {isLoading ? '--' : summary?.total_visits || 0}
            </div>
            <div className="text-xs text-gray-400 mt-1">
              {summary?.restaurant_count || 0} 家门店
            </div>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <div className="text-xs text-gray-500 mb-1">整体情绪</div>
            <div className={`text-2xl font-bold ${getSentimentDisplay(summary?.avg_sentiment ?? null).color}`}>
              {isLoading ? '--' : formatSentiment(summary?.avg_sentiment ?? null)}
              {summary?.avg_sentiment !== null && <span className="text-sm font-normal">分</span>}
            </div>
            <div className="text-xs text-gray-400 mt-1">
              {getSentimentDisplay(summary?.avg_sentiment ?? null).label}
            </div>
          </div>
        </div>

        {/* Recent Keywords */}
        {recentKeywords.length > 0 && (
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <div className="text-xs text-gray-500 mb-2">今日关键词</div>
            <div className="flex flex-wrap gap-2">
              {recentKeywords.map((kw, idx) => (
                <span
                  key={idx}
                  className={`px-2.5 py-1 rounded-full text-xs ${getKeywordStyle(kw)}`}
                >
                  {kw}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Restaurant List */}
        <div className="space-y-3">
          <div className="text-sm font-medium text-gray-700 px-1">门店情况</div>

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

          {!isLoading && !error && restaurants.length === 0 && (
            <div className="bg-white rounded-2xl p-8 shadow-sm text-center">
              <div className="text-gray-400 mb-2">
                <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <div className="text-gray-500 text-sm">暂无门店数据</div>
            </div>
          )}

          {restaurants.map((rest) => {
            const sentiment = getSentimentDisplay(rest.avg_sentiment);
            return (
              <div
                key={rest.id}
                className="bg-white rounded-2xl p-4 shadow-sm active:bg-gray-50 cursor-pointer transition-colors"
                onClick={() => router.push(`/admin/restaurant-detail?id=${rest.id}`)}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="font-medium text-gray-900">{rest.name}</div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      今日 {rest.visit_count} 次桌访
                      {rest.open_count > 0 && ` · 覆盖率 ${rest.coverage}%`}
                    </div>
                  </div>
                  <div className={`px-3 py-1.5 rounded-xl ${sentiment.bg}`}>
                    <div className={`text-lg font-bold ${sentiment.color} text-center`}>
                      {formatSentiment(rest.avg_sentiment)}
                    </div>
                    <div className={`text-xs ${sentiment.color} text-center`}>
                      {sentiment.label}
                    </div>
                  </div>
                </div>

                {/* Keywords for this restaurant */}
                {rest.keywords.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {rest.keywords.map((kw, idx) => (
                      <span
                        key={idx}
                        className={`px-2 py-0.5 rounded text-xs ${getKeywordStyle(kw)}`}
                      >
                        {kw}
                      </span>
                    ))}
                  </div>
                )}

                {rest.keywords.length === 0 && rest.visit_count === 0 && (
                  <div className="text-xs text-gray-400">今日暂无桌访记录</div>
                )}
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}