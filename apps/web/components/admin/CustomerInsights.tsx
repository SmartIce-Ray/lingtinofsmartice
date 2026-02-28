// Customer Insights Component - Store-grouped collapsible view
// v2.0.1 - Redesigned: suggestions + feedbacks merged by store, date-synced

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

interface SuggestionByRestaurant {
  restaurant_id: string;
  restaurant_name: string;
  suggestions: SuggestionItem[];
}

interface SuggestionsResponse {
  suggestions: SuggestionItem[];
  by_restaurant?: SuggestionByRestaurant[];
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

interface ByRestaurantItem {
  restaurant_id: string;
  restaurant_name: string;
  positive_count: number;
  negative_count: number;
  positive_feedbacks: FeedbackItem[];
  negative_feedbacks: FeedbackItem[];
}

interface SentimentSummaryResponse {
  positive_count: number;
  negative_count: number;
  neutral_count: number;
  total_feedbacks: number;
  positive_feedbacks: FeedbackItem[];
  negative_feedbacks: FeedbackItem[];
  by_restaurant?: ByRestaurantItem[];
}

// --- Merged store data ---
interface MergedStoreData {
  restaurant_id: string;
  restaurant_name: string;
  suggestions: SuggestionItem[];
  negative_feedbacks: FeedbackItem[];
  positive_feedbacks: FeedbackItem[];
  negative_count: number;
  positive_count: number;
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

// --- Audio play button ---
function AudioButton({ audioKey, audioUrl, playingKey, onToggle }: {
  audioKey: string;
  audioUrl: string;
  playingKey: string | null;
  onToggle: (key: string, url: string) => void;
}) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onToggle(audioKey, audioUrl); }}
      className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
        playingKey === audioKey ? 'bg-primary-100 text-primary-600' : 'bg-gray-100 text-gray-600 hover:text-primary-600 hover:bg-primary-50'
      }`}
    >
      {playingKey === audioKey ? (
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
      ) : (
        <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
      )}
    </button>
  );
}

// --- Chevron icon ---
function ChevronDown({ expanded, className = '' }: { expanded: boolean; className?: string }) {
  return (
    <svg className={`w-4 h-4 text-gray-300 transition-transform duration-200 ${expanded ? 'rotate-180' : ''} ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

interface CustomerInsightsProps {
  startDate: string;
  endDate: string;
  managedIdsParam?: string;
}

export function CustomerInsights({ startDate, endDate, managedIdsParam = '' }: CustomerInsightsProps) {
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

  // Fetch suggestions — now synced with date selector
  const { data: suggestionsData, isLoading: sugLoading } = useSWR<SuggestionsResponse>(
    `/api/dashboard/suggestions?restaurant_id=all&start_date=${startDate}&end_date=${endDate}${managedIdsParam}`
  );

  // Fetch sentiment summary for feedback hot words
  const { data: sentimentData, isLoading: sentLoading } = useSWR<SentimentSummaryResponse>(
    `/api/dashboard/sentiment-summary?restaurant_id=all&start_date=${startDate}&end_date=${endDate}${managedIdsParam}`
  );

  const isLoading = sugLoading || sentLoading;

  // Merge suggestions + feedbacks by restaurant
  const mergedStores: MergedStoreData[] = (() => {
    const storeMap = new Map<string, MergedStoreData>();

    // Add from suggestions by_restaurant
    const sugByRest = suggestionsData?.by_restaurant ?? [];
    for (const sr of sugByRest) {
      storeMap.set(sr.restaurant_id, {
        restaurant_id: sr.restaurant_id,
        restaurant_name: sr.restaurant_name,
        suggestions: sr.suggestions ?? [],
        negative_feedbacks: [],
        positive_feedbacks: [],
        negative_count: 0,
        positive_count: 0,
      });
    }

    // Add from sentiment by_restaurant
    const sentByRest = sentimentData?.by_restaurant ?? [];
    for (const sr of sentByRest) {
      const existing = storeMap.get(sr.restaurant_id);
      if (existing) {
        existing.negative_feedbacks = sr.negative_feedbacks ?? [];
        existing.positive_feedbacks = sr.positive_feedbacks ?? [];
        existing.negative_count = sr.negative_count ?? 0;
        existing.positive_count = sr.positive_count ?? 0;
      } else {
        storeMap.set(sr.restaurant_id, {
          restaurant_id: sr.restaurant_id,
          restaurant_name: sr.restaurant_name,
          suggestions: [],
          negative_feedbacks: sr.negative_feedbacks ?? [],
          positive_feedbacks: sr.positive_feedbacks ?? [],
          negative_count: sr.negative_count ?? 0,
          positive_count: sr.positive_count ?? 0,
        });
      }
    }

    // Sort: stores with more issues first (suggestions + negatives)
    return Array.from(storeMap.values())
      .filter(s => s.suggestions.length > 0 || s.negative_count > 0 || s.positive_count > 0)
      .sort((a, b) => (b.suggestions.length + b.negative_count) - (a.suggestions.length + a.negative_count));
  })();

  // Expand state: store-level collapse + inner detail expand
  const [expandedStore, setExpandedStore] = useState<string | null>(null);
  const [expandedDetail, setExpandedDetail] = useState<string | null>(null);
  const toggleStore = (id: string) => {
    setExpandedStore(prev => prev === id ? null : id);
    setExpandedDetail(null);
  };
  const toggleDetail = (key: string) => setExpandedDetail(prev => prev === key ? null : key);

  const renderSuggestionRow = (item: SuggestionItem, storeId: string, idx: number) => {
    const sugKey = `${storeId}-sug-${idx}`;
    const isExp = expandedDetail === sugKey;
    const hasEvidence = item.evidence.length > 0;
    return (
      <div key={sugKey} className={`transition-colors ${isExp ? 'bg-gray-50' : ''}`}>
        <div
          className={`flex items-start gap-2.5 px-4 py-2.5 ${hasEvidence ? 'cursor-pointer active:bg-gray-50' : ''}`}
          onClick={() => hasEvidence && toggleDetail(sugKey)}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-purple-400 flex-shrink-0 mt-1.5" />
          <span className="text-sm text-gray-800 flex-1 leading-relaxed">{item.text}</span>
          <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
            <span className="text-xs font-medium text-purple-500 bg-purple-50 px-2 py-0.5 rounded-full">{item.count}</span>
            {hasEvidence && <ChevronDown expanded={isExp} />}
          </div>
        </div>
        {isExp && (
          <div className="px-4 pb-3 space-y-2">
            {item.evidence.map((ev, ei) => {
              const audioKey = `${sugKey}-${ei}`;
              return (
                <div key={ei} className="bg-white rounded-xl p-3 border border-gray-100">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                      {ev.tableId}桌
                    </span>
                    {ev.audioUrl && (
                      <AudioButton audioKey={audioKey} audioUrl={ev.audioUrl} playingKey={playingKey} onToggle={handleAudioToggle} />
                    )}
                  </div>
                  <div className="border-l-2 border-primary-200 pl-3">
                    <QAConversation questions={ev.managerQuestions ?? []} answers={ev.customerAnswers ?? []} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderFeedbackRow = (fb: FeedbackItem, type: 'neg' | 'pos', storeId: string, idx: number) => {
    const fbKey = `${storeId}-${type}-${idx}`;
    const isExp = expandedDetail === fbKey;
    const hasCtx = fb.contexts && fb.contexts.length > 0;
    const dotColor = type === 'neg' ? 'bg-amber-400' : 'bg-green-400';
    return (
      <div key={fbKey} className={`transition-colors ${isExp ? 'bg-gray-50' : ''}`}>
        <div
          className={`flex items-center gap-2.5 px-4 py-2.5 ${hasCtx ? 'cursor-pointer active:bg-gray-50' : ''}`}
          onClick={() => hasCtx && toggleDetail(fbKey)}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${dotColor} flex-shrink-0`} />
          <span className="text-sm text-gray-800 flex-1 leading-relaxed">&ldquo;{fb.text}&rdquo;</span>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className="text-xs text-gray-300">{fb.count} 桌</span>
            {hasCtx && <ChevronDown expanded={isExp} />}
          </div>
        </div>
        {isExp && hasCtx && (
          <div className="px-4 pb-3 space-y-2">
            {fb.contexts.slice(0, 3).map((ctx, ci) => {
              const audioKey = `${fbKey}-${ci}`;
              return (
                <div key={ci} className="bg-white rounded-xl p-3 border border-gray-100">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{ctx.tableId}桌</span>
                    {ctx.audioUrl && (
                      <AudioButton audioKey={audioKey} audioUrl={ctx.audioUrl} playingKey={playingKey} onToggle={handleAudioToggle} />
                    )}
                  </div>
                  <div className="border-l-2 border-primary-200 pl-3">
                    <QAConversation questions={ctx.managerQuestions ?? []} answers={ctx.customerAnswers ?? []} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3">
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

      {/* Store-grouped collapsible list */}
      {mergedStores.map((store) => {
        const isOpen = expandedStore === store.restaurant_id;
        const sugCount = store.suggestions.length;
        const hasNeg = store.negative_feedbacks.length > 0;
        const hasPos = store.positive_feedbacks.length > 0;

        return (
          <div key={store.restaurant_id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
            {/* Store header — always visible */}
            <div
              className="px-4 py-3.5 flex items-center justify-between cursor-pointer active:bg-gray-50 transition-colors"
              onClick={() => toggleStore(store.restaurant_id)}
            >
              <span className="text-sm font-semibold text-gray-900">{store.restaurant_name}</span>
              <div className="flex items-center gap-2">
                {sugCount > 0 && (
                  <span className="text-xs text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">{sugCount} 建议</span>
                )}
                {store.negative_count > 0 && (
                  <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">{store.negative_count} 差</span>
                )}
                {store.positive_count > 0 && (
                  <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">{store.positive_count} 好</span>
                )}
                <ChevronDown expanded={isOpen} />
              </div>
            </div>

            {/* Expanded content */}
            {isOpen && (
              <div className="border-t border-gray-100">
                {/* Suggestions section */}
                {sugCount > 0 && (
                  <div>
                    <div className="px-4 pt-2.5 pb-1">
                      <span className="text-xs text-purple-500 font-medium">建议</span>
                    </div>
                    {store.suggestions.map((sug, idx) => renderSuggestionRow(sug, store.restaurant_id, idx))}
                  </div>
                )}

                {/* Negative feedbacks */}
                {hasNeg && (
                  <>
                    {sugCount > 0 && <div className="mx-4 border-t border-gray-100" />}
                    <div>
                      <div className="px-4 pt-2.5 pb-1">
                        <span className="text-xs text-amber-500 font-medium">不满意</span>
                      </div>
                      {store.negative_feedbacks.map((fb, idx) => renderFeedbackRow(fb, 'neg', store.restaurant_id, idx))}
                    </div>
                  </>
                )}

                {/* Positive feedbacks */}
                {hasPos && (
                  <>
                    {(sugCount > 0 || hasNeg) && <div className="mx-4 border-t border-gray-100" />}
                    <div>
                      <div className="px-4 pt-2.5 pb-1">
                        <span className="text-xs text-green-500 font-medium">满意</span>
                      </div>
                      {store.positive_feedbacks.map((fb, idx) => renderFeedbackRow(fb, 'pos', store.restaurant_id, idx))}
                    </div>
                  </>
                )}

                <div className="h-2" />
              </div>
            )}
          </div>
        );
      })}

      {/* Empty state */}
      {!isLoading && mergedStores.length === 0 && (
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
