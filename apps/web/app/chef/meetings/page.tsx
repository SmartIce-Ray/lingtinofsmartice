// Chef Meetings Page - Kitchen meeting recording + daily summary agenda
// Reuses recorder components: RecordButton, WaveformVisualizer, MeetingHistory, MeetingDetail

'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import useSWR from 'swr';
import { useAudioRecorder } from '@/hooks/useAudioRecorder';
import { useMeetingStore } from '@/hooks/useMeetingStore';
import { useAuth } from '@/contexts/AuthContext';
import { WaveformVisualizer } from '@/components/recorder/WaveformVisualizer';
import { RecordButton } from '@/components/recorder/RecordButton';
import { MeetingHistory } from '@/components/recorder/MeetingHistory';
import { MeetingDetail } from '@/components/recorder/MeetingDetail';
import { UserMenu } from '@/components/layout/UserMenu';
import { processMeetingInBackground } from '@/lib/backgroundProcessor';
import { getApiUrl } from '@/lib/api';
import { getAuthHeaders } from '@/contexts/AuthContext';
import type { MeetingRecord } from '@/hooks/useMeetingStore';
import type { ActionItem, ActionItemsResponse } from '@/lib/action-item-constants';
import { PRIORITY_CONFIG } from '@/lib/action-item-constants';
import { getDateForSelection } from '@/lib/date-utils';

// Types matching API response
interface AgendaItem {
  category: string;
  title: string;
  detail: string;
  severity: 'high' | 'medium' | 'low';
  evidenceCount: number;
  suggestedAction: string;
  feedbacks: Array<{ tableId: string; text: string }>;
}

interface DailySummary {
  total_visits: number;
  avg_sentiment: number | null;
  agenda_items: AgendaItem[];
  ai_overview: string;
}

interface DailySummaryResponse {
  summary: DailySummary | null;
}

const SEVERITY_CONFIG = {
  high: { dot: 'bg-red-500', label: '严重' },
  medium: { dot: 'bg-yellow-500', label: '注意' },
  low: { dot: 'bg-blue-500', label: '轻微' },
};

const CATEGORY_LABELS: Record<string, string> = {
  dish_quality: '菜品',
  service_speed: '服务',
  environment: '环境',
  staff_attitude: '态度',
  other: '其他',
};

function isKitchenCategory(category: string): boolean {
  return category === 'dish_quality';
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Format action_date as "X月X日"
function formatActionDate(dateStr?: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

// Group items by action_date
function groupByDate(items: ActionItem[]): Array<{ date: string; label: string; items: ActionItem[] }> {
  const map = new Map<string, ActionItem[]>();
  for (const item of items) {
    const key = item.action_date || 'unknown';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a)) // newest first
    .map(([date, groupItems]) => ({ date, label: formatActionDate(date), items: groupItems }));
}

// Priority dot color
const PRIORITY_DOT: Record<string, string> = {
  high: 'bg-red-500',
  medium: 'bg-amber-400',
  low: 'bg-blue-400',
};

interface PendingItemsSectionProps {
  items: ActionItem[];
  collapsed: boolean;
  onToggleCollapse: () => void;
  updatingItemId: string | null;
  onUpdateStatus: (id: string, status: string) => void;
}

function PendingItemsSection({ items, collapsed, onToggleCollapse, updatingItemId, onUpdateStatus }: PendingItemsSectionProps) {
  if (items.length === 0) {
    return (
      <section>
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center gap-2.5">
          <span className="text-lg">&#x2705;</span>
          <span className="text-sm font-medium text-emerald-700">所有事项已处理完毕</span>
        </div>
      </section>
    );
  }

  const groups = groupByDate(items);

  return (
    <section>
      {/* Header */}
      <button
        onClick={onToggleCollapse}
        className="w-full flex items-center justify-between mb-2"
      >
        <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
          <span>未完成事项</span>
          <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-600">
            {items.length}项
          </span>
        </h2>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${collapsed ? '' : 'rotate-180'}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Items */}
      {!collapsed && (
        <div className="space-y-2.5">
          {groups.map(group => (
            group.items.map(item => {
              const priorityConf = PRIORITY_CONFIG[item.priority];
              const dotColor = PRIORITY_DOT[item.priority] || 'bg-gray-400';
              const categoryLabel = CATEGORY_LABELS[item.category] || item.category;

              return (
                <div key={item.id} className="bg-white rounded-2xl p-3.5 shadow-sm">
                  {/* Date label */}
                  <div className="text-[10px] text-gray-400 font-medium mb-1.5">{group.label}</div>

                  {/* Priority dot + category */}
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotColor}`} />
                    <span className={`text-xs font-medium ${priorityConf?.color || 'text-gray-500'}`}>
                      {priorityConf?.label || item.priority}
                    </span>
                    <span className="text-xs text-gray-400">&middot;</span>
                    <span className="text-xs text-gray-500">{categoryLabel}</span>
                  </div>

                  {/* Suggestion text */}
                  <p className="text-sm text-gray-800 leading-relaxed">{item.suggestion_text}</p>

                  {/* Assignee & due date (if available) */}
                  {(item.assignee || item.due_date) && (
                    <div className="flex items-center gap-3 mt-1.5 text-[11px] text-gray-400">
                      {item.assignee && (
                        <span className="flex items-center gap-0.5">
                          <span>&#x1F464;</span> {item.assignee}
                        </span>
                      )}
                      {item.due_date && (
                        <span className="flex items-center gap-0.5">
                          <span>&#x23F0;</span> {item.due_date}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-gray-100">
                    {item.status === 'pending' && (
                      <button
                        onClick={() => onUpdateStatus(item.id, 'acknowledged')}
                        disabled={updatingItemId === item.id}
                        className="px-3.5 py-1.5 text-xs font-medium rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100 active:bg-blue-200 transition-colors disabled:opacity-50"
                      >
                        知悉
                      </button>
                    )}
                    <button
                      onClick={() => onUpdateStatus(item.id, 'resolved')}
                      disabled={updatingItemId === item.id}
                      className="px-3.5 py-1.5 text-xs font-medium rounded-full bg-green-50 text-green-600 hover:bg-green-100 active:bg-green-200 transition-colors disabled:opacity-50"
                    >
                      已解决
                    </button>
                  </div>
                </div>
              );
            })
          ))}
        </div>
      )}
    </section>
  );
}

export default function ChefMeetingsPage() {
  const { user } = useAuth();
  const restaurantId = user?.restaurantId;

  // Toast state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2500);
  }, []);

  // Recording state
  const [recorderState, recorderActions] = useAudioRecorder();
  const { isRecording, duration, audioBlob, analyserData } = recorderState;
  const { startRecording, stopRecording, resetRecording } = recorderActions;
  const [pendingSave, setPendingSave] = useState(false);
  const processingIdsRef = useRef<Set<string>>(new Set());

  // Meeting store
  const {
    meetings,
    saveMeeting,
    updateMeeting,
    deleteMeeting,
    getMeetingsNeedingRetry,
  } = useMeetingStore(restaurantId);

  // Meeting detail modal
  const [selectedMeeting, setSelectedMeeting] = useState<MeetingRecord | null>(null);

  // Pending action items (cross-day unfinished)
  const [pendingCollapsed, setPendingCollapsed] = useState(false);
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null);
  const pendingParams = restaurantId
    ? new URLSearchParams({ restaurant_id: restaurantId, limit: '20' }).toString()
    : null;
  const { data: pendingData, isLoading: pendingLoading, mutate: mutatePending } = useSWR<ActionItemsResponse>(
    pendingParams ? `/api/action-items/pending?${pendingParams}` : null,
  );
  const allPendingItems = pendingData?.actions ?? [];
  const kitchenPendingItems = allPendingItems.filter(item => isKitchenCategory(item.category));

  // Update action item status
  const handleUpdateItemStatus = useCallback(async (id: string, status: string) => {
    setUpdatingItemId(id);
    try {
      const res = await fetch(getApiUrl(`api/action-items/${id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error('Update failed');
      await mutatePending();
      showToast(status === 'resolved' ? '已标记解决' : '已知悉', 'success');
    } catch {
      showToast('更新失败', 'error');
    } finally {
      setUpdatingItemId(null);
    }
  }, [mutatePending, showToast]);

  // Daily summary for agenda
  const date = getDateForSelection('今日');
  const params = restaurantId
    ? new URLSearchParams({ restaurant_id: restaurantId, date }).toString()
    : null;
  const { data: summaryData, isLoading: summaryLoading } = useSWR<DailySummaryResponse>(
    params ? `/api/daily-summary?${params}` : null,
  );
  const summary = summaryData?.summary;
  const agendaItems = summary?.agenda_items ?? [];

  // Date display
  const now = new Date();
  const dateLabel = `${now.getMonth() + 1}月${now.getDate()}日`;

  // Start recording
  const handleStart = useCallback(async () => {
    await startRecording();
  }, [startRecording]);

  // Stop recording
  const handleStop = useCallback(() => {
    stopRecording();
    setPendingSave(true);
  }, [stopRecording]);

  // When audioBlob is ready after stopping, save and process
  useEffect(() => {
    if (!audioBlob || isRecording || !pendingSave) return;

    setPendingSave(false);

    const processAsync = async () => {
      const meeting = await saveMeeting('kitchen_meeting', duration, audioBlob);
      showToast('厨房会议录音已保存', 'success');
      processingIdsRef.current.add(meeting.id);
      resetRecording();

      processMeetingInBackground(meeting, {
        onStatusChange: (id, status, data) => {
          updateMeeting(id, { status, ...data });
          if (status === 'completed') {
            processingIdsRef.current.delete(id);
            showToast('厨房会议分析完成', 'success');
          }
        },
        onError: (id, errorMsg) => {
          processingIdsRef.current.delete(id);
        },
      }, restaurantId);
    };
    processAsync();
  }, [audioBlob, isRecording, duration, pendingSave, saveMeeting, resetRecording, updateMeeting, showToast, restaurantId]);

  // Auto-retry interrupted uploads on mount
  const retryEffectRanRef = useRef(false);
  useEffect(() => {
    if (retryEffectRanRef.current) return;
    retryEffectRanRef.current = true;

    const meetingRetry = getMeetingsNeedingRetry();
    const toRetry = meetingRetry.filter(m => !processingIdsRef.current.has(m.id));
    if (toRetry.length > 0) {
      showToast(`发现 ${toRetry.length} 条未完成上传`, 'info');
      for (const meeting of toRetry) {
        processingIdsRef.current.add(meeting.id);
        processMeetingInBackground(meeting, {
          onStatusChange: (id, status, data) => {
            updateMeeting(id, { status, ...data });
            if (status === 'completed') {
              processingIdsRef.current.delete(id);
              showToast('录音恢复完成', 'success');
            }
          },
          onError: (id, errorMsg) => {
            processingIdsRef.current.delete(id);
          },
        }, restaurantId);
      }
    }
  }, [getMeetingsNeedingRetry, updateMeeting, showToast, restaurantId]);

  // Retry handler
  const handleRetry = useCallback((id: string) => {
    const meeting = meetings.find(m => m.id === id);
    if (meeting) {
      showToast('正在重试...', 'info');
      processMeetingInBackground(meeting, {
        onStatusChange: (recId, status, data) => {
          updateMeeting(recId, { status, ...data });
          if (status === 'completed') showToast('重试成功', 'success');
        },
        onError: () => {
          showToast('重试失败', 'error');
        },
      }, restaurantId);
    }
  }, [meetings, updateMeeting, showToast, restaurantId]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm px-4 py-3 flex items-center justify-between">
        <div>
          <div className="text-base font-semibold text-gray-800">厨房会议</div>
          <div className="text-xs text-gray-400">{dateLabel}</div>
        </div>
        <UserMenu />
      </header>

      <main className="px-4 pt-4 pb-24 space-y-5">
        {/* Pending action items (cross-day unfinished kitchen items) */}
        {!pendingLoading && (
          <PendingItemsSection
            items={kitchenPendingItems}
            collapsed={pendingCollapsed}
            onToggleCollapse={() => setPendingCollapsed(c => !c)}
            updatingItemId={updatingItemId}
            onUpdateStatus={handleUpdateItemStatus}
          />
        )}

        {/* Recording section */}
        <section className="flex flex-col items-center py-4">
          {isRecording && (
            <div className="w-full mb-4">
              <WaveformVisualizer analyserData={analyserData} isRecording={isRecording} />
            </div>
          )}

          <RecordButton
            isRecording={isRecording}
            onStart={handleStart}
            onStop={handleStop}
          />

          <div className="mt-3 text-lg font-mono text-gray-500">
            {formatDuration(duration)}
          </div>

          {!isRecording && (
            <p className="mt-2 text-xs text-gray-400">
              点击开始录制厨房会议
            </p>
          )}
        </section>

        {/* Daily Summary Agenda */}
        {!summaryLoading && (
          <section>
            <h2 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-400" /> 复盘议题（AI 生成）
            </h2>
            {agendaItems.length === 0 ? (
              <div className="bg-gray-50 rounded-2xl p-4">
                <p className="text-sm text-gray-500 text-center">
                  今日议题将于 21:00 自动生成
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {agendaItems.map((item, idx) => {
                  const severity = SEVERITY_CONFIG[item.severity] || SEVERITY_CONFIG.low;
                  const categoryLabel = CATEGORY_LABELS[item.category] || item.category;
                  const isKitchen = isKitchenCategory(item.category);

                  return (
                    <div
                      key={idx}
                      className={`rounded-2xl p-3 ${
                        isKitchen
                          ? 'bg-orange-50 border border-orange-200'
                          : 'bg-gray-50'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${severity.dot}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className={`text-xs font-medium ${
                              isKitchen ? 'text-orange-600' : 'text-gray-500'
                            }`}>{severity.label}</span>
                            <span className={`text-xs ${isKitchen ? 'text-orange-500' : 'text-gray-400'}`}>
                              {categoryLabel}
                            </span>
                          </div>
                          <p className={`text-sm mt-0.5 ${isKitchen ? 'text-gray-800 font-medium' : 'text-gray-600'}`}>
                            {item.title}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {item.evidenceCount}桌反映 → {item.suggestedAction}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* Meeting History */}
        <MeetingHistory
          meetings={meetings}
          title="今日会议"
          onRetry={handleRetry}
          onDelete={deleteMeeting}
          onViewDetail={setSelectedMeeting}
        />
      </main>

      {/* Meeting Detail Modal */}
      <MeetingDetail
        meeting={selectedMeeting}
        onClose={() => setSelectedMeeting(null)}
      />

      {/* Toast */}
      {toast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 animate-fade-in">
          <div className={`px-4 py-2 rounded-full shadow-lg text-sm font-medium ${
            toast.type === 'success' ? 'bg-green-500 text-white' :
            toast.type === 'error' ? 'bg-red-500 text-white' :
            'bg-gray-800 text-white'
          }`}>
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
}
