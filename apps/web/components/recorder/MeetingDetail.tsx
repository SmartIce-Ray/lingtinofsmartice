// Meeting Detail - Bottom sheet showing full meeting minutes

'use client';

import { useEffect, useRef, useCallback } from 'react';
import { MeetingRecord, MeetingType } from '@/hooks/useMeetingStore';

interface MeetingDetailProps {
  meeting: MeetingRecord | null;
  onClose: () => void;
}

const MEETING_TYPE_LABELS: Record<MeetingType, string> = {
  pre_meal: '餐前会',
  daily_review: '每日复盘',
  weekly: '周例会',
  kitchen_meeting: '厨房会议',
};

function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(seconds: number): string {
  if (seconds >= 60) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${mins}分${secs}秒` : `${mins}分钟`;
  }
  return `${seconds}秒`;
}

export function MeetingDetail({ meeting, onClose }: MeetingDetailProps) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    if (meeting) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [meeting]);

  if (!meeting) return null;

  const typeLabel = MEETING_TYPE_LABELS[meeting.meetingType];

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-end justify-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Sheet */}
      <div className="relative w-full max-h-[90vh] bg-white rounded-t-2xl overflow-hidden animate-slide-up">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between z-10">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{typeLabel}纪要</h2>
            <p className="text-xs text-gray-400">
              {formatDateTime(meeting.timestamp)} · {formatDuration(meeting.duration)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
          >
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto p-4 space-y-4" style={{ maxHeight: 'calc(90vh - 64px)' }}>
          {/* Summary */}
          {meeting.aiSummary && (
            <section>
              <h3 className="text-sm font-medium text-gray-500 mb-2">会议摘要</h3>
              <div className="p-3 bg-gray-50 rounded-xl">
                <p className="text-sm text-gray-800 leading-relaxed">{meeting.aiSummary}</p>
              </div>
            </section>
          )}

          {/* Key Decisions */}
          {meeting.keyDecisions && meeting.keyDecisions.length > 0 && (
            <section>
              <h3 className="text-sm font-medium text-gray-500 mb-2">
                关键决定 ({meeting.keyDecisions.length})
              </h3>
              <div className="space-y-2">
                {meeting.keyDecisions.map((item, idx) => (
                  <div key={idx} className="p-3 bg-blue-50 rounded-xl">
                    <p className="text-sm font-medium text-blue-800">{item.decision}</p>
                    {item.context && (
                      <p className="text-xs text-blue-600 mt-1">{item.context}</p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Action Items */}
          {meeting.actionItems && meeting.actionItems.length > 0 && (
            <section>
              <h3 className="text-sm font-medium text-gray-500 mb-2">
                行动待办 ({meeting.actionItems.length})
              </h3>
              <div className="space-y-2">
                {meeting.actionItems.map((item, idx) => (
                  <div key={idx} className="p-3 bg-orange-50 rounded-xl flex items-start gap-3">
                    <span className="w-5 h-5 mt-0.5 rounded border-2 border-orange-300 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800">{item.what}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {item.who && item.who !== '待定' && (
                          <span className="text-xs text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded">
                            @{item.who}
                          </span>
                        )}
                        {item.deadline && (
                          <span className="text-xs text-gray-400">{item.deadline}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Empty state */}
          {!meeting.aiSummary && (!meeting.actionItems || meeting.actionItems.length === 0) && (
            <div className="text-center py-8">
              <p className="text-gray-400 text-sm">暂无纪要内容</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
