// Dashboard Page - Business metrics and analytics
// v3.0 - Product-driven redesign: multi-dimension feedback, speech quality split,
//         emotion trend arrows, problem-first layout

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { useAuth } from '@/contexts/AuthContext';
import { UserMenu } from '@/components/layout/UserMenu';
import { ActionItemsCard } from '@/components/dashboard/ActionItemsCard';
import { getDateForSelection } from '@/lib/date-utils';

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
  audioUrl?: string | null;
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

interface DishRanking {
  dish_name: string;
  mention_count: number;
  positive: number;
  negative: number;
  neutral: number;
}

interface DishRankingResponse {
  dishes: DishRanking[];
}

// Response types for SWR
interface CoverageResponse {
  periods: CoveragePeriod[];
}

interface HighlightsResponse {
  questions: ManagerQuestion[];
}

// Detect feedback category icon from text
function detectCategoryIcon(text: string): string {
  const lower = text.toLowerCase();
  if (/慢|等了|催|久|速度|出菜/.test(lower)) return '⏱️';
  if (/态度|不耐烦|冷淡|不理|脸色/.test(lower)) return '😐';
  if (/环境|吵|脏|热|冷|味道大|苍蝇/.test(lower)) return '🏠';
  if (/服务/.test(lower)) return '😊';
  return '🍳';
}

// Classify speech questions as good or needs-improvement
function classifySpeech(text: string): 'good' | 'improve' {
  // Too vague or open-ended → needs improvement
  if (/^(还满意吗|满意吗|还好吗|还行吗|有什么建议|有什么意见|可以吗)\?*[？]?$/.test(text.trim())) return 'improve';
  if (text.length < 6) return 'improve';
  // Specific and targeted → good
  if (/怎么样|觉得|口味|速度|推荐|招牌|特色|第几次/.test(text)) return 'good';
  return 'good'; // default to good if not clearly vague
}

// Speech quality reasons
function getSpeechReason(text: string, quality: 'good' | 'improve'): string {
  if (quality === 'improve') {
    if (/满意/.test(text)) return '太笼统，顾客只会说"还行"';
    if (/建议|意见/.test(text)) return '开放式，顾客不知从何答起';
    return '话术过短，难以引导深度反馈';
  }
  if (/怎么样/.test(text)) return '精准定位问题，引出真实反馈';
  if (/推荐|招牌|特色/.test(text)) return '顾客积极回应，获得有效反馈';
  if (/速度|上菜/.test(text)) return '定向服务问题，获得直接回答';
  if (/第几次/.test(text)) return '建立关系，了解客户忠诚度';
  return '针对性提问，获得有效反馈';
}

// Speech quality split component
function SpeechQualitySplit({ questions }: { questions: ManagerQuestion[] }) {
  const good = questions.filter(q => classifySpeech(q.text) === 'good');
  const improve = questions.filter(q => classifySpeech(q.text) === 'improve');

  return (
    <div className="space-y-4">
      {good.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-sm">💡</span>
            <span className="text-xs font-semibold text-gray-600">优秀示范</span>
          </div>
          <div className="space-y-2">
            {good.slice(0, 3).map((q, i) => (
              <div key={i} className="bg-green-50/60 rounded-lg p-3">
                <div className="text-sm text-green-800 font-medium">&ldquo;{q.text}&rdquo;</div>
                <div className="text-xs text-green-600 mt-1">→ {getSpeechReason(q.text, 'good')}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {improve.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-sm">⚠️</span>
            <span className="text-xs font-semibold text-gray-600">可以更好</span>
          </div>
          <div className="space-y-2">
            {improve.slice(0, 3).map((q, i) => (
              <div key={i} className="bg-amber-50/60 rounded-lg p-3">
                <div className="text-sm text-amber-800 font-medium">&ldquo;{q.text}&rdquo;</div>
                <div className="text-xs text-amber-600 mt-1">→ {getSpeechReason(q.text, 'improve')}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState('今日');
  // State for feedback popover
  const [selectedFeedback, setSelectedFeedback] = useState<{
    feedback: SentimentFeedback;
    type: 'positive' | 'negative';
    rect: DOMRect;
  } | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  // Audio playback state for feedback popover
  const [playingVisitId, setPlayingVisitId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setPlayingVisitId(null);
  }, []);

  const handleAudioToggle = useCallback((visitId: string, audioUrl: string) => {
    // If same audio is playing, pause it
    if (playingVisitId === visitId) {
      stopAudio();
      return;
    }
    // Stop any currently playing audio
    stopAudio();
    // Play new audio
    const audio = new Audio(audioUrl);
    audio.onended = () => {
      setPlayingVisitId(null);
      audioRef.current = null;
    };
    audio.onerror = () => {
      setPlayingVisitId(null);
      audioRef.current = null;
    };
    audio.play();
    audioRef.current = audio;
    setPlayingVisitId(visitId);
  }, [playingVisitId, stopAudio]);

  // Get user's restaurant ID from auth context
  const { user } = useAuth();
  const restaurantId = user?.restaurantId;

  // Build query params for API calls
  const date = getDateForSelection(selectedDate);
  const params = restaurantId
    ? new URLSearchParams({ restaurant_id: restaurantId, date }).toString()
    : null;

  // Build yesterday's params for trend comparison
  const yesterdayDate = (() => {
    const d = new Date(date);
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  })();
  const yesterdayParams = restaurantId
    ? new URLSearchParams({ restaurant_id: restaurantId, date: yesterdayDate }).toString()
    : null;

  // SWR hooks for data fetching with stale-while-revalidate
  const { data: coverageData, isLoading: coverageLoading } = useSWR<CoverageResponse>(
    params ? `/api/dashboard/coverage?${params}` : null
  );
  const { data: sentimentData, isLoading: sentimentLoading } = useSWR<SentimentSummary>(
    params ? `/api/dashboard/sentiment-summary?${params}` : null
  );
  const { data: yesterdaySentiment } = useSWR<SentimentSummary>(
    yesterdayParams ? `/api/dashboard/sentiment-summary?${yesterdayParams}` : null
  );
  const { data: highlightsData, isLoading: highlightsLoading } = useSWR<HighlightsResponse>(
    params ? `/api/dashboard/speech-highlights?${params}` : null
  );
  const { data: dishData, isLoading: dishLoading } = useSWR<DishRankingResponse>(
    params ? `/api/dashboard/dish-ranking?${params}` : null
  );

  // Derived data with defaults
  const coverage = coverageData ?? { periods: [] };
  const sentiment = sentimentData ?? null;
  const managerQuestions = highlightsData?.questions ?? [];
  const dishes = dishData?.dishes ?? [];
  const loading = coverageLoading || sentimentLoading || highlightsLoading || dishLoading;

  // Close popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        stopAudio();
        setSelectedFeedback(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [stopAudio]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">数据看板</h1>
        <div className="flex items-center gap-3">
          {/* Date Tabs */}
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
        {/* Loading indicator */}
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

        {/* Sentiment Summary with Trend Arrows */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <h2 className="text-sm font-medium text-gray-700 mb-3">情绪概览</h2>
          {sentiment ? (
            <div className="flex items-center justify-around py-4">
              {[
                { label: '正面😊', pct: sentiment.positive_percent, prevPct: yesterdaySentiment?.positive_percent, color: 'text-green-600', trendUp: 'text-green-500', trendDown: 'text-red-500' },
                { label: '中性😐', pct: sentiment.neutral_percent, prevPct: yesterdaySentiment?.neutral_percent, color: 'text-gray-600', trendUp: 'text-gray-500', trendDown: 'text-gray-500' },
                { label: '负面😟', pct: sentiment.negative_percent, prevPct: yesterdaySentiment?.negative_percent, color: 'text-red-500', trendUp: 'text-red-500', trendDown: 'text-green-500' },
              ].map((item, i) => {
                const diff = item.prevPct != null ? item.pct - item.prevPct : null;
                return (
                  <div key={i} className="text-center flex-1">
                    <div className={`text-3xl font-bold ${item.color}`}>{item.pct}%</div>
                    <div className="text-xs text-gray-500 mt-0.5">{item.label}</div>
                    {diff !== null && diff !== 0 && (
                      <div className={`text-xs mt-0.5 font-medium ${
                        i === 2 ? (diff > 0 ? item.trendUp : item.trendDown) : (diff > 0 ? item.trendUp : item.trendDown)
                      }`}>
                        {diff > 0 ? '↑' : '↓'} {Math.abs(diff)}%
                        <span className="text-gray-400 font-normal ml-0.5">比昨天</span>
                      </div>
                    )}
                    {diff === 0 && (
                      <div className="text-xs mt-0.5 text-gray-400">— 持平</div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : !loading ? (
            <div className="text-center py-4 text-gray-400">暂无数据</div>
          ) : null}
        </div>

        {/* Customer Feedback - Multi-dimension (problems first, then highlights) */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <h2 className="text-sm font-medium text-gray-700 mb-3">顾客反馈</h2>
          {sentiment && (sentiment.negative_feedbacks?.length > 0 || sentiment.positive_feedbacks?.length > 0) ? (
            <>
              {/* Problems section */}
              {sentiment.negative_feedbacks?.length > 0 && (
                <div className="mb-4">
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="text-sm">⚠️</span>
                    <span className="text-xs font-semibold text-gray-600">需要关注</span>
                  </div>
                  <div className="space-y-2">
                    {sentiment.negative_feedbacks.map((fb, i) => {
                      const icon = detectCategoryIcon(fb.text);
                      return (
                        <button
                          key={i}
                          onClick={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setSelectedFeedback({ feedback: fb, type: 'negative', rect });
                          }}
                          className="w-full text-left bg-red-50/60 rounded-lg p-3 hover:bg-red-50 transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-gray-800">
                              {icon} {fb.text}
                            </span>
                            <span className="text-xs font-semibold text-red-500 bg-red-100 px-2 py-0.5 rounded-full">
                              {fb.count >= 3 ? '🔴' : '🟡'} {fb.count}桌
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Positive highlights */}
              {sentiment.positive_feedbacks?.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="text-sm">👍</span>
                    <span className="text-xs font-semibold text-gray-600">好评亮点</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {sentiment.positive_feedbacks.map((fb, i) => {
                      const icon = detectCategoryIcon(fb.text);
                      return (
                        <button
                          key={i}
                          onClick={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setSelectedFeedback({ feedback: fb, type: 'positive', rect });
                          }}
                          className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs bg-green-50 text-green-700 hover:bg-green-100 transition-colors"
                        >
                          {icon} {fb.text} {fb.count > 1 && <span className="ml-1 text-green-500">{fb.count}桌</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* No negative feedbacks but has positive */}
              {(!sentiment.negative_feedbacks || sentiment.negative_feedbacks.length === 0) && (
                <div className="flex items-center gap-2 text-green-600 mb-3 bg-green-50 rounded-lg p-3">
                  <span>✅</span>
                  <span className="text-sm font-medium">今日无需特别关注的问题</span>
                </div>
              )}
            </>
          ) : !loading ? (
            <div className="text-center py-4 text-gray-400">暂无反馈数据</div>
          ) : null}
        </div>

        {/* Manager Questions - 话术使用 (split into good/bad) */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-gray-700">话术使用</h2>
            <button
              onClick={() => {
                const question = '请你获取我们最近的桌台访问的话术并且以专业餐饮经营者的角度，告诉我该如何优化这些话术，以获得更好的效果';
                router.push(`/chat?q=${encodeURIComponent(question)}`);
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
          {managerQuestions.length > 0 ? (
            <SpeechQualitySplit questions={managerQuestions} />
          ) : !loading ? (
            <div className="text-center py-4 text-gray-400 text-sm">暂无数据</div>
          ) : null}
        </div>

        {/* AI Action Items */}
        {restaurantId && (
          <ActionItemsCard restaurantId={restaurantId} date={date} />
        )}
      </main>

      {/* Feedback Conversation Popover */}
      {selectedFeedback && (() => {
        // Shift strategy: keep popover within viewport with 16px padding
        const popoverWidth = 320; // w-80 = 320px
        const padding = 16;
        const viewportWidth = window.innerWidth;

        // Try to center below the bubble, then shift to stay in bounds
        const bubbleCenter = selectedFeedback.rect.left + selectedFeedback.rect.width / 2;
        let left = bubbleCenter - popoverWidth / 2;

        // Shift right if overflowing left edge
        if (left < padding) {
          left = padding;
        }
        // Shift left if overflowing right edge
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
          {/* Close button */}
          <button
            onClick={() => { stopAudio(); setSelectedFeedback(null); }}
            className="absolute top-2 right-2 text-gray-400 hover:text-gray-600"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Header with feedback text highlighted */}
          <div className={`inline-block px-2 py-1 rounded-full text-sm font-medium mb-3 ${
            selectedFeedback.type === 'positive'
              ? 'bg-green-100 text-green-800'
              : 'bg-red-100 text-red-700'
          }`}>
            {selectedFeedback.feedback.text}
          </div>

          {/* Conversation contexts */}
          {selectedFeedback.feedback.contexts && selectedFeedback.feedback.contexts.length > 0 ? (
            <div className="space-y-3 max-h-60 overflow-y-auto">
              {selectedFeedback.feedback.contexts.map((ctx, idx) => (
                <div key={idx} className="border-l-2 border-gray-200 pl-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-400">{ctx.tableId}桌</span>
                    {ctx.audioUrl && (
                      <button
                        onClick={() => handleAudioToggle(ctx.visitId, ctx.audioUrl!)}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-colors ${
                          playingVisitId === ctx.visitId
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                        }`}
                      >
                        {playingVisitId === ctx.visitId ? '⏸ 暂停' : '▶ 原声'}
                      </button>
                    )}
                  </div>

                  {/* Manager question */}
                  {ctx.managerQuestions.length > 0 && (
                    <div className="mb-2">
                      <div className="text-xs text-blue-500 mb-0.5">店长:</div>
                      <div className="text-sm text-gray-700 bg-blue-50 rounded-lg px-2 py-1">
                        {ctx.managerQuestions.join(' ')}
                      </div>
                    </div>
                  )}

                  {/* Customer answer with keyword highlighted */}
                  {ctx.customerAnswers.length > 0 && (
                    <div>
                      <div className="text-xs text-gray-500 mb-0.5">顾客:</div>
                      <div className="text-sm text-gray-800 bg-gray-50 rounded-lg px-2 py-1">
                        {ctx.customerAnswers.map((answer, ansIdx) => {
                          // Highlight the feedback keyword in the answer
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
