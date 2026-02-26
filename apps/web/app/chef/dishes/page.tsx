// Chef Dishes Page — "Kitchen Feedback" covering all kitchen dimensions
// (dish quality, speed, temperature, plating, freshness) with action buttons
// Data: GET /api/dashboard/dish-ranking + GET /api/dashboard/sentiment-summary

'use client';

import { useState, useRef, useCallback, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { useAuth } from '@/contexts/AuthContext';
import { UserMenu } from '@/components/layout/UserMenu';
import { getChinaToday, singleDay, dateRangeParams } from '@/lib/date-utils';
import type { DateRange } from '@/lib/date-utils';
import { DatePicker, storePresets } from '@/components/shared/DatePicker';

interface FeedbackContext {
  visitId: string;
  tableId: string;
  managerQuestions: string[];
  customerAnswers: string[];
  audioUrl: string | null;
}

interface NegativeFeedback {
  text: string;
  count: number;
  contexts?: FeedbackContext[];
}

interface DishRanking {
  dish_name: string;
  mention_count: number;
  positive: number;
  negative: number;
  neutral: number;
  negative_feedbacks: NegativeFeedback[];
}

interface DishRankingResponse {
  dishes: DishRanking[];
}

// Kitchen-related feedback categories from sentiment summary
interface SentimentFeedbackContext {
  text: string;
  visitId: string;
  tableId: string;
  managerQuestions: string[];
  customerAnswers: string[];
  transcript: string;
  audioUrl: string | null;
}

interface SentimentFeedbackItem {
  text: string;
  count: number;
  contexts?: SentimentFeedbackContext[];
}

interface SentimentSummaryResponse {
  negative_feedbacks: SentimentFeedbackItem[];
  positive_feedbacks: SentimentFeedbackItem[];
}

// Detect kitchen-related feedback category
function detectKitchenCategory(text: string): { icon: string; label: string; isKitchen: boolean } {
  const lower = text.toLowerCase();
  if (/慢|等了|催|久|速度|出菜/.test(lower)) return { icon: '⏱️', label: '出菜速度', isKitchen: true };
  if (/凉|温度|冷|不够热|端上来/.test(lower)) return { icon: '🌡️', label: '菜品温度', isKitchen: true };
  if (/摆盘|卖相|样子/.test(lower)) return { icon: '🎨', label: '卖相', isKitchen: true };
  if (/新鲜|不新鲜|蔫|变质/.test(lower)) return { icon: '🥬', label: '食材新鲜度', isKitchen: true };
  if (/态度|不耐烦|冷淡/.test(lower)) return { icon: '😐', label: '服务态度', isKitchen: false };
  if (/环境|吵|脏/.test(lower)) return { icon: '🏠', label: '环境', isKitchen: false };
  return { icon: '🍳', label: '菜品口味', isKitchen: true };
}

// Kitchen problem item (non-dish dimension)
interface KitchenProblem {
  icon: string;
  label: string;
  count: number;
  feedbacks: SentimentFeedbackItem[];
}

// --- Shared: SVG play/pause circle button ---
function AudioCircleButton({ isPlaying, onClick }: { isPlaying: boolean; onClick: (e: React.MouseEvent) => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors flex-shrink-0 ${
        isPlaying
          ? 'bg-primary-100 text-primary-600'
          : 'bg-gray-100 text-gray-600 hover:text-primary-600 hover:bg-primary-50'
      }`}
    >
      {isPlaying ? (
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
      ) : (
        <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
      )}
    </button>
  );
}

// --- Shared: Q&A conversation renderer ---
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

export default function ChefDishesPage() {
  const { user } = useAuth();
  const router = useRouter();
  const restaurantId = user?.restaurantId;
  const [dateRange, setDateRange] = useState<DateRange>(() => singleDay(getChinaToday()));
  const [expandedDish, setExpandedDish] = useState<string | null>(null);
  const [expandedKitchen, setExpandedKitchen] = useState<string | null>(null);
  // Local-only "marked improved" state (resets on refresh; backend integration TBD)
  const [markedImproved, setMarkedImproved] = useState<Set<string>>(new Set());

  // Audio playback
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingVisitId, setPlayingVisitId] = useState<string | null>(null);

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setPlayingVisitId(null);
  }, []);

  const handleAudioToggle = useCallback(
    (visitId: string, audioUrl: string) => {
      if (playingVisitId === visitId) {
        stopAudio();
        return;
      }
      stopAudio();
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
    },
    [playingVisitId, stopAudio],
  );

  const rangeQs = dateRangeParams(dateRange);
  const params = restaurantId
    ? `restaurant_id=${restaurantId}&${rangeQs}&limit=20`
    : null;

  const { data: dishData, isLoading } = useSWR<DishRankingResponse>(
    params ? `/api/dashboard/dish-ranking?${params}` : null,
  );

  // Also fetch sentiment summary for non-dish kitchen problems
  const sentimentParams = restaurantId
    ? `restaurant_id=${restaurantId}&${rangeQs}`
    : null;
  const { data: sentimentData } = useSWR<SentimentSummaryResponse>(
    sentimentParams ? `/api/dashboard/sentiment-summary?${sentimentParams}` : null,
  );

  const dishes = dishData?.dishes ?? [];

  // Split dishes into problem / good groups
  const problemDishes = dishes
    .filter((d) => d.negative > 0)
    .sort((a, b) => b.negative - a.negative);
  const goodDishes = dishes
    .filter((d) => d.negative === 0)
    .sort((a, b) => b.positive - a.positive);

  // Extract kitchen-related non-dish problems from sentiment data
  const kitchenProblems: KitchenProblem[] = [];
  const kitchenHighlights: { icon: string; label: string; count: number }[] = [];

  if (sentimentData) {
    const catMap = new Map<string, { icon: string; label: string; items: SentimentFeedbackItem[] }>();
    for (const fb of sentimentData.negative_feedbacks || []) {
      const cat = detectKitchenCategory(fb.text);
      if (!cat.isKitchen) continue;
      if (cat.label === '菜品口味') continue;
      const key = cat.label;
      const existing = catMap.get(key) || { icon: cat.icon, label: cat.label, items: [] };
      existing.items.push(fb);
      catMap.set(key, existing);
    }
    Array.from(catMap.values()).forEach(val => {
      const totalCount = val.items.reduce((sum, fb) => sum + fb.count, 0);
      kitchenProblems.push({ icon: val.icon, label: val.label, count: totalCount, feedbacks: val.items });
    });
    kitchenProblems.sort((a, b) => b.count - a.count);

    for (const fb of sentimentData.positive_feedbacks || []) {
      const cat = detectKitchenCategory(fb.text);
      if (cat.isKitchen && cat.label !== '菜品口味') {
        kitchenHighlights.push({ icon: cat.icon, label: `${cat.label} ${fb.count}桌好评`, count: fb.count });
      }
    }
  }

  // Collect all contexts for an expanded dish
  const getContextsForDish = (dish: DishRanking): Array<FeedbackContext & { feedbackText: string }> => {
    const result: Array<FeedbackContext & { feedbackText: string }> = [];
    for (const fb of dish.negative_feedbacks) {
      for (const ctx of fb.contexts ?? []) {
        result.push({ ...ctx, feedbackText: fb.text });
      }
    }
    return result;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm px-4 py-3 flex items-center justify-between">
        <div className="text-base font-semibold text-gray-800">厨房反馈</div>
        <div className="flex items-center gap-2">
          <DatePicker
            value={dateRange}
            onChange={setDateRange}
            maxDate={getChinaToday()}
            presets={storePresets}
          />
          <UserMenu />
        </div>
      </header>

      <main className="px-4 pt-4 pb-24">
        {isLoading && (
          <div className="text-center py-12 text-gray-400 text-sm">加载中...</div>
        )}

        {!isLoading && dishes.length === 0 && kitchenProblems.length === 0 && (
          <div className="text-center py-12 text-gray-400 text-sm">
            暂无厨房反馈记录
          </div>
        )}

        {!isLoading && (dishes.length > 0 || kitchenProblems.length > 0) && (
          <div className="space-y-6">
            {/* ── Kitchen Dimension Problems (speed, temp, etc.) ── */}
            {kitchenProblems.length > 0 && (
              <section>
                {(problemDishes.length > 0 || kitchenProblems.length > 0) && (
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                    <span className="text-sm font-semibold text-gray-700">需要关注</span>
                  </div>
                )}

                <div className="space-y-3">
                  {kitchenProblems.map((kp) => {
                    const isExpanded = expandedKitchen === kp.label;
                    return (
                      <div key={kp.label} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                        <button
                          onClick={() => {
                            if (isExpanded) stopAudio();
                            setExpandedKitchen(isExpanded ? null : kp.label);
                          }}
                          className="w-full px-4 py-3.5 text-left active:bg-gray-50/50"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[15px] font-semibold text-gray-800">
                              {kp.icon} {kp.label}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                                kp.count >= 3 ? 'text-red-600 bg-red-50' : 'text-amber-600 bg-amber-50'
                              }`}>
                                {kp.count}桌
                              </span>
                              <svg
                                className={`w-4 h-4 text-gray-300 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                              </svg>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2 mt-2">
                            {kp.feedbacks.map(fb => (
                              <span key={fb.text} className="text-[13px] text-red-700/80 bg-red-50/80 rounded-lg px-2.5 py-1">
                                &ldquo;{fb.text}&rdquo;{fb.count > 1 && <span className="ml-1 text-red-500/60">&times;{fb.count}</span>}
                              </span>
                            ))}
                          </div>
                        </button>

                        {/* Expanded: show contexts with Q&A */}
                        {isExpanded && (
                          <div className="border-t border-amber-100/60 bg-stone-50/50 px-4 pb-4 pt-3 space-y-3">
                            {kp.feedbacks.flatMap(fb => fb.contexts ?? []).map((ctx, i) => (
                              <div key={`${ctx.visitId}-${i}`}>
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="text-sm font-medium text-gray-700">{ctx.tableId}桌</span>
                                  {ctx.audioUrl && (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleAudioToggle(ctx.visitId, ctx.audioUrl!); }}
                                      className={`ml-auto flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                                        playingVisitId === ctx.visitId ? 'bg-blue-100 text-blue-700' : 'bg-blue-50 text-blue-600'
                                      }`}
                                    >
                                      {playingVisitId === ctx.visitId ? '⏸ 暂停' : '▶ 原声'}
                                    </button>
                                  )}
                                </div>
                                {ctx.customerAnswers.length > 0 && (
                                  <div className="text-[13px] text-gray-700 bg-white rounded-lg px-3 py-2 border border-gray-100">
                                    <span className="text-gray-400 font-medium">顾客：</span>{ctx.customerAnswers.join(' ')}
                                  </div>
                                )}
                              </div>
                            ))}
                            {/* Action buttons */}
                            <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                              <button
                                onClick={() => setMarkedImproved(prev => new Set(prev).add(kp.label))}
                                disabled={markedImproved.has(kp.label)}
                                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
                                  markedImproved.has(kp.label)
                                    ? 'text-gray-400 bg-gray-50 cursor-default'
                                    : 'text-green-700 bg-green-50 hover:bg-green-100'
                                }`}
                              >
                                {markedImproved.has(kp.label) ? '✅ 已标记' : '✅ 已改善'}
                              </button>
                              <button
                                onClick={() => router.push('/chef/dashboard')}
                                className="flex-1 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
                              >
                                查看待办
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* ── Dish Quality: Needs Attention Section ── */}
            {problemDishes.length > 0 && (
              <section>
                {kitchenProblems.length === 0 && (
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                    <span className="text-sm font-semibold text-gray-700">需要关注</span>
                  </div>
                )}
                {kitchenProblems.length > 0 && (
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs font-semibold text-gray-500">菜品口味问题</span>
                    <span className="ml-auto text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full font-medium">
                      {problemDishes.length}道
                    </span>
                  </div>
                )}

                <div className="space-y-3">
                  {problemDishes.map((dish) => {
                    const isExpanded = expandedDish === dish.dish_name;
                    const contexts = getContextsForDish(dish);

                    return (
                      <div
                        key={dish.dish_name}
                        className="bg-white rounded-2xl shadow-sm overflow-hidden"
                      >
                        {/* Clickable card header */}
                        <button
                          onClick={() => {
                            if (isExpanded) stopAudio();
                            setExpandedDish(isExpanded ? null : dish.dish_name);
                          }}
                          className="w-full px-4 py-3.5 text-left active:bg-gray-50/50"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[15px] font-semibold text-gray-800">
                              {dish.dish_name}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                                {dish.negative}桌差评
                              </span>
                              <svg
                                className={`w-4 h-4 text-gray-300 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                              </svg>
                            </div>
                          </div>

                          {/* Negative feedback tags */}
                          {dish.negative_feedbacks.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-2.5">
                              {dish.negative_feedbacks.map((fb) => (
                                <span
                                  key={fb.text}
                                  className="inline-flex items-center text-[13px] text-red-700/80 bg-red-50/80 rounded-lg px-2.5 py-1"
                                >
                                  &ldquo;{fb.text}&rdquo;
                                  {fb.count > 1 && (
                                    <span className="ml-1 text-red-500/60">
                                      &times;{fb.count}
                                    </span>
                                  )}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Bottom row: positive count */}
                          {dish.positive > 0 && (
                            <div className="mt-2.5">
                              <span className="text-xs text-gray-400">
                                好评 {dish.positive}桌
                              </span>
                            </div>
                          )}
                        </button>

                        {/* ── Expanded conversation detail ── */}
                        {isExpanded && (
                          <div className="bg-gray-50 px-4 pb-4 pt-3 space-y-3">
                            {contexts.length === 0 && (
                              <p className="text-sm text-gray-400 py-2">暂无对话详情</p>
                            )}

                            {contexts.map((ctx, i) => (
                              <div key={ctx.visitId + i} className="bg-white rounded-xl p-3 border border-gray-100">
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                                      {ctx.tableId}桌
                                    </span>
                                    <span className="text-xs text-red-500">{ctx.feedbackText}</span>
                                  </div>
                                  {ctx.audioUrl && (
                                    <AudioCircleButton
                                      isPlaying={playingVisitId === ctx.visitId}
                                      onClick={(e) => { e.stopPropagation(); handleAudioToggle(ctx.visitId, ctx.audioUrl!); }}
                                    />
                                  )}
                                </div>
                                <div className="border-l-2 border-primary-200 pl-3">
                                  <QAConversation questions={ctx.managerQuestions} answers={ctx.customerAnswers} />
                                </div>
                              </div>
                            ))}
                            {/* Action buttons */}
                            <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                              <button
                                onClick={() => setMarkedImproved(prev => new Set(prev).add(dish.dish_name))}
                                disabled={markedImproved.has(dish.dish_name)}
                                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
                                  markedImproved.has(dish.dish_name)
                                    ? 'text-gray-400 bg-gray-50 cursor-default'
                                    : 'text-green-700 bg-green-50 hover:bg-green-100'
                                }`}
                              >
                                {markedImproved.has(dish.dish_name) ? '✅ 已标记' : '✅ 已改善'}
                              </button>
                              <button
                                onClick={() => router.push('/chef/dashboard')}
                                className="flex-1 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
                              >
                                查看待办
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* ── Doing Well Section (dishes + kitchen highlights) ── */}
            {(goodDishes.length > 0 || kitchenHighlights.length > 0) && (
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                  <span className="text-sm font-semibold text-gray-700">好评亮点</span>
                </div>

                <div className="bg-white rounded-2xl shadow-sm divide-y divide-gray-50">
                  {kitchenHighlights.map((kh) => (
                    <div key={kh.label} className="flex items-center justify-between px-4 py-3">
                      <span className="text-sm text-gray-700">{kh.icon} {kh.label}</span>
                    </div>
                  ))}
                  {goodDishes.map((dish) => (
                    <div
                      key={dish.dish_name}
                      className="flex items-center justify-between px-4 py-3"
                    >
                      <span className="text-sm text-gray-700">{dish.dish_name}</span>
                      <span className="text-xs text-emerald-600 font-medium">
                        {dish.positive}桌好评
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
