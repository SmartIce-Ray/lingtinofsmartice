// Admin Dashboard Page - Business metrics and analytics for boss role
// v1.0 - Initial version, reuses manager dashboard with admin-specific navigation

'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { useAuth } from '@/contexts/AuthContext';
import { UserMenu } from '@/components/layout/UserMenu';

// Types for API responses
interface CoveragePeriod {
  period: string;
  open_count: number;
  visit_count: number;
  coverage: number;
  status: 'good' | 'warning' | 'critical';
}

// Conversation context for feedback popover
interface FeedbackContext {
  text: string;
  visitId: string;
  tableId: string;
  managerQuestions: string[];
  customerAnswers: string[];
  transcript: string;
}

interface SentimentFeedback {
  text: string;
  count: number;
  contexts?: FeedbackContext[];
}

interface SentimentSummary {
  positive_count: number;
  neutral_count: number;
  negative_count: number;
  positive_percent: number;
  neutral_percent: number;
  negative_percent: number;
  total_visits: number;
  positive_feedbacks: SentimentFeedback[];
  negative_feedbacks: SentimentFeedback[];
}

interface ManagerQuestion {
  text: string;
  table: string;
  time: string;
}

// Calculate date based on selection (using local timezone)
function getDateForSelection(selection: string): string {
  const date = new Date();
  if (selection === '昨日') {
    date.setDate(date.getDate() - 1);
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Response types for SWR
interface CoverageResponse {
  periods: CoveragePeriod[];
}

interface HighlightsResponse {
  questions: ManagerQuestion[];
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState('今日');
  const [selectedFeedback, setSelectedFeedback] = useState<{
    feedback: SentimentFeedback;
    type: 'positive' | 'negative';
    rect: DOMRect;
  } | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const { user } = useAuth();
  const restaurantId = user?.restaurantId;

  const date = getDateForSelection(selectedDate);
  const params = restaurantId
    ? new URLSearchParams({ restaurant_id: restaurantId, date }).toString()
    : null;

  const { data: coverageData, isLoading: coverageLoading } = useSWR<CoverageResponse>(
    params ? `/api/dashboard/coverage?${params}` : null
  );
  const { data: sentimentData, isLoading: sentimentLoading } = useSWR<SentimentSummary>(
    params ? `/api/dashboard/sentiment-summary?${params}` : null
  );
  const { data: highlightsData, isLoading: highlightsLoading } = useSWR<HighlightsResponse>(
    params ? `/api/dashboard/speech-highlights?${params}` : null
  );

  const coverage = coverageData ?? { periods: [] };
  const sentiment = sentimentData ?? null;
  const managerQuestions = highlightsData?.questions ?? [];
  const loading = coverageLoading || sentimentLoading || highlightsLoading;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setSelectedFeedback(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">数据看板</h1>
        <div className="flex items-center gap-3">
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            {['今日', '昨日'].map((option) => (
              <button
                key={option}
                onClick={() => setSelectedDate(option)}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  selectedDate === option
                    ? 'bg-white text-gray-900 shadow-sm font-medium'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {option}
              </button>
            ))}
          </div>
          <UserMenu />
        </div>
      </header>

      <main className="p-4 space-y-4">
        {loading && (
          <div className="text-center py-8 text-gray-500">加载中...</div>
        )}

        {/* Coverage Table */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <h2 className="text-sm font-medium text-gray-700 mb-3">执行覆盖率</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 border-b border-gray-100">
                  <th className="text-left py-2 font-medium">时段</th>
                  <th className="text-center py-2 font-medium">开台</th>
                  <th className="text-center py-2 font-medium">桌访</th>
                  <th className="text-center py-2 font-medium">覆盖率</th>
                  <th className="text-right py-2 font-medium">状态</th>
                </tr>
              </thead>
              <tbody>
                {coverage.periods.length === 0 && !loading && (
                  <tr>
                    <td colSpan={5} className="text-center py-4 text-gray-400">
                      暂无数据
                    </td>
                  </tr>
                )}
                {coverage.periods.map((row) => (
                  <tr key={row.period} className="border-b border-gray-50">
                    <td className="py-3 font-medium">
                      {row.period === 'lunch' ? '午市' : '晚市'}
                    </td>
                    <td className="text-center text-gray-600">{row.open_count}</td>
                    <td className="text-center text-gray-600">{row.visit_count}</td>
                    <td className="text-center">
                      <span
                        className={`font-medium ${
                          row.status === 'good'
                            ? 'text-green-600'
                            : row.status === 'warning'
                              ? 'text-yellow-600'
                              : 'text-red-600'
                        }`}
                      >
                        {row.coverage}%
                      </span>
                    </td>
                    <td className="text-right">
                      {row.status === 'good' ? (
                        <span className="text-green-600">✓ 正常</span>
                      ) : row.open_count > row.visit_count ? (
                        <span className="text-yellow-600">
                          ⚠ -{row.open_count - row.visit_count}桌
                        </span>
                      ) : (
                        <span className="text-green-600">✓ 正常</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Sentiment Summary */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <h2 className="text-sm font-medium text-gray-700 mb-3">情绪概览</h2>
          {sentiment ? (
            <>
              <div className="flex items-center justify-around py-4">
                <div className="text-center">
                  <div className="text-3xl font-bold text-green-600">
                    {sentiment.positive_percent}%
                  </div>
                  <div className="text-xs text-gray-500 mt-1">正面情绪</div>
                </div>
                <div className="h-12 w-px bg-gray-200" />
                <div className="text-center">
                  <div className="text-3xl font-bold text-gray-600">
                    {sentiment.neutral_percent}%
                  </div>
                  <div className="text-xs text-gray-500 mt-1">中性情绪</div>
                </div>
                <div className="h-12 w-px bg-gray-200" />
                <div className="text-center">
                  <div className="text-3xl font-bold text-red-500">
                    {sentiment.negative_percent}%
                  </div>
                  <div className="text-xs text-gray-500 mt-1">负面情绪</div>
                </div>
              </div>

              {(sentiment.positive_feedbacks?.length > 0 ||
                sentiment.negative_feedbacks?.length > 0) && (
                <div className="border-t border-gray-100 pt-3 mt-2">
                  {sentiment.positive_feedbacks?.length > 0 && (
                    <div className="mb-3">
                      <div className="text-xs text-gray-500 mb-2">正面评价</div>
                      <div className="flex flex-wrap gap-1.5">
                        {sentiment.positive_feedbacks.map((fb: SentimentFeedback, i: number) => (
                          <button
                            key={i}
                            onClick={(e) => {
                              const rect = e.currentTarget.getBoundingClientRect();
                              setSelectedFeedback({ feedback: fb, type: 'positive', rect });
                            }}
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-green-50 text-green-700 hover:bg-green-100 hover:ring-2 hover:ring-green-300 transition-all cursor-pointer"
                            style={{
                              fontSize: `${Math.min(12 + fb.count * 2, 16)}px`,
                              opacity: Math.max(0.6, 1 - i * 0.1),
                            }}
                          >
                            {fb.text}
                            {fb.count > 1 && (
                              <span className="ml-1 text-green-500">×{fb.count}</span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {sentiment.negative_feedbacks?.length > 0 && (
                    <div>
                      <div className="text-xs text-gray-500 mb-2">负面评价</div>
                      <div className="flex flex-wrap gap-1.5">
                        {sentiment.negative_feedbacks.map((fb: SentimentFeedback, i: number) => (
                          <button
                            key={i}
                            onClick={(e) => {
                              const rect = e.currentTarget.getBoundingClientRect();
                              setSelectedFeedback({ feedback: fb, type: 'negative', rect });
                            }}
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-red-50 text-red-600 hover:bg-red-100 hover:ring-2 hover:ring-red-300 transition-all cursor-pointer"
                            style={{
                              fontSize: `${Math.min(12 + fb.count * 2, 16)}px`,
                              opacity: Math.max(0.6, 1 - i * 0.1),
                            }}
                          >
                            {fb.text}
                            {fb.count > 1 && (
                              <span className="ml-1 text-red-400">×{fb.count}</span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : !loading ? (
            <div className="text-center py-4 text-gray-400">暂无数据</div>
          ) : null}
        </div>

        {/* Manager Questions - 话术使用 */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-gray-700">话术使用</h2>
            <button
              onClick={() => {
                const question = '请你获取我们最近的桌台访问的话术并且以专业餐饮经营者的角度，告诉我该如何优化这些话术，以获得更好的效果';
                router.push(`/admin/chat?q=${encodeURIComponent(question)}`);
              }}
              className="group relative inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full overflow-hidden transition-all duration-300 hover:scale-105 active:scale-95"
            >
              <span className="absolute inset-0 animate-shimmer bg-[linear-gradient(110deg,#8b5cf6,45%,#c084fc,55%,#8b5cf6)] bg-[length:200%_100%]" />
              <span className="relative flex items-center gap-1.5 text-white">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707" strokeLinecap="round" />
                  <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
                </svg>
                <span>AI 优化</span>
              </span>
            </button>
          </div>
          <div className="space-y-2">
            {managerQuestions.length === 0 && !loading && (
              <div className="text-center py-4 text-gray-400 text-sm">暂无数据</div>
            )}
            {managerQuestions.map((q: ManagerQuestion, i: number) => (
              <div
                key={i}
                className="bg-blue-50 rounded-lg p-3 text-sm"
              >
                <div className="text-blue-800">&quot;{q.text}&quot;</div>
                <div className="text-blue-500 text-xs mt-1">
                  {q.table}桌 · {q.time}
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Feedback Conversation Popover */}
      {selectedFeedback && (() => {
        const popoverWidth = 320;
        const padding = 16;
        const viewportWidth = window.innerWidth;

        const bubbleCenter = selectedFeedback.rect.left + selectedFeedback.rect.width / 2;
        let left = bubbleCenter - popoverWidth / 2;

        if (left < padding) {
          left = padding;
        }
        if (left + popoverWidth > viewportWidth - padding) {
          left = viewportWidth - popoverWidth - padding;
        }

        return (
          <div
            ref={popoverRef}
            className="fixed z-50 bg-white rounded-xl shadow-2xl border border-gray-200 p-4 w-80 animate-in fade-in zoom-in-95 duration-200"
            style={{
              top: Math.min(selectedFeedback.rect.bottom + 8, window.innerHeight - 300),
              left,
            }}
          >
          <button
            onClick={() => setSelectedFeedback(null)}
            className="absolute top-2 right-2 text-gray-400 hover:text-gray-600"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <div className={`inline-block px-2 py-1 rounded-full text-sm font-medium mb-3 ${
            selectedFeedback.type === 'positive'
              ? 'bg-green-100 text-green-800'
              : 'bg-red-100 text-red-700'
          }`}>
            {selectedFeedback.feedback.text}
          </div>

          {selectedFeedback.feedback.contexts && selectedFeedback.feedback.contexts.length > 0 ? (
            <div className="space-y-3 max-h-60 overflow-y-auto">
              {selectedFeedback.feedback.contexts.map((ctx, idx) => (
                <div key={idx} className="border-l-2 border-gray-200 pl-3">
                  <div className="text-xs text-gray-400 mb-1">{ctx.tableId}桌</div>

                  {ctx.managerQuestions.length > 0 && (
                    <div className="mb-2">
                      <div className="text-xs text-blue-500 mb-0.5">店长:</div>
                      <div className="text-sm text-gray-700 bg-blue-50 rounded-lg px-2 py-1">
                        {ctx.managerQuestions.join(' ')}
                      </div>
                    </div>
                  )}

                  {ctx.customerAnswers.length > 0 && (
                    <div>
                      <div className="text-xs text-gray-500 mb-0.5">顾客:</div>
                      <div className="text-sm text-gray-800 bg-gray-50 rounded-lg px-2 py-1">
                        {ctx.customerAnswers.map((answer, ansIdx) => {
                          const keyword = selectedFeedback.feedback.text;
                          const parts = answer.split(new RegExp(`(${keyword})`, 'gi'));
                          return (
                            <span key={ansIdx}>
                              {parts.map((part, partIdx) =>
                                part.toLowerCase() === keyword.toLowerCase() ? (
                                  <mark
                                    key={partIdx}
                                    className={`px-0.5 rounded ${
                                      selectedFeedback.type === 'positive'
                                        ? 'bg-green-200'
                                        : 'bg-red-200'
                                    }`}
                                  >
                                    {part}
                                  </mark>
                                ) : (
                                  <span key={partIdx}>{part}</span>
                                )
                              )}
                              {ansIdx < ctx.customerAnswers.length - 1 && ' '}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-gray-400 text-center py-2">
              暂无对话详情
            </div>
          )}
        </div>
        );
      })()}
    </div>
  );
}
