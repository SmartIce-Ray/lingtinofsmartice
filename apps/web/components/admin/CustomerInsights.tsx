// Customer Insights Component - Customer suggestions + feedback hot words
// Extracted from /admin/question-templates/page.tsx for use in merged insights page

'use client';

import { useRef, useState, useCallback, Fragment } from 'react';
import useSWR from 'swr';

// --- Types ---
interface SuggestionEvidence {
  tableId: string;
  audioUrl: string | null;
  restaurantName: string;
  restaurantId: string;
  managerQuestions?: string[];
  customerAnswers?: string[];
}

interface SuggestionItem {
  text: string;
  count: number;
  restaurants: string[];
  evidence: SuggestionEvidence[];
}

interface SuggestionsResponse {
  suggestions: SuggestionItem[];
}

interface FeedbackContext {
  text: string;
  visitId: string;
  tableId: string;
  managerQuestions: string[];
  customerAnswers: string[];
  transcript: string;
  audioUrl: string | null;
}

interface FeedbackItem {
  text: string;
  count: number;
  contexts: FeedbackContext[];
}

interface SentimentSummaryResponse {
  positive_count: number;
  negative_count: number;
  neutral_count: number;
  total_feedbacks: number;
  positive_feedbacks: FeedbackItem[];
  negative_feedbacks: FeedbackItem[];
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

export function CustomerInsights() {
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

  // Fetch customer suggestions (7-day rolling, cross-store)
  const { data: suggestionsData, isLoading: sugLoading } = useSWR<SuggestionsResponse>(
    '/api/dashboard/suggestions?restaurant_id=all&days=7'
  );

  // Fetch sentiment summary (today, cross-store) for feedback hot words
  const { data: sentimentData, isLoading: sentLoading } = useSWR<SentimentSummaryResponse>(
    '/api/dashboard/sentiment-summary?restaurant_id=all'
  );

  const suggestions = suggestionsData?.suggestions ?? [];
  const negativeFeedbacks = sentimentData?.negative_feedbacks ?? [];
  const positiveFeedbacks = sentimentData?.positive_feedbacks ?? [];
  const isLoading = sugLoading || sentLoading;

  // Expand state for suggestions (by index) and feedbacks (by "neg-idx" / "pos-idx")
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const toggleExpand = (key: string) => setExpandedKey(prev => prev === key ? null : key);

  return (
    <div className="space-y-4">
      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2].map(i => (
            <div key={i} className="bg-white rounded-xl p-4 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-1/3 mb-3" />
              <div className="h-3 bg-gray-100 rounded w-full mb-2" />
              <div className="h-3 bg-gray-100 rounded w-4/5" />
            </div>
          ))}
        </div>
      )}

      {/* Customer Suggestions */}
      {suggestions.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 pt-4 pb-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-900">顾客建议 · 近 7 天</span>
              <span className="text-xs text-gray-300">{suggestions.length} 条</span>
            </div>
          </div>
          <div>
            {suggestions.map((item, idx) => {
              const sugKey = `sug-${idx}`;
              const isExpanded = expandedKey === sugKey;
              const hasEvidence = item.evidence.length > 0;
              return (
                <div key={idx} className={`transition-colors ${isExpanded ? 'bg-gray-50' : ''}`}>
                  <div
                    className={`px-4 py-3 ${hasEvidence ? 'cursor-pointer active:bg-gray-50' : ''}`}
                    onClick={() => hasEvidence && toggleExpand(sugKey)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800 leading-relaxed">{item.text}</p>
                        <p className="text-xs text-gray-400 mt-1">
                          {item.restaurants.filter(Boolean).join('、') || '未知门店'}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
                        <span className="text-xs font-medium text-purple-500 bg-purple-50 px-2 py-0.5 rounded-full">
                          {item.count}
                        </span>
                        {hasEvidence && (
                          <svg
                            className={`w-4 h-4 text-gray-300 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        )}
                      </div>
                    </div>
                  </div>
                  {/* Expanded evidence */}
                  {isExpanded && (
                    <div className="px-4 pb-3 space-y-2">
                      {item.evidence.map((ev, ei) => {
                        const audioKey = `sug-${idx}-${ei}`;
                        return (
                          <div key={ei} className="bg-white rounded-xl p-3 border border-gray-100">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                                {ev.restaurantName || '门店'} · {ev.tableId}桌
                              </span>
                              {ev.audioUrl && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleAudioToggle(audioKey, ev.audioUrl!); }}
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
                            </div>
                            <div className="border-l-2 border-primary-200 pl-3">
                              <QAConversation
                                questions={ev.managerQuestions || []}
                                answers={ev.customerAnswers || []}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {/* Separator */}
                  {idx < suggestions.length - 1 && !isExpanded && <div className="mx-4 border-t border-gray-50" />}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Feedback Hot Words */}
      {(negativeFeedbacks.length > 0 || positiveFeedbacks.length > 0) && (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {/* Negative */}
          {negativeFeedbacks.length > 0 && (
            <div>
              <div className="px-4 pt-4 pb-2">
                <span className="text-sm font-semibold text-gray-900">高频差评 · 今日</span>
              </div>
              {negativeFeedbacks.slice(0, 6).map((fb, idx) => {
                const fbKey = `neg-${idx}`;
                const isExpanded = expandedKey === fbKey;
                const hasContexts = fb.contexts && fb.contexts.length > 0;
                return (
                  <div key={idx} className={`transition-colors ${isExpanded ? 'bg-gray-50' : ''}`}>
                    <div
                      className={`flex items-center gap-2.5 px-4 py-2.5 ${hasContexts ? 'cursor-pointer active:bg-gray-50' : ''}`}
                      onClick={() => hasContexts && toggleExpand(fbKey)}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                      <span className="text-sm text-gray-800 flex-1 leading-relaxed">&ldquo;{fb.text}&rdquo;</span>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className="text-xs text-gray-300">{fb.count} 桌</span>
                        {hasContexts && (
                          <svg
                            className={`w-4 h-4 text-gray-300 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        )}
                      </div>
                    </div>
                    {isExpanded && hasContexts && (
                      <div className="px-4 pb-3 space-y-2">
                        {fb.contexts.slice(0, 3).map((ctx, ci) => {
                          const audioKey = `neg-${idx}-${ci}`;
                          return (
                            <div key={ci} className="bg-white rounded-xl p-3 border border-gray-100">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{ctx.tableId}桌</span>
                                {ctx.audioUrl && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleAudioToggle(audioKey, ctx.audioUrl!); }}
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
                              </div>
                              <div className="border-l-2 border-primary-200 pl-3">
                                <QAConversation questions={ctx.managerQuestions || []} answers={ctx.customerAnswers || []} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Divider */}
          {negativeFeedbacks.length > 0 && positiveFeedbacks.length > 0 && (
            <div className="mx-4 border-t border-gray-100" />
          )}

          {/* Positive */}
          {positiveFeedbacks.length > 0 && (
            <div>
              <div className="px-4 pt-4 pb-2">
                <span className="text-sm font-semibold text-gray-900">高频好评 · 今日</span>
              </div>
              {positiveFeedbacks.slice(0, 6).map((fb, idx) => {
                const fbKey = `pos-${idx}`;
                const isExpanded = expandedKey === fbKey;
                const hasContexts = fb.contexts && fb.contexts.length > 0;
                return (
                  <div key={idx} className={`transition-colors ${isExpanded ? 'bg-gray-50' : ''}`}>
                    <div
                      className={`flex items-center gap-2.5 px-4 py-2.5 ${hasContexts ? 'cursor-pointer active:bg-gray-50' : ''}`}
                      onClick={() => hasContexts && toggleExpand(fbKey)}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
                      <span className="text-sm text-gray-800 flex-1 leading-relaxed">&ldquo;{fb.text}&rdquo;</span>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className="text-xs text-gray-300">{fb.count} 桌</span>
                        {hasContexts && (
                          <svg
                            className={`w-4 h-4 text-gray-300 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        )}
                      </div>
                    </div>
                    {isExpanded && hasContexts && (
                      <div className="px-4 pb-3 space-y-2">
                        {fb.contexts.slice(0, 3).map((ctx, ci) => {
                          const audioKey = `pos-${idx}-${ci}`;
                          return (
                            <div key={ci} className="bg-white rounded-xl p-3 border border-gray-100">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{ctx.tableId}桌</span>
                                {ctx.audioUrl && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleAudioToggle(audioKey, ctx.audioUrl!); }}
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
                              </div>
                              <div className="border-l-2 border-primary-200 pl-3">
                                <QAConversation questions={ctx.managerQuestions || []} answers={ctx.customerAnswers || []} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && suggestions.length === 0 && negativeFeedbacks.length === 0 && positiveFeedbacks.length === 0 && (
        <div className="bg-white rounded-xl p-8 text-center">
          <div className="text-4xl mb-3">💡</div>
          <h3 className="text-base font-medium text-gray-700 mb-1">暂无顾客洞察</h3>
          <p className="text-sm text-gray-400">
            店长完成桌访录音后，顾客建议和反馈将显示在这里
          </p>
        </div>
      )}
    </div>
  );
}
