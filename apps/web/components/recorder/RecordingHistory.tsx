// Recording History Component - Display list of recordings with status
// v1.1 - Added left-swipe to delete (localStorage only, database unaffected)

'use client';

import { useState, useRef } from 'react';
import { Recording, RecordingStatus } from '@/hooks/useRecordingStore';

interface RecordingHistoryProps {
  recordings: Recording[];
  onRetry?: (id: string) => void;
  onDelete?: (id: string) => void;
}

// Format timestamp to HH:MM
function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Format duration to MM:SS
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Status badge component
function StatusBadge({ status }: { status: RecordingStatus }) {
  const config: Record<RecordingStatus, { text: string; className: string }> = {
    saved: { text: '已保存', className: 'bg-gray-100 text-gray-600' },
    uploading: { text: '上传中...', className: 'bg-blue-100 text-blue-600' },
    processing: { text: '处理中...', className: 'bg-yellow-100 text-yellow-600' },
    completed: { text: '已完成', className: 'bg-green-100 text-green-600' },
    error: { text: '失败', className: 'bg-red-100 text-red-600' },
  };

  const { text, className } = config[status];

  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${className}`}>
      {status === 'uploading' || status === 'processing' ? (
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 bg-current rounded-full animate-pulse" />
          {text}
        </span>
      ) : (
        text
      )}
    </span>
  );
}

// Sentiment emoji
function SentimentEmoji({ sentiment }: { sentiment?: 'positive' | 'neutral' | 'negative' }) {
  if (!sentiment) return null;

  const emojis = {
    positive: '😊',
    neutral: '😐',
    negative: '😟',
  };

  return <span className="text-lg">{emojis[sentiment]}</span>;
}

// Mini waveform visualization (static)
function MiniWaveform() {
  return (
    <div className="flex items-center gap-0.5 h-4">
      {Array.from({ length: 20 }).map((_, i) => (
        <div
          key={i}
          className="w-0.5 bg-gray-300 rounded-full"
          style={{ height: `${Math.random() * 100}%` }}
        />
      ))}
    </div>
  );
}

// Swipeable row with delete action
interface SwipeableRowProps {
  children: React.ReactNode;
  onDelete: () => void;
}

function SwipeableRow({ children, onDelete }: SwipeableRowProps) {
  const [translateX, setTranslateX] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const startXRef = useRef(0);
  const currentXRef = useRef(0);
  const rowRef = useRef<HTMLDivElement>(null);

  const DELETE_THRESHOLD = -80; // Pixels to swipe to trigger delete button
  const DELETE_BUTTON_WIDTH = 80;

  const handleTouchStart = (e: React.TouchEvent) => {
    startXRef.current = e.touches[0].clientX;
    currentXRef.current = translateX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const diff = e.touches[0].clientX - startXRef.current;
    const newTranslateX = Math.min(0, Math.max(-DELETE_BUTTON_WIDTH, currentXRef.current + diff));
    setTranslateX(newTranslateX);
  };

  const handleTouchEnd = () => {
    // Snap to show delete button or hide it
    if (translateX < DELETE_THRESHOLD / 2) {
      setTranslateX(-DELETE_BUTTON_WIDTH);
    } else {
      setTranslateX(0);
    }
  };

  const handleDelete = () => {
    setIsDeleting(true);
    // Animate out then delete
    setTimeout(() => {
      onDelete();
    }, 200);
  };

  const resetSwipe = () => {
    setTranslateX(0);
  };

  return (
    <div
      className={`relative overflow-hidden transition-all duration-200 ${isDeleting ? 'h-0 opacity-0' : ''}`}
    >
      {/* Delete button background */}
      <div className="absolute inset-y-0 right-0 w-20 bg-red-500 flex items-center justify-center">
        <button
          onClick={handleDelete}
          className="w-full h-full flex items-center justify-center text-white"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>

      {/* Swipeable content */}
      <div
        ref={rowRef}
        className="relative bg-white transition-transform duration-150 ease-out"
        style={{ transform: `translateX(${translateX}px)` }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={translateX < 0 ? resetSwipe : undefined}
      >
        {children}
      </div>
    </div>
  );
}

export function RecordingHistory({
  recordings,
  onRetry,
  onDelete,
}: RecordingHistoryProps) {
  if (recordings.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-6 shadow-sm text-center">
        <p className="text-gray-400 text-sm">今日暂无录音</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <h3 className="text-sm font-medium text-gray-700">
          今日录音 ({recordings.length})
        </h3>
      </div>

      <div className="divide-y divide-gray-50">
        {recordings.map((recording) => (
          <SwipeableRow
            key={recording.id}
            onDelete={() => onDelete?.(recording.id)}
          >
            <div className="px-4 py-3 hover:bg-gray-50 transition-colors">
            <div className="flex items-start justify-between gap-3">
              {/* Left: Table ID and time */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center">
                  <span className="text-primary-600 font-bold text-sm">
                    {recording.tableId}
                  </span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">
                      {formatTime(recording.timestamp)}
                    </span>
                    <span className="text-xs text-gray-400">
                      {formatDuration(recording.duration)}
                    </span>
                  </div>
                  <div className="mt-0.5">
                    <MiniWaveform />
                  </div>
                </div>
              </div>

              {/* Right: Status and sentiment */}
              <div className="flex items-center gap-2">
                <SentimentEmoji sentiment={recording.sentiment} />
                <StatusBadge status={recording.status} />
              </div>
            </div>

            {/* Summary text */}
            {recording.aiSummary && (
              <p className="mt-2 text-sm text-gray-600 line-clamp-1 ml-13">
                "{recording.aiSummary}"
              </p>
            )}

            {/* Error message with retry */}
            {recording.status === 'error' && (
              <div className="mt-2 flex items-center justify-between ml-13">
                <span className="text-xs text-red-500">
                  {recording.errorMessage || '处理失败'}
                </span>
                {onRetry && (
                  <button
                    onClick={() => onRetry(recording.id)}
                    className="text-xs text-primary-600 hover:text-primary-700"
                  >
                    重试
                  </button>
                )}
              </div>
            )}
            </div>
          </SwipeableRow>
        ))}
      </div>
    </div>
  );
}
