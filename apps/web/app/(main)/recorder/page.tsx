// Recorder Page - Dual mode: table visit recording + meeting recording
// v5.0 - Added daily ops loop: agenda card for daily_review, reminder for pre_meal

'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import useSWR from 'swr';
import { useAudioRecorder } from '@/hooks/useAudioRecorder';
import { useRecordingStore } from '@/hooks/useRecordingStore';
import { useMeetingStore, MeetingType } from '@/hooks/useMeetingStore';
import { useAuth } from '@/contexts/AuthContext';
import { TableSelector } from '@/components/recorder/TableSelector';
import { WaveformVisualizer } from '@/components/recorder/WaveformVisualizer';
import { RecordButton } from '@/components/recorder/RecordButton';
import { RecordingHistory } from '@/components/recorder/RecordingHistory';
import { QuestionPrompt } from '@/components/recorder/QuestionPrompt';
import { MeetingTypeSelector } from '@/components/recorder/MeetingTypeSelector';
import { MeetingAgendaCard } from '@/components/recorder/MeetingAgendaCard';
import { PreMealReminder } from '@/components/recorder/PreMealReminder';
import { MeetingHistory } from '@/components/recorder/MeetingHistory';
import { StealthOverlay } from '@/components/recorder/StealthOverlay';
import { MeetingDetail } from '@/components/recorder/MeetingDetail';
import { MotivationBanner } from '@/components/recorder/MotivationBanner';
import { UserMenu } from '@/components/layout/UserMenu';
import { APP_VERSION } from '@/components/layout/UpdatePrompt';
import {
  processRecordingInBackground,
  processMeetingInBackground,
  retryPendingFromDatabase,
} from '@/lib/backgroundProcessor';
import type { MeetingRecord } from '@/hooks/useMeetingStore';

type RecorderMode = 'visit' | 'meeting';

interface QuestionTemplate {
  id: string;
  template_name: string;
  questions: Array<{ id: string; text: string; category: string }>;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function getDateString(selection: string): string | undefined {
  if (selection === '今日') return undefined;
  const now = new Date();
  const chinaOffset = 8 * 60;
  const localOffset = now.getTimezoneOffset();
  const chinaTime = new Date(now.getTime() + (chinaOffset + localOffset) * 60 * 1000);
  if (selection === '昨日') {
    chinaTime.setDate(chinaTime.getDate() - 1);
  }
  const year = chinaTime.getFullYear();
  const month = String(chinaTime.getMonth() + 1).padStart(2, '0');
  const day = String(chinaTime.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function RecorderPage() {
  // Shared state
  const [mode, setMode] = useState<RecorderMode>('visit');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [pendingSave, setPendingSave] = useState(false);
  const [selectedDate, setSelectedDate] = useState('今日');
  const [stealthMode, setStealthMode] = useState(false);

  // Visit mode state
  const [tableId, setTableId] = useState('');

  // Meeting mode state
  const [meetingType, setMeetingType] = useState<MeetingType | ''>('');
  const [detailMeeting, setDetailMeeting] = useState<MeetingRecord | null>(null);

  // Refs
  const processingIdsRef = useRef<Set<string>>(new Set());
  const retryEffectRanRef = useRef(false);
  const pendingTableIdRef = useRef<string>('');
  const pendingMeetingTypeRef = useRef<MeetingType | ''>('');

  const { user } = useAuth();
  const restaurantId = user?.restaurantId;

  const [recorderState, recorderActions] = useAudioRecorder();
  const { isRecording, duration, audioBlob, error, analyserData } = recorderState;
  const { startRecording, stopRecording, resetRecording } = recorderActions;

  // Fetch active question template
  const { data: templateData } = useSWR<{ template: QuestionTemplate | null }>(
    restaurantId ? `/api/question-templates/active?restaurant_id=${restaurantId}` : null
  );
  const activeQuestions = templateData?.template?.questions ?? [];

  const dateParam = getDateString(selectedDate);

  // Both stores always initialized (hooks must not change between renders)
  const {
    recordings,
    saveRecording,
    updateRecording,
    deleteRecording,
    getRecordingsNeedingRetry,
  } = useRecordingStore(restaurantId, dateParam);

  const {
    meetings,
    saveMeeting,
    updateMeeting,
    deleteMeeting,
    getMeetingsNeedingRetry,
  } = useMeetingStore(restaurantId, dateParam);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2500);
  }, []);

  // Auto-retry pending visit records on page load
  useEffect(() => {
    const retryPending = async () => {
      const { processed } = await retryPendingFromDatabase((message) => {
        showToast(message, 'info');
      });
      if (processed > 0) {
        showToast(`已恢复处理 ${processed} 条录音`, 'success');
      }
    };
    retryPending();
  }, [showToast]);

  // Auto-retry interrupted uploads (visit + meeting)
  useEffect(() => {
    if (retryEffectRanRef.current) return;
    retryEffectRanRef.current = true;

    const retryInterrupted = async () => {
      // Retry visit recordings
      const visitRetry = getRecordingsNeedingRetry();
      const visitToRetry = visitRetry.filter(r => !processingIdsRef.current.has(r.id));
      if (visitToRetry.length > 0) {
        showToast(`发现 ${visitToRetry.length} 条未完成上传`, 'info');
        for (const recording of visitToRetry) {
          processingIdsRef.current.add(recording.id);
          processRecordingInBackground(recording, {
            onStatusChange: (id, status, data) => {
              updateRecording(id, { status, ...data });
              if (status === 'completed') {
                processingIdsRef.current.delete(id);
                showToast(`${recording.tableId} 桌录音恢复完成`, 'success');
              }
            },
            onError: (id, errorMsg) => {
              processingIdsRef.current.delete(id);
              updateRecording(id, { status: 'error', errorMessage: errorMsg });
            },
          }, restaurantId);
        }
      }

      // Retry meeting recordings
      const meetingRetry = getMeetingsNeedingRetry();
      const meetingToRetry = meetingRetry.filter(m => !processingIdsRef.current.has(m.id));
      if (meetingToRetry.length > 0) {
        for (const meeting of meetingToRetry) {
          processingIdsRef.current.add(meeting.id);
          processMeetingInBackground(meeting, {
            onStatusChange: (id, status, data) => {
              updateMeeting(id, { status, ...data });
              if (status === 'completed') {
                processingIdsRef.current.delete(id);
                showToast('例会录音恢复完成', 'success');
              }
            },
            onError: (id, errorMsg) => {
              processingIdsRef.current.delete(id);
              updateMeeting(id, { status: 'error', errorMessage: errorMsg });
            },
          }, restaurantId);
        }
      }
    };

    const timer = setTimeout(retryInterrupted, 1000);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Periodic cleanup of stale processingIdsRef entries
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      [...recordings, ...meetings].forEach(rec => {
        if (processingIdsRef.current.has(rec.id)) {
          if (rec.status === 'error' || rec.status === 'completed' || rec.status === 'processed') {
            processingIdsRef.current.delete(rec.id);
          }
        }
      });
    }, 10000);

    return () => clearInterval(cleanupInterval);
  }, [recordings, meetings]);

  // --- Visit mode handlers ---
  const handleVisitStart = useCallback(async () => {
    if (!tableId) {
      showToast('请先选择桌号', 'error');
      return;
    }
    await startRecording();
    setStealthMode(true);
  }, [tableId, startRecording, showToast]);

  const handleVisitStop = useCallback(async () => {
    pendingTableIdRef.current = tableId;
    stopRecording();
    setPendingSave(true);
    setTableId('');
  }, [stopRecording, tableId]);

  // --- Meeting mode handlers ---
  const handleMeetingStart = useCallback(async () => {
    if (!meetingType) {
      showToast('请先选择会议类型', 'error');
      return;
    }
    await startRecording();
  }, [meetingType, startRecording, showToast]);

  const handleMeetingStop = useCallback(async () => {
    pendingMeetingTypeRef.current = meetingType;
    stopRecording();
    setPendingSave(true);
    setMeetingType('');
  }, [stopRecording, meetingType]);

  // Unified start/stop based on mode
  const handleStart = mode === 'visit' ? handleVisitStart : handleMeetingStart;
  const handleStop = mode === 'visit' ? handleVisitStop : handleMeetingStop;

  // When audioBlob is ready after stopping, save and process
  useEffect(() => {
    if (!audioBlob || isRecording || !pendingSave) return;

    const savedTableId = pendingTableIdRef.current;
    const savedMeetingType = pendingMeetingTypeRef.current;

    // Visit mode save
    if (savedTableId) {
      setPendingSave(false);
      pendingTableIdRef.current = '';

      const processAsync = async () => {
        const recording = await saveRecording(savedTableId, duration, audioBlob);
        showToast(`${savedTableId} 桌录音已保存`, 'success');
        processingIdsRef.current.add(recording.id);
        resetRecording();

        processRecordingInBackground(recording, {
          onStatusChange: (id, status, data) => {
            updateRecording(id, { status, ...data });
            if (status === 'completed') {
              processingIdsRef.current.delete(id);
              showToast(`${savedTableId} 桌分析完成`, 'success');
            }
          },
          onError: (id, errorMsg) => {
            processingIdsRef.current.delete(id);
          },
        }, restaurantId);
      };
      processAsync();
      return;
    }

    // Meeting mode save
    if (savedMeetingType) {
      setPendingSave(false);
      pendingMeetingTypeRef.current = '';

      const MEETING_TYPE_LABELS: Record<MeetingType, string> = {
        pre_meal: '餐前会',
        daily_review: '每日复盘',
        weekly: '周例会',
        kitchen_meeting: '厨房会议',
        cross_store_review: '经营会',
        one_on_one: '店长沟通',
      };
      const label = MEETING_TYPE_LABELS[savedMeetingType];

      const processAsync = async () => {
        const meeting = await saveMeeting(savedMeetingType, duration, audioBlob);
        showToast(`${label}录音已保存`, 'success');
        processingIdsRef.current.add(meeting.id);
        resetRecording();

        processMeetingInBackground(meeting, {
          onStatusChange: (id, status, data) => {
            updateMeeting(id, { status, ...data });
            if (status === 'completed') {
              processingIdsRef.current.delete(id);
              showToast(`${label}分析完成`, 'success');
            }
          },
          onError: (id, errorMsg) => {
            processingIdsRef.current.delete(id);
          },
        }, restaurantId);
      };
      processAsync();
    }
  }, [audioBlob, isRecording, duration, pendingSave, saveRecording, saveMeeting, resetRecording, updateRecording, updateMeeting, showToast, restaurantId]);

  // Retry handlers
  const handleVisitRetry = useCallback((id: string) => {
    const recording = recordings.find(r => r.id === id);
    if (recording) {
      showToast('正在重试...', 'info');
      processRecordingInBackground(recording, {
        onStatusChange: (recId, status, data) => {
          updateRecording(recId, { status, ...data });
          if (status === 'completed') showToast('重试成功', 'success');
        },
        onError: (recId, errorMsg) => {
          showToast('重试失败', 'error');
        },
      }, restaurantId);
    }
  }, [recordings, updateRecording, showToast, restaurantId]);

  const handleMeetingRetry = useCallback((id: string) => {
    const meeting = meetings.find(m => m.id === id);
    if (meeting) {
      showToast('正在重试...', 'info');
      processMeetingInBackground(meeting, {
        onStatusChange: (recId, status, data) => {
          updateMeeting(recId, { status, ...data });
          if (status === 'completed') showToast('重试成功', 'success');
        },
        onError: (recId, errorMsg) => {
          showToast('重试失败', 'error');
        },
      }, restaurantId);
    }
  }, [meetings, updateMeeting, showToast, restaurantId]);

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Stealth Mode Overlay - fake WeChat interface */}
      <StealthOverlay visible={stealthMode} onDismiss={() => setStealthMode(false)} />

      {/* Meeting Detail Bottom Sheet */}
      <MeetingDetail meeting={detailMeeting} onClose={() => setDetailMeeting(null)} />

      {/* Header */}
      <header className="bg-white shadow-sm px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Mode Switcher */}
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            {([['visit', '桌访'], ['meeting', '例会']] as const).map(([m, label]) => (
              <button
                key={m}
                onClick={() => !isRecording && setMode(m)}
                disabled={isRecording}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  mode === m
                    ? 'bg-white text-gray-900 shadow-sm font-medium'
                    : 'text-gray-500 hover:text-gray-700'
                } ${isRecording ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">v{APP_VERSION}</span>
        </div>
        <div className="flex items-center gap-3">
          {/* Date Tabs */}
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
          <UserMenu />
        </div>
      </header>

      <main className="px-4 pt-4 pb-20">
        {/* Toast */}
        {toast && (
          <div
            className={`fixed top-16 left-4 right-4 p-3 rounded-xl text-center text-sm font-medium z-50 transition-all ${
              toast.type === 'success'
                ? 'bg-green-100 text-green-700'
                : toast.type === 'error'
                  ? 'bg-red-100 text-red-700'
                  : 'bg-blue-100 text-blue-700'
            }`}
          >
            {toast.message}
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm mb-4">
            {error}
          </div>
        )}

        {/* Motivation Banner - visible when not recording */}
        {!isRecording && (
          <div className="mb-6">
            <MotivationBanner
              restaurantId={restaurantId}
              userName={user?.employeeName}
            />
          </div>
        )}

        {/* Waveform Visualizer - only visible when recording */}
        {isRecording && (
          <div className="bg-white rounded-2xl shadow-sm p-4 mb-6">
            <WaveformVisualizer
              analyserData={analyserData}
              isRecording={isRecording}
            />
            <p className="text-center text-2xl font-mono text-gray-700 mt-3">
              {formatDuration(duration)}
            </p>
          </div>
        )}

        {/* Mode-specific content */}
        {mode === 'visit' ? (
          <>
            {/* === Action Group (tight spacing) === */}
            <div className="space-y-3">
              {/* 1. Table Selector */}
              <TableSelector
                value={tableId}
                onChange={setTableId}
                disabled={isRecording}
              />

              {/* 2. Record Button with Stealth Mode Toggle */}
              <div className="flex justify-center items-center gap-4 py-1">
                <RecordButton
                  isRecording={isRecording}
                  disabled={false}
                  onStart={handleStart}
                  onStop={handleStop}
                />
                {/* Stealth mode button - only show when recording */}
                {isRecording && (
                  <button
                    onClick={() => setStealthMode(true)}
                    className="w-12 h-12 rounded-full bg-green-500 text-white flex items-center justify-center shadow-lg hover:bg-green-600 transition-colors"
                    title="隐蔽模式"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {/* === Info Group (wider gap from action group) === */}
            <div className="mt-6 space-y-4">
              {/* 3. Question Prompt */}
              <QuestionPrompt
                questions={activeQuestions}
                visible={activeQuestions.length > 0}
              />

              {/* 4. Recording History */}
              <RecordingHistory
                recordings={recordings}
                onRetry={handleVisitRetry}
                onDelete={deleteRecording}
                title={selectedDate === '今日' ? '今日录音' : '昨日录音'}
              />
            </div>
          </>
        ) : (
          <>
            {/* === Action Group (tight spacing) === */}
            <div className="space-y-3">
              {/* Meeting Type Selector */}
              <MeetingTypeSelector
                value={meetingType}
                onChange={setMeetingType}
                disabled={isRecording}
              />

              {/* Context cards based on meeting type */}
              {meetingType === 'daily_review' && (
                <MeetingAgendaCard restaurantId={restaurantId} />
              )}
              {meetingType === 'pre_meal' && (
                <PreMealReminder restaurantId={restaurantId} />
              )}
              {meetingType === 'weekly' && (
                <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4">
                  <div className="flex items-start gap-3">
                    <span className="text-lg">📊</span>
                    <div>
                      <p className="text-sm font-medium text-gray-800">周例会录音</p>
                      <p className="text-xs text-gray-500 mt-1">将综合本周桌访数据生成周度分析，包括菜品趋势、服务改善点和下周重点</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Record Button (no stealth mode for meetings) */}
              <div className="flex justify-center py-1">
                <RecordButton
                  isRecording={isRecording}
                  disabled={!meetingType && !isRecording}
                  disabledHint="请先选择会议类型"
                  onStart={handleStart}
                  onStop={handleStop}
                />
              </div>
            </div>

            {/* === Info Group === */}
            <div className="mt-6">
              {/* Meeting History */}
              <MeetingHistory
                meetings={meetings}
                onRetry={handleMeetingRetry}
                onDelete={deleteMeeting}
                onViewDetail={setDetailMeeting}
                title={selectedDate === '今日' ? '今日例会' : '昨日例会'}
              />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
