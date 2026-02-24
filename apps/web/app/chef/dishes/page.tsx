// Chef Dishes Page — "Problem First" dish feedback with expandable conversation detail
// Data: GET /api/dashboard/dish-ranking (with negative_feedbacks + contexts)

'use client';

import { useState, useRef, useCallback } from 'react';
import useSWR from 'swr';
import { useAuth } from '@/contexts/AuthContext';
import { UserMenu } from '@/components/layout/UserMenu';
import { getDateForSelection } from '@/lib/date-utils';

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

export default function ChefDishesPage() {
  const { user } = useAuth();
  const restaurantId = user?.restaurantId;
  const [selectedDate, setSelectedDate] = useState('今日');
  const [expandedDish, setExpandedDish] = useState<string | null>(null);

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

  const date = getDateForSelection(selectedDate);
  const params = restaurantId
    ? new URLSearchParams({ restaurant_id: restaurantId, date, limit: '20' }).toString()
    : null;

  const { data: dishData, isLoading } = useSWR<DishRankingResponse>(
    params ? `/api/dashboard/dish-ranking?${params}` : null,
  );

  const dishes = dishData?.dishes ?? [];

  // Split dishes into problem / good groups
  const problemDishes = dishes
    .filter((d) => d.negative > 0)
    .sort((a, b) => b.negative - a.negative);
  const goodDishes = dishes
    .filter((d) => d.negative === 0)
    .sort((a, b) => b.positive - a.positive);

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
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
      <header className="bg-white shadow-sm px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="text-base font-semibold text-gray-800">菜品反馈</div>
          <UserMenu />
        </div>
        {/* Date toggle */}
        <div className="flex mt-2">
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
        </div>
      </header>

      <main className="px-4 pt-4 pb-24">
        {isLoading && (
          <div className="text-center py-12 text-gray-400 text-sm">加载中...</div>
        )}

        {!isLoading && dishes.length === 0 && (
          <div className="text-center py-12 text-gray-400 text-sm">
            暂无菜品反馈记录
          </div>
        )}

        {!isLoading && dishes.length > 0 && (
          <div className="space-y-6">
            {/* ── Needs Attention Section ── */}
            {problemDishes.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-base">⚠️</span>
                  <span className="text-sm font-semibold text-amber-800">需要关注</span>
                  <span className="ml-auto text-xs text-amber-700/70 bg-amber-50 px-2 py-0.5 rounded-full font-medium">
                    {problemDishes.length}道
                  </span>
                </div>

                <div className="space-y-3">
                  {problemDishes.map((dish) => {
                    const isExpanded = expandedDish === dish.dish_name;
                    const contexts = getContextsForDish(dish);

                    return (
                      <div
                        key={dish.dish_name}
                        className="bg-white rounded-2xl shadow-sm border border-amber-100/60 overflow-hidden"
                      >
                        {/* Clickable card header */}
                        <button
                          onClick={() => {
                            if (isExpanded) stopAudio();
                            setExpandedDish(isExpanded ? null : dish.dish_name);
                          }}
                          className="w-full px-4 py-3.5 text-left active:bg-gray-50/50"
                        >
                          {/* Dish name + negative count */}
                          <div className="flex items-center justify-between">
                            <span className="text-[15px] font-semibold text-gray-800">
                              {dish.dish_name}
                            </span>
                            <span className="text-xs font-medium text-red-600 bg-red-50 px-2.5 py-1 rounded-full">
                              {dish.negative}桌差评
                            </span>
                          </div>

                          {/* Negative feedback tags */}
                          {dish.negative_feedbacks.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-2.5">
                              {dish.negative_feedbacks.map((fb) => (
                                <span
                                  key={fb.text}
                                  className="inline-flex items-center text-[13px] text-red-700/80 bg-red-50/80 border border-red-100 rounded-lg px-2.5 py-1"
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

                          {/* Bottom row: positive count + expand hint */}
                          <div className="flex items-center justify-between mt-2.5">
                            {dish.positive > 0 ? (
                              <span className="text-xs text-gray-400">
                                好评 {dish.positive}桌
                              </span>
                            ) : (
                              <span />
                            )}
                            <span className="text-xs text-blue-500">
                              {isExpanded ? '收起 ▴' : '查看对话 ▾'}
                            </span>
                          </div>
                        </button>

                        {/* ── Expanded conversation detail ── */}
                        {isExpanded && (
                          <div className="border-t border-amber-100/60 bg-stone-50/50 px-4 pb-4 pt-3 space-y-4">
                            {contexts.length === 0 && (
                              <p className="text-sm text-gray-400 py-2">暂无对话详情</p>
                            )}

                            {contexts.map((ctx, i) => (
                              <div key={ctx.visitId + i}>
                                {/* Context header row */}
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="text-sm font-medium text-gray-700">
                                    {ctx.tableId}桌
                                  </span>
                                  <span className="text-sm text-red-500">
                                    {ctx.feedbackText}
                                  </span>
                                  {ctx.audioUrl && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleAudioToggle(ctx.visitId, ctx.audioUrl!);
                                      }}
                                      className={`ml-auto flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                                        playingVisitId === ctx.visitId
                                          ? 'bg-blue-100 text-blue-700'
                                          : 'bg-blue-50 text-blue-600 active:bg-blue-100'
                                      }`}
                                    >
                                      {playingVisitId === ctx.visitId ? '⏸ 暂停' : '▶ 播放原声'}
                                    </button>
                                  )}
                                </div>

                                {/* Q&A conversation bubbles */}
                                {ctx.managerQuestions.length > 0 && (
                                  <div className="space-y-2 pl-3 border-l-2 border-blue-100">
                                    {ctx.managerQuestions.map((q, qi) => (
                                      <div key={qi} className="space-y-1">
                                        <div className="text-[13px] text-blue-700/80 bg-blue-50 rounded-lg px-3 py-2">
                                          <span className="text-blue-500 font-medium">店长：</span>{q}
                                        </div>
                                        {ctx.customerAnswers[qi] && (
                                          <div className="text-[13px] text-gray-700 bg-white rounded-lg px-3 py-2 border border-gray-100">
                                            <span className="text-gray-400 font-medium">顾客：</span>{ctx.customerAnswers[qi]}
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {/* Separator between contexts */}
                                {i < contexts.length - 1 && (
                                  <div className="border-b border-dashed border-gray-200 mt-4" />
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* ── Doing Well Section ── */}
            {goodDishes.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-base">👍</span>
                  <span className="text-sm font-semibold text-emerald-800">表现不错</span>
                  <span className="ml-auto text-xs text-emerald-700/70 bg-emerald-50 px-2 py-0.5 rounded-full font-medium">
                    {goodDishes.length}道
                  </span>
                </div>

                <div className="bg-white rounded-2xl shadow-sm divide-y divide-gray-50">
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
