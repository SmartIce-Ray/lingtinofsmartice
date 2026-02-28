// Admin Overview Page - Collapsible store list with embedded problems + review data
// v3.0 - Redesign: fold problem cards into per-store collapsible rows, coverage → review completion

'use client';

import { useRef, useState, useCallback, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { useAuth } from '@/contexts/AuthContext';
import { useManagedScope } from '@/hooks/useManagedScope';
import { UserMenu } from '@/components/layout/UserMenu';
import { BenchmarkPanel } from '@/components/admin/BenchmarkPanel';
import { getChinaYesterday, singleDay, dateRangeParams } from '@/lib/date-utils';
import type { DateRange } from '@/lib/date-utils';
import { DatePicker, adminPresets } from '@/components/shared/DatePicker';

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
  avg_review_completion?: number;
}

interface RestaurantOverview {
  id: string;
  name: string;
  visit_count: number;
  open_count: number;
  coverage: number;
  avg_sentiment: number | null;
  keywords: string[];
  review_completion?: number;
  latest_review?: {
    ai_summary: string;
    action_items: string[];
    key_decisions: string[];
  } | null;
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

function getSatisfactionDisplay(score: number | null): { color: string; bg: string; label: string } {
  if (score === null) return { color: 'text-gray-400', bg: 'bg-gray-100', label: '暂无' };
  if (score >= 70) return { color: 'text-green-600', bg: 'bg-green-100', label: '满意' };
  if (score >= 50) return { color: 'text-yellow-600', bg: 'bg-yellow-100', label: '一般' };
  return { color: 'text-red-600', bg: 'bg-red-100', label: '不满意' };
}

export default function AdminBriefingPage() {
  const { user } = useAuth();
  const { isScoped, managedIdsParam, storeCount } = useManagedScope();
  const router = useRouter();

  // Date navigation
  const [dateRange, setDateRange] = useState<DateRange>(() => singleDay(getChinaYesterday()));

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

  // Expanded store IDs
  const [expandedStores, setExpandedStores] = useState<Set<string>>(new Set());
  const toggleStore = (id: string) => {
    setExpandedStores(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        // Stop audio when collapsing a store row
        stopAudio();
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Fetch briefing data (scoped by managed restaurants)
  const { data, isLoading } = useSWR<BriefingResponse>(`/api/dashboard/briefing?${dateRangeParams(dateRange)}${managedIdsParam}`);
  // Fetch overview data (keywords + store grid)
  const { data: overviewData } = useSWR<OverviewResponse>(`/api/dashboard/restaurants-overview?${dateRangeParams(dateRange)}${managedIdsParam}`);

  const userName = user?.employeeName || user?.username || '您';
  const greeting = data?.greeting || '您好';
  const problems = data?.problems || [];
  const restaurantCount = data?.restaurant_count ?? 0;
  const avgSentiment = data?.avg_sentiment;
  const avgReviewCompletion = data?.avg_review_completion ?? 0;

  const summary = overviewData?.summary;
  const restaurants = overviewData?.restaurants || [];

  // Group problems by restaurant
  const problemsByRestaurant = new Map<string, BriefingProblem[]>();
  for (const p of problems) {
    const existing = problemsByRestaurant.get(p.restaurantId) || [];
    existing.push(p);
    problemsByRestaurant.set(p.restaurantId, existing);
  }

  // Build sorted store list: by problem severity + count, then sentiment
  const sortedRestaurants = [...restaurants].sort((a, b) => {
    const aProblems = problemsByRestaurant.get(a.id) || [];
    const bProblems = problemsByRestaurant.get(b.id) || [];
    const aRedCount = aProblems.filter(p => p.severity === 'red').length;
    const bRedCount = bProblems.filter(p => p.severity === 'red').length;
    if (aRedCount !== bRedCount) return bRedCount - aRedCount;
    if (aProblems.length !== bProblems.length) return bProblems.length - aProblems.length;
    return (a.avg_sentiment ?? 100) - (b.avg_sentiment ?? 100);
  });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold text-gray-900">总览</h1>
          {isScoped && (
            <span className="text-xs bg-primary-50 text-primary-600 px-2 py-0.5 rounded-full">
              管理 {storeCount} 家门店
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <DatePicker
            value={dateRange}
            onChange={setDateRange}
            maxDate={getChinaYesterday()}
            presets={adminPresets}
          />
          <UserMenu />
        </div>
      </header>

      <div className="px-4 py-4 space-y-4">
        {/* Greeting banner */}
        <div>
          <h2 className="text-xl font-bold text-gray-900">
            {greeting}，{userName.slice(0, 3)}
          </h2>
          {!isLoading && problems.length > 0 && (
            <p className="text-sm text-gray-500 mt-0.5">
              {restaurantCount} 家门店，{problems.length} 件事需要关注
            </p>
          )}
          {!isLoading && problems.length === 0 && restaurantCount > 0 && (
            <p className="text-sm text-gray-500 mt-0.5">
              {restaurantCount} 家门店均运营良好
            </p>
          )}
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
              <div className="text-xs text-gray-500 mb-0.5">满意度</div>
              <div className={`text-xl font-bold ${getSatisfactionDisplay(avgSentiment ?? null).color}`}>
                {avgSentiment != null ? `${Math.round(avgSentiment)}分` : '--'}
              </div>
              <div className="text-xs text-gray-400">
                {getSatisfactionDisplay(avgSentiment ?? null).label}
              </div>
            </div>
            <div className="bg-white rounded-xl p-3 text-center">
              <div className="text-xs text-gray-500 mb-0.5">复盘完成率</div>
              <div className={`text-xl font-bold ${
                avgReviewCompletion >= 80 ? 'text-green-600' :
                avgReviewCompletion >= 50 ? 'text-yellow-600' :
                avgReviewCompletion >= 0 && data?.avg_review_completion != null ? 'text-red-600' :
                'text-gray-400'
              }`}>
                {data?.avg_review_completion != null ? `${Math.round(avgReviewCompletion)}%` : '--'}
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

        {/* Collapsible store list */}
        {!isLoading && sortedRestaurants.length > 0 && (
          <div className="space-y-2">
            {sortedRestaurants.map((rest) => {
              const restProblems = problemsByRestaurant.get(rest.id) || [];
              const hasRed = restProblems.some(p => p.severity === 'red');
              const hasYellow = restProblems.some(p => p.severity === 'yellow');
              const isExpanded = expandedStores.has(rest.id);
              const sentiment = getSatisfactionDisplay(rest.avg_sentiment);
              const hasReviewed = rest.review_completion != null && rest.review_completion > 0;
              const reviewIcon = hasReviewed ? '✓' : '✗';

              return (
                <div key={rest.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                  {/* Store summary row — tappable */}
                  <div
                    className="px-4 py-3 flex items-center gap-3 cursor-pointer active:bg-gray-50 transition-colors"
                    onClick={() => toggleStore(rest.id)}
                  >
                    {/* Status dot */}
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      hasRed ? 'bg-red-500' : hasYellow ? 'bg-amber-400' : 'bg-green-500'
                    }`} />

                    {/* Store info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-900 truncate">{rest.name}</span>
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                        <span>{rest.visit_count}次桌访</span>
                        <span>·</span>
                        <span className={sentiment.color}>{rest.avg_sentiment != null ? `${Math.round(rest.avg_sentiment)}分` : '--'}</span>
                        <span>·</span>
                        <span className={hasReviewed ? 'text-green-600' : 'text-red-500'}>复盘{reviewIcon}</span>
                        {restProblems.length > 0 && (
                          <>
                            <span>·</span>
                            <span className="text-red-600">{restProblems.length}个问题</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Expand chevron */}
                    <svg
                      className={`w-5 h-5 text-gray-300 transition-transform duration-200 flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>

                  {/* Expanded content */}
                  {isExpanded && (
                    <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
                      {/* Problems section */}
                      {restProblems.length > 0 && (
                        <div className="space-y-3">
                          {restProblems.map((problem, idx) => (
                            <ProblemCard
                              key={`${problem.category}-${idx}`}
                              problem={problem}
                              playingKey={playingKey}
                              onAudioToggle={handleAudioToggle}
                              compact
                            />
                          ))}
                        </div>
                      )}

                      {/* Review record section */}
                      {rest.latest_review ? (
                        <div className="bg-primary-50/50 border border-primary-100 rounded-xl p-3">
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary-500" />
                            <span className="text-xs font-medium text-primary-700">最近复盘记录</span>
                          </div>
                          {rest.latest_review.ai_summary && (
                            <p className="text-sm text-gray-700 leading-relaxed">{rest.latest_review.ai_summary}</p>
                          )}
                          {Array.isArray(rest.latest_review.action_items) && rest.latest_review.action_items.length > 0 && (
                            <div className="mt-2">
                              <div className="text-[10px] text-gray-400 mb-1">行动事项</div>
                              <ul className="space-y-1">
                                {rest.latest_review.action_items.map((item: string, i: number) => (
                                  <li key={i} className="text-xs text-gray-600 flex items-start gap-1.5">
                                    <span className="text-primary-400 mt-0.5">·</span>
                                    <span>{item}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {Array.isArray(rest.latest_review.key_decisions) && rest.latest_review.key_decisions.length > 0 && (
                            <div className="mt-2">
                              <div className="text-[10px] text-gray-400 mb-1">关键决定</div>
                              <ul className="space-y-1">
                                {rest.latest_review.key_decisions.map((d: string, i: number) => (
                                  <li key={i} className="text-xs text-gray-600 flex items-start gap-1.5">
                                    <span className="text-green-400 mt-0.5">·</span>
                                    <span>{d}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-center py-2 text-xs text-gray-400">
                          该门店尚未录制复盘会议
                        </div>
                      )}

                      {/* Navigate to detail */}
                      <button
                        onClick={() => router.push(`/admin/restaurant-detail?id=${rest.id}`)}
                        className="w-full text-center text-xs text-primary-600 hover:text-primary-700 py-3 transition-colors"
                      >
                        查看详情 &rsaquo;
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Empty state - all healthy */}
        {!isLoading && sortedRestaurants.length === 0 && restaurantCount > 0 && (
          <div className="bg-white rounded-xl p-6 text-center">
            <div className="text-4xl mb-3">✅</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">一切正常</h3>
            <p className="text-sm text-gray-500">
              {restaurantCount} 家门店均运营良好
            </p>
          </div>
        )}

        {/* Benchmark panel (regional managers only) */}
        {isScoped && (
          <BenchmarkPanel managedIdsParam={managedIdsParam} />
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

// --- Problem Card Component (also used in-line within store rows) ---
function ProblemCard({
  problem,
  playingKey,
  onAudioToggle,
  compact,
}: {
  problem: BriefingProblem;
  playingKey: string | null;
  onAudioToggle: (key: string, url: string) => void;
  compact?: boolean;
}) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const severityColor = problem.severity === 'red' ? 'bg-red-500' : 'bg-amber-400';
  const severityBg = problem.severity === 'red' ? 'bg-red-50/50 border-red-100' : 'bg-amber-50/50 border-amber-100';

  return (
    <div className={`rounded-xl overflow-hidden ${compact ? `border ${severityBg}` : 'bg-white shadow-sm'}`}>
      {/* Header */}
      <div className={`px-3 pt-3 pb-1.5`}>
        <div className="flex items-center gap-2 mb-0.5">
          <span className={`w-1.5 h-1.5 rounded-full ${severityColor} flex-shrink-0`} />
          <h3 className="text-sm font-semibold text-gray-900 leading-snug">
            {problem.title}
          </h3>
        </div>
        {problem.metric && (
          <p className="text-xs text-gray-400 ml-3.5">{problem.metric}</p>
        )}
      </div>

      {/* Evidence list */}
      {problem.evidence.length > 0 && (
        <div className="px-1.5 pb-2">
          {problem.evidence.map((ev, i) => {
            const isExpanded = expandedIdx === i;
            const hasQA = (ev.managerQuestions?.length ?? 0) > 0 || (ev.customerAnswers?.length ?? 0) > 0;
            const audioKey = `${problem.restaurantId}-${problem.category}-${i}`;
            return (
              <div
                key={i}
                className={`mx-0 rounded-lg transition-colors ${isExpanded ? 'bg-white/60' : ''}`}
              >
                {/* Evidence row */}
                <div
                  className={`flex items-center gap-2 px-2.5 py-2 ${hasQA ? 'cursor-pointer' : ''}`}
                  onClick={() => hasQA && setExpandedIdx(isExpanded ? null : i)}
                >
                  <p className="text-sm text-gray-700 flex-1 leading-relaxed">
                    &ldquo;{ev.text}&rdquo;
                  </p>
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
                  <div className="px-2.5 pb-2.5 pt-0">
                    <div className="border-l-2 border-primary-200 pl-3 py-1.5">
                      <QAConversation
                        questions={ev.managerQuestions ?? []}
                        answers={ev.customerAnswers ?? []}
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
