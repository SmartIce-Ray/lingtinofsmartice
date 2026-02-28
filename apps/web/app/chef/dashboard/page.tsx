// Chef Dashboard - Action items with required response notes
// v2.0 - Rework: mandatory response_note, voice input, polite copy, no "acknowledge" button

'use client';

import { useState, useRef, useCallback } from 'react';
import useSWR from 'swr';
import { useAuth } from '@/contexts/AuthContext';
import { UserMenu } from '@/components/layout/UserMenu';
import { getApiUrl } from '@/lib/api';
import { getAuthHeaders } from '@/contexts/AuthContext';
import { getDateForSelection } from '@/lib/date-utils';
import type { ActionItem, ActionItemsResponse } from '@/lib/action-item-constants';
import { CATEGORY_LABELS, PRIORITY_CONFIG, STATUS_CONFIG } from '@/lib/action-item-constants';

// Filter: kitchen-relevant items
function isKitchenRelevant(item: ActionItem): boolean {
  if (item.category === 'dish_quality') return true;
  if (item.category === 'service_speed') return true;
  if (/厨师|厨房|后厨|菜品|出品|出菜|上菜|温度|摆盘|食材|新鲜/.test(item.suggestion_text)) return true;
  return false;
}

// Calculate priority score
function getPriorityScore(item: ActionItem): number {
  const evidenceCount = item.evidence?.length || 1;
  const isHigh = item.priority === 'high' ? 2 : item.priority === 'medium' ? 1 : 0;
  return evidenceCount * (1 + isHigh);
}

export default function ChefDashboardPage() {
  const { user } = useAuth();
  const restaurantId = user?.restaurantId;

  const todayDate = getDateForSelection('今日');
  const yesterdayDate = getDateForSelection('昨日');

  // Fetch today's and yesterday's action items
  const todayParams = restaurantId ? new URLSearchParams({ restaurant_id: restaurantId, date: todayDate }).toString() : null;
  const yesterdayParams = restaurantId ? new URLSearchParams({ restaurant_id: restaurantId, date: yesterdayDate }).toString() : null;

  const { data: todayData, isLoading: todayLoading, mutate: mutateToday } = useSWR<ActionItemsResponse>(
    todayParams ? `/api/action-items?${todayParams}` : null,
  );
  const { data: yesterdayData, isLoading: yesterdayLoading, mutate: mutateYesterday } = useSWR<ActionItemsResponse>(
    yesterdayParams ? `/api/action-items?${yesterdayParams}` : null,
  );

  const todayActions = (todayData?.actions ?? []).filter(isKitchenRelevant);
  const yesterdayUnresolved = (yesterdayData?.actions ?? [])
    .filter(isKitchenRelevant)
    .filter(a => a.status === 'pending' || a.status === 'acknowledged');

  // Separate priority items (top 2 by score) from others
  const allPending = [...todayActions, ...yesterdayUnresolved]
    .filter(a => a.status === 'pending' || a.status === 'acknowledged')
    .sort((a, b) => getPriorityScore(b) - getPriorityScore(a));
  const priorityItems = allPending.slice(0, 2);
  const priorityIds = new Set(priorityItems.map(a => a.id));
  const otherTodayActions = todayActions.filter(a => !priorityIds.has(a.id));
  const otherYesterdayUnresolved = yesterdayUnresolved.filter(a => !priorityIds.has(a.id));

  // Stats
  const pendingCount = allPending.length;
  const yesterdayKitchenCount = (yesterdayData?.actions ?? [])
    .filter(isKitchenRelevant)
    .length;

  // Update status handler
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const handleUpdateStatus = async (id: string, status: string, responseNote?: string) => {
    setUpdatingId(id);
    try {
      const res = await fetch(
        getApiUrl(`api/action-items/${id}`),
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ status, response_note: responseNote }),
        },
      );
      if (!res.ok) throw new Error('Update failed');
      await mutateToday();
      await mutateYesterday();
    } catch (err) {
      console.error('Failed to update action item:', err);
    } finally {
      setUpdatingId(null);
    }
  };

  // Date display
  const now = new Date();
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  const dateLabel = `${now.getMonth() + 1}月${now.getDate()}日 周${weekdays[now.getDay()]}`;

  const isLoading = todayLoading || yesterdayLoading;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm px-4 py-3 flex items-center justify-between">
        <div className="text-base font-semibold text-gray-800">{dateLabel}</div>
        <UserMenu />
      </header>

      <main className="px-4 pt-4 pb-4 space-y-5">
        {/* Quick Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-2xl p-4 shadow-sm text-center">
            <div className="text-2xl font-bold text-red-600">{pendingCount}</div>
            <div className="text-xs text-gray-500 mt-1">待处理任务</div>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm text-center">
            <div className="text-2xl font-bold text-yellow-600">{yesterdayKitchenCount}</div>
            <div className="text-xs text-gray-500 mt-1">昨日厨房问题</div>
          </div>
        </div>

        {isLoading && (
          <div className="text-center py-8 text-gray-400 text-sm">加载中...</div>
        )}

        {/* Priority items — top 2 most critical */}
        {!isLoading && priorityItems.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-red-700 mb-2 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500" /> 建议优先处理
            </h2>
            <div className="space-y-3">
              {priorityItems.map((item) => (
                <ActionCard
                  key={item.id}
                  item={item}
                  updatingId={updatingId}
                  onUpdateStatus={handleUpdateStatus}
                  highlight
                />
              ))}
            </div>
          </section>
        )}

        {/* Pre-meal reminders: yesterday unresolved (excluding priority items) */}
        {!isLoading && otherYesterdayUnresolved.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-400" /> 餐前关注
            </h2>
            <div className="space-y-3">
              {otherYesterdayUnresolved.map((item) => (
                <ActionCard
                  key={item.id}
                  item={item}
                  updatingId={updatingId}
                  onUpdateStatus={handleUpdateStatus}
                />
              ))}
            </div>
          </section>
        )}

        {/* Today's tasks (excluding priority items) */}
        {!isLoading && (
          <section>
            <h2 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-400" /> 其他待办
            </h2>
            {otherTodayActions.length === 0 && priorityItems.length === 0 && otherYesterdayUnresolved.length === 0 ? (
              <div className="bg-white rounded-2xl p-6 shadow-sm text-center">
                <div className="text-green-500 text-lg mb-1">✅</div>
                <p className="text-sm text-gray-500">太棒了，暂时没有需要处理的问题！</p>
              </div>
            ) : otherTodayActions.length === 0 ? null : (
              <div className="space-y-3">
                {otherTodayActions.map((item) => (
                  <ActionCard
                    key={item.id}
                    item={item}
                    updatingId={updatingId}
                    onUpdateStatus={handleUpdateStatus}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {/* All done state */}
        {!isLoading && todayActions.length > 0 && yesterdayUnresolved.length === 0 &&
          todayActions.every(a => a.status === 'resolved' || a.status === 'dismissed') && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-4 text-center">
            <p className="text-sm text-green-700 font-medium">太棒了，今日任务已全部跟进！</p>
          </div>
        )}
      </main>
    </div>
  );
}

// Reusable action item card for chef — with response note input + voice recording
function ActionCard({
  item,
  updatingId,
  onUpdateStatus,
  highlight,
}: {
  item: ActionItem;
  updatingId: string | null;
  onUpdateStatus: (id: string, status: string, responseNote?: string) => void;
  highlight?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [responseNote, setResponseNote] = useState('');
  const [showInput, setShowInput] = useState(false);
  const [dismissMode, setDismissMode] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const priority = PRIORITY_CONFIG[item.priority] || PRIORITY_CONFIG.medium;
  const category = CATEGORY_LABELS[item.category] || item.category;
  const statusConf = STATUS_CONFIG[item.status];
  const canSubmit = responseNote.trim().length > 0;

  // Voice recording
  const startRecording = useCallback(async () => {
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream?.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        if (blob.size > 0) {
          setIsTranscribing(true);
          try {
            const formData = new FormData();
            formData.append('file', blob, 'voice-note.webm');
            const res = await fetch(getApiUrl('api/audio/quick-transcribe'), {
              method: 'POST',
              headers: getAuthHeaders(),
              body: formData,
            });
            if (res.ok) {
              const data = await res.json();
              if (data.transcript) {
                setResponseNote(prev => prev ? `${prev} ${data.transcript}` : data.transcript);
              }
            }
          } catch (err) {
            console.error('Quick-transcribe failed:', err);
          } finally {
            setIsTranscribing(false);
          }
        }
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setIsRecording(true);
    } catch {
      // Clean up stream if MediaRecorder constructor throws
      stream?.getTracks().forEach(t => t.stop());
      console.error('Microphone access denied or recording failed');
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    setIsRecording(false);
  }, []);

  const handleResolve = () => {
    if (!showInput) {
      setShowInput(true);
      setDismissMode(false);
      return;
    }
    if (canSubmit) {
      onUpdateStatus(item.id, 'resolved', responseNote.trim());
      setShowInput(false);
      setResponseNote('');
    }
  };

  const handleDismiss = () => {
    if (!showInput || !dismissMode) {
      setShowInput(true);
      setDismissMode(true);
      return;
    }
    if (canSubmit) {
      onUpdateStatus(item.id, 'dismissed', responseNote.trim());
      setShowInput(false);
      setResponseNote('');
      setDismissMode(false);
    }
  };

  return (
    <div className={`bg-white rounded-2xl p-4 shadow-sm ${
      item.status === 'resolved' ? 'border border-green-200 bg-green-50/50' :
      item.status === 'acknowledged' ? 'border border-primary-200 bg-primary-50/30' :
      highlight ? 'border border-red-200 bg-red-50/30' :
      ''
    }`}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${priority.bg} ${priority.color}`}>
          {priority.label}
        </span>
        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600">
          {category}
        </span>
        {statusConf && (
          <span className={`ml-auto text-xs ${statusConf.color}`}>
            {statusConf.label}
          </span>
        )}
      </div>

      {/* Suggestion */}
      <p className="text-sm text-gray-800 leading-relaxed">{item.suggestion_text}</p>

      {/* Response note display (for resolved items) */}
      {(item.status === 'resolved' || item.status === 'dismissed') && item.response_note && (
        <div className="mt-2 text-xs text-green-700 bg-green-50 rounded px-2 py-1">
          处理说明: {item.response_note}
        </div>
      )}

      {/* Evidence toggle */}
      {item.evidence && item.evidence.length > 0 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-2 flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          <svg className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          原始反馈 ({item.evidence.length}条)
        </button>
      )}

      {/* Evidence list */}
      {expanded && item.evidence && (
        <div className="mt-2 space-y-1.5">
          {item.evidence.map((ev, idx) => (
            <div key={idx} className="text-xs bg-gray-50 rounded-lg px-2.5 py-1.5">
              <span className="text-gray-500">{ev.tableId}桌:</span>{' '}
              <span className="text-gray-700">&ldquo;{ev.feedback}&rdquo;</span>
            </div>
          ))}
        </div>
      )}

      {/* Response input area */}
      {showInput && (item.status === 'pending' || item.status === 'acknowledged') && (
        <div className="mt-3 space-y-2">
          <div className="relative">
            <textarea
              value={responseNote}
              onChange={(e) => setResponseNote(e.target.value)}
              placeholder={dismissMode ? '麻烦说一下忽略的原因~' : '麻烦记录一下处理情况，谢谢~'}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-400 pr-12"
              rows={2}
              autoFocus
            />
            {/* Voice input button */}
            <button
              onClick={isRecording ? stopRecording : startRecording}
              disabled={isTranscribing}
              className={`absolute right-2 bottom-2 w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                isRecording
                  ? 'bg-red-500 text-white animate-pulse'
                  : isTranscribing
                    ? 'bg-gray-200 text-gray-400'
                    : 'bg-gray-100 text-gray-500 hover:bg-primary-50 hover:text-primary-600'
              }`}
              title={isRecording ? '停止录音' : '语音输入'}
            >
              {isTranscribing ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
              ) : (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" /><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" /></svg>
              )}
            </button>
          </div>
          {isRecording && (
            <div className="text-xs text-red-500 text-center animate-pulse">录音中... 点击麦克风停止</div>
          )}
          {isTranscribing && (
            <div className="text-xs text-gray-400 text-center">语音转文字中...</div>
          )}
        </div>
      )}

      {/* Action buttons */}
      {(item.status === 'pending' || item.status === 'acknowledged') && (
        <div className="flex items-center gap-2 mt-3 pt-2 border-t border-gray-100">
          <button
            onClick={handleResolve}
            disabled={updatingId === item.id || (showInput && !dismissMode && !canSubmit) || (showInput && dismissMode)}
            className={`min-h-[48px] px-4 py-2 text-sm rounded-xl transition-colors disabled:opacity-50 font-medium flex-1 ${
              showInput && !dismissMode
                ? canSubmit
                  ? 'bg-green-500 text-white hover:bg-green-600'
                  : 'bg-green-50 text-green-400'
                : 'bg-green-50 text-green-600 hover:bg-green-100'
            }`}
          >
            {showInput && !dismissMode ? '处理完成，谢谢！' : '搞定了 ✓'}
          </button>
          <button
            onClick={handleDismiss}
            disabled={updatingId === item.id || (showInput && dismissMode && !canSubmit)}
            className={`min-h-[48px] px-3 py-2 text-sm rounded-xl transition-colors disabled:opacity-50 ${
              showInput && dismissMode
                ? canSubmit
                  ? 'bg-gray-500 text-white hover:bg-gray-600'
                  : 'bg-gray-50 text-gray-400'
                : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
            }`}
          >
            {showInput && dismissMode ? '确认忽略' : '忽略'}
          </button>
        </div>
      )}
    </div>
  );
}
