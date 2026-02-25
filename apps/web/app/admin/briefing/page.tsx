// Admin Overview Page - Merged briefing + dashboard
// v2.0 - Combined: problem cards + metrics row + keywords + store grid

'use client';

import { useRef, useState, useCallback, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { useAuth } from '@/contexts/AuthContext';
import { UserMenu } from '@/components/layout/UserMenu';

// --- Types ---
interface BriefingEvidence {
  text: string;
  tableId: string;
  audioUrl: string | null;
  managerQuestions?: string[];
  customerAnswers?: string[];
}

interface BriefingProblem {
  severity: 'red' | 'yellow';
  category: string;
  restaurantId: string;
  restaurantName: string;
  title: string;
  evidence: BriefingEvidence[];
  metric?: string;
}

interface BriefingResponse {
  date: string;
  greeting: string;
  problems: BriefingProblem[];
  healthy_count: number;
  restaurant_count: number;
  avg_sentiment: number | null;
  avg_coverage: number;
}

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

// Category icon map
const CATEGORY_ICONS: Record<string, string> = {
  dish_quality: '🍳',
  service_speed: '⏱️',
  staff_attitude: '😐',
  environment: '🏠',
  coverage: '📉',
  sentiment: '😟',
  no_visits: '⚠️',
  action_overdue: '📋',
};

// Keyword sentiment
const POSITIVE_KEYWORDS = ['好吃', '超好吃', '很好吃', '服务好', '服务热情', '环境好', '环境不错', '干净', '新鲜', '分量足', '实惠', '会再来', '推荐朋友', '肉质好', '火候刚好', '味道好', '蘸料好', '烤肉香', '小菜好吃'];
const NEGATIVE_KEYWORDS = ['偏咸', '太咸', '太油', '上菜慢', '服务差', '服务一般', '态度不好', '不新鲜', '退菜', '空调冷', '等位久', '一般般', '还行'];

function getKeywordStyle(keyword: string): string {
  if (POSITIVE_KEYWORDS.some(pk => keyword.includes(pk))) return 'bg-green-50 text-green-600';
  if (NEGATIVE_KEYWORDS.some(nk => keyword.includes(nk))) return 'bg-red-50 text-red-600';
  return 'bg-gray-100 text-gray-600';
}

function getSentimentDisplay(score: number | null): { color: string; bg: string; label: string } {
  if (score === null) return { color: 'text-gray-400', bg: 'bg-gray-100', label: '暂无' };
  if (score >= 0.7) return { color: 'text-green-600', bg: 'bg-green-100', label: '优秀' };
  if (score >= 0.5) return { color: 'text-yellow-600', bg: 'bg-yellow-100', label: '一般' };
  return { color: 'text-red-600', bg: 'bg-red-100', label: '需关注' };
}

function formatSentiment(score: number | null): string {
  if (score === null) return '--';
  return `${Math.round(score * 100)}`;
}

export default function AdminBriefingPage() {
  const { user } = useAuth();
  const router = useRouter();

  // Audio playback
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingKey, setPlayingKey] = useState<string | null>(null);

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setPlayingKey(null);
  }, []);

  const handleAudioToggle = useCallback(
    (key: string, audioUrl: string) => {
      if (playingKey === key) {
        stopAudio();
        return;
      }
      stopAudio();
      const audio = new Audio(audioUrl);
      audio.onended = () => { setPlayingKey(null); audioRef.current = null; };
      audio.onerror = () => { setPlayingKey(null); audioRef.current = null; };
      audio.play();
      audioRef.current = audio;
      setPlayingKey(key);
    },
    [playingKey, stopAudio],
  );

  // Compute yesterday's date (briefing shows prior-day operations)
  const yesterday = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();

  // Fetch briefing data (yesterday's date — morning review of prior day)
  const { data, isLoading } = useSWR<BriefingResponse>(`/api/dashboard/briefing?date=${yesterday}`);
  // Fetch overview data (keywords + store grid)
  const { data: overviewData } = useSWR<OverviewResponse>('/api/dashboard/restaurants-overview');

  const userName = user?.employeeName || user?.username || '您';
  const greeting = data?.greeting || '您好';
  const problems = data?.problems || [];
  const healthyCount = data?.healthy_count ?? 0;
  const restaurantCount = data?.restaurant_count ?? 0;
  const avgSentiment = data?.avg_sentiment;
  const avgCoverage = data?.avg_coverage ?? 0;

  const summary = overviewData?.summary;
  const restaurants = overviewData?.restaurants || [];
  const recentKeywords = overviewData?.recent_keywords || [];

  // Format today's date
  const today = new Date();
  const dateStr = `${today.getMonth() + 1}/${today.getDate()} 周${'日一二三四五六'[today.getDay()]}`;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">总览</h1>
        <UserMenu />
      </header>

      <div className="px-4 py-4 space-y-4">
        {/* Greeting banner */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              {greeting}，{userName.slice(0, 3)}
            </h2>
            {!isLoading && problems.length > 0 && (
              <p className="text-sm text-gray-500 mt-0.5">
                昨日 {restaurantCount} 家门店，{problems.length} 件事需要关注
              </p>
            )}
            {!isLoading && problems.length === 0 && restaurantCount > 0 && (
              <p className="text-sm text-gray-500 mt-0.5">
                昨日 {restaurantCount} 家门店均运营良好
              </p>
            )}
          </div>
          <span className="text-sm text-gray-400">{dateStr}</span>
        </div>

        {/* Compact metrics row */}
        {!isLoading && (
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-xl p-3 text-center">
              <div className="text-xs text-gray-500 mb-0.5">桌访</div>
              <div className="text-xl font-bold text-gray-900">
                {summary?.total_visits ?? 0}
              </div>
              <div className="text-xs text-gray-400">
                {restaurantCount} 家门店
              </div>
            </div>
            <div className="bg-white rounded-xl p-3 text-center">
              <div className="text-xs text-gray-500 mb-0.5">情绪</div>
              <div className={`text-xl font-bold ${getSentimentDisplay(avgSentiment ?? null).color}`}>
                {avgSentiment != null ? `${Math.round(avgSentiment * 100)}分` : '--'}
              </div>
              <div className="text-xs text-gray-400">
                {getSentimentDisplay(avgSentiment ?? null).label}
              </div>
            </div>
            <div className="bg-white rounded-xl p-3 text-center">
              <div className="text-xs text-gray-500 mb-0.5">覆盖率</div>
              <div className="text-xl font-bold text-gray-900">
                {avgCoverage > 0 ? `${avgCoverage}%` : '--'}
              </div>
              <div className="text-xs text-gray-400">&nbsp;</div>
            </div>
          </div>
        )}

        {/* Loading state */}
        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white rounded-xl p-4 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-2/3 mb-3" />
                <div className="h-3 bg-gray-100 rounded w-full mb-2" />
                <div className="h-3 bg-gray-100 rounded w-4/5" />
              </div>
            ))}
          </div>
        )}

        {/* Problem cards */}
        {!isLoading && problems.length > 0 && (
          <div className="space-y-3">
            {problems.map((problem, idx) => (
              <ProblemCard
                key={`${problem.restaurantId}-${problem.category}-${idx}`}
                problem={problem}
                playingKey={playingKey}
                onAudioToggle={handleAudioToggle}
                onNavigate={(restId) => router.push(`/admin/restaurant-detail?id=${restId}`)}
              />
            ))}
          </div>
        )}

        {/* Empty state - all healthy */}
        {!isLoading && problems.length === 0 && restaurantCount > 0 && (
          <div className="bg-white rounded-xl p-6 text-center">
            <div className="text-4xl mb-3">✅</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">一切正常</h3>
            <p className="text-sm text-gray-500">
              昨日 {restaurantCount} 家门店均运营良好
            </p>
            {avgSentiment != null && (
              <p className="text-sm text-gray-400 mt-1">
                平均情绪 {avgSentiment.toFixed(2)} · 平均覆盖率 {avgCoverage}%
              </p>
            )}
          </div>
        )}

        {/* Healthy restaurants summary */}
        {!isLoading && problems.length > 0 && healthyCount > 0 && (
          <div className="bg-white rounded-xl p-4">
            <div className="flex items-center gap-2 text-green-600 mb-1">
              <span>✅</span>
              <span className="font-medium">其余 {healthyCount} 家门店运营正常</span>
            </div>
            {avgSentiment != null && (
              <p className="text-sm text-gray-400 ml-6">
                平均情绪 {avgSentiment.toFixed(2)} · 平均覆盖率 {avgCoverage}%
              </p>
            )}
          </div>
        )}

        {/* Today's keywords (from dashboard) */}
        {recentKeywords.length > 0 && (
          <div className="bg-white rounded-xl p-4">
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

        {/* Store grid (from dashboard) */}
        {restaurants.length > 0 && (
          <div>
            <div className="text-sm font-medium text-gray-700 px-1 mb-3">门店概况</div>
            <div className="grid grid-cols-2 gap-3">
              {restaurants.map((rest) => {
                const sentiment = getSentimentDisplay(rest.avg_sentiment);
                return (
                  <div
                    key={rest.id}
                    className="bg-white rounded-xl p-3 active:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => router.push(`/admin/restaurant-detail?id=${rest.id}`)}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">{rest.name}</div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          {rest.visit_count} 次桌访
                          {rest.open_count > 0 && ` · ${rest.coverage}%`}
                        </div>
                      </div>
                      <div className={`px-2 py-1 rounded-lg ${sentiment.bg} ml-1 flex-shrink-0`}>
                        <div className={`text-sm font-bold ${sentiment.color} text-center`}>
                          {formatSentiment(rest.avg_sentiment)}
                        </div>
                        <div className={`text-[10px] ${sentiment.color} text-center`}>
                          {sentiment.label}
                        </div>
                      </div>
                    </div>

                    {rest.keywords.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {rest.keywords.slice(0, 4).map((kw, idx) => (
                          <span
                            key={idx}
                            className={`px-1.5 py-0.5 rounded text-[10px] ${getKeywordStyle(kw)}`}
                          >
                            {kw}
                          </span>
                        ))}
                      </div>
                    )}

                    {rest.keywords.length === 0 && rest.visit_count === 0 && (
                      <div className="text-xs text-gray-400">暂无桌访</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Bottom spacing for nav */}
        <div className="h-4" />
      </div>
    </div>
  );
}

// --- Inline Q&A conversation renderer ---
function QAConversation({ questions, answers }: { questions: string[]; answers: string[] }) {
  const maxLen = Math.max(questions.length, answers.length);
  if (maxLen === 0) return null;
  return (
    <div className="space-y-1.5">
      {Array.from({ length: maxLen }).map((_, j) => (
        <Fragment key={j}>
          {questions[j] && (
            <div className="flex gap-2">
              <span className="text-[10px] text-gray-400 mt-0.5 flex-shrink-0 w-7 text-right">店长</span>
              <p className="text-xs text-gray-500 flex-1">{questions[j]}</p>
            </div>
          )}
          {answers[j] && (
            <div className="flex gap-2">
              <span className="text-[10px] text-primary-500 mt-0.5 flex-shrink-0 w-7 text-right">顾客</span>
              <p className="text-xs text-gray-800 flex-1">{answers[j]}</p>
            </div>
          )}
        </Fragment>
      ))}
    </div>
  );
}

// --- Problem Card Component ---
function ProblemCard({
  problem,
  playingKey,
  onAudioToggle,
  onNavigate,
}: {
  problem: BriefingProblem;
  playingKey: string | null;
  onAudioToggle: (key: string, url: string) => void;
  onNavigate: (restaurantId: string) => void;
}) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const severityColor = problem.severity === 'red' ? 'bg-red-500' : 'bg-amber-400';

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full ${severityColor} flex-shrink-0`} />
            <span className="text-xs text-gray-400">{problem.restaurantName}</span>
          </div>
          <button
            onClick={() => onNavigate(problem.restaurantId)}
            className="text-xs text-gray-400 hover:text-primary-600 transition-colors"
          >
            详情 &rsaquo;
          </button>
        </div>
        <h3 className="text-[15px] font-semibold text-gray-900 leading-snug">
          {problem.title}
        </h3>
        {problem.metric && (
          <p className="text-xs text-gray-400 mt-0.5">{problem.metric}</p>
        )}
      </div>

      {/* Evidence list */}
      {problem.evidence.length > 0 && (
        <div className="px-2 pb-2">
          {problem.evidence.map((ev, i) => {
            const isExpanded = expandedIdx === i;
            const hasQA = (ev.managerQuestions?.length ?? 0) > 0 || (ev.customerAnswers?.length ?? 0) > 0;
            const audioKey = `${problem.restaurantId}-${problem.category}-${i}`;
            return (
              <div
                key={i}
                className={`mx-0 rounded-xl transition-colors ${isExpanded ? 'bg-gray-50' : ''}`}
              >
                {/* Evidence row — tappable */}
                <div
                  className={`flex items-center gap-2.5 px-3 py-2.5 ${hasQA ? 'cursor-pointer active:bg-gray-50' : ''}`}
                  onClick={() => hasQA && setExpandedIdx(isExpanded ? null : i)}
                >
                  {/* Quote */}
                  <p className="text-sm text-gray-700 flex-1 leading-relaxed">
                    &ldquo;{ev.text}&rdquo;
                  </p>
                  {/* Right side controls */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                      {ev.tableId}
                    </span>
                    {ev.audioUrl && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onAudioToggle(audioKey, ev.audioUrl!); }}
                        className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
                          playingKey === audioKey
                            ? 'bg-primary-100 text-primary-600'
                            : 'bg-gray-100 text-gray-600 hover:text-primary-600 hover:bg-primary-50'
                        }`}
                      >
                        {playingKey === audioKey ? (
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
                        ) : (
                          <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                        )}
                      </button>
                    )}
                    {hasQA && (
                      <svg
                        className={`w-4 h-4 text-gray-300 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    )}
                  </div>
                </div>

                {/* Expanded Q&A */}
                {isExpanded && (
                  <div className="px-3 pb-3 pt-0">
                    <div className="border-l-2 border-primary-200 pl-3 py-1.5">
                      <QAConversation
                        questions={ev.managerQuestions || []}
                        answers={ev.customerAnswers || []}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
