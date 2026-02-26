// Admin Meeting Recording Page - Full-screen recording for management meetings
// Supports cross_store_review and one_on_one meeting types

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { useAuth } from '@/contexts/AuthContext';
import { useManagedScope } from '@/hooks/useManagedScope';
import { useAudioRecorder } from '@/hooks/useAudioRecorder';
import { useMeetingStore } from '@/hooks/useMeetingStore';
import { processMeetingInBackground } from '@/lib/backgroundProcessor';
import { RecordButton } from '@/components/recorder/RecordButton';
import { WaveformVisualizer } from '@/components/recorder/WaveformVisualizer';
import { MeetingHistory } from '@/components/recorder/MeetingHistory';
import { MeetingDetail } from '@/components/recorder/MeetingDetail';
import type { MeetingRecord, MeetingType } from '@/hooks/useMeetingStore';

// --- Types ---
interface BriefingProblem {
  severity: 'red' | 'yellow';
  category: string;
  restaurantName: string;
  title: string;
  metric?: string;
}

interface BriefingResponse {
  problems: BriefingProblem[];
}

interface Restaurant {
  id: string;
  restaurant_name: string;
}

interface RestaurantsResponse {
  restaurants: Restaurant[];
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// --- Toast ---
interface Toast {
  message: string;
  type: 'success' | 'error' | 'info';
}

export default function AdminMeetingRecordPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { managedIdsParam } = useManagedScope();
  const restaurantId = user?.restaurantId || '';

  // Store selection → derives meeting type
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const meetingType: MeetingType = selectedStoreId ? 'one_on_one' : 'cross_store_review';

  // Fetch restaurants for store dropdown (scoped by managed restaurants)
  const { data: restaurantsData } = useSWR<RestaurantsResponse>(`/api/dashboard/restaurants?_=1${managedIdsParam}`);
  const stores = restaurantsData?.restaurants || [];
  const selectedStore = stores.find(s => s.id === selectedStoreId);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [dropdownOpen]);

  // Toast
  const [toast, setToast] = useState<Toast | null>(null);
  const showToast = useCallback((message: string, type: Toast['type'] = 'info') => {
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

  // Briefing data for smart agenda
  const [agendaCollapsed, setAgendaCollapsed] = useState(false);
  const { data: briefingData } = useSWR<BriefingResponse>(
    `/api/dashboard/briefing?date=yesterday${managedIdsParam}`
  );
  const problems = briefingData?.problems || [];

  // Collapse agenda when recording starts
  useEffect(() => {
    if (isRecording) setAgendaCollapsed(true);
  }, [isRecording]);

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
      const meeting = await saveMeeting(meetingType, duration, audioBlob);
      showToast('会议录音已保存', 'success');
      processingIdsRef.current.add(meeting.id);
      resetRecording();

      processMeetingInBackground(meeting, {
        onStatusChange: (id, status, data) => {
          updateMeeting(id, { status, ...data });
          if (status === 'completed') {
            processingIdsRef.current.delete(id);
            showToast('会议分析完成', 'success');
          }
        },
        onError: (id) => {
          processingIdsRef.current.delete(id);
        },
      }, restaurantId);
    };
    processAsync();
  }, [audioBlob, isRecording, duration, pendingSave, meetingType, saveMeeting, resetRecording, updateMeeting, showToast, restaurantId]);

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
            }
          },
          onError: (id) => {
            processingIdsRef.current.delete(id);
          },
        }, restaurantId);
      }
    }
  }, [getMeetingsNeedingRetry, updateMeeting, showToast, restaurantId]);

  // Handle retry
  const handleRetry = useCallback((id: string) => {
    const meeting = meetings.find(m => m.id === id);
    if (!meeting) return;
    processingIdsRef.current.add(id);
    processMeetingInBackground(meeting, {
      onStatusChange: (mid, status, data) => {
        updateMeeting(mid, { status, ...data });
        if (status === 'completed') {
          processingIdsRef.current.delete(mid);
          showToast('重试成功', 'success');
        }
      },
      onError: (mid) => {
        processingIdsRef.current.delete(mid);
      },
    }, restaurantId);
  }, [meetings, updateMeeting, showToast, restaurantId]);

  // Handle delete
  const handleDelete = useCallback(async (id: string) => {
    await deleteMeeting(id);
    showToast('已删除', 'info');
  }, [deleteMeeting, showToast]);

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      {/* Header */}
      <header className="bg-white shadow-sm px-4 py-3 flex items-center justify-between">
        <button
          onClick={() => router.push('/admin/meetings')}
          className="flex items-center gap-1 text-gray-600 hover:text-gray-900"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          <span className="text-sm">返回</span>
        </button>

        {/* Store Dropdown */}
        <div ref={dropdownRef} className="relative">
          <button
            onClick={() => !isRecording && setDropdownOpen(!dropdownOpen)}
            disabled={isRecording}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${
              selectedStoreId
                ? 'bg-teal-100 text-teal-700'
                : 'bg-indigo-100 text-indigo-700'
            } ${isRecording ? 'opacity-50' : ''}`}
          >
            <span>
              {selectedStoreId
                ? `店长沟通 · ${selectedStore?.restaurant_name || ''}`
                : '经营会 · 全部门店'}
            </span>
            <svg className={`w-3.5 h-3.5 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Dropdown Panel */}
          {dropdownOpen && (
            <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50 overflow-hidden">
              {/* Default: 经营会 */}
              <button
                onClick={() => { setSelectedStoreId(null); setDropdownOpen(false); }}
                className={`w-full px-3 py-2.5 flex items-center gap-2 text-sm transition-colors ${
                  !selectedStoreId ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                {!selectedStoreId && (
                  <svg className="w-4 h-4 text-indigo-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
                {selectedStoreId && <span className="w-4" />}
                <span>经营会（全部门店）</span>
              </button>

              {/* Divider */}
              {stores.length > 0 && <div className="border-t border-gray-100 my-1" />}

              {/* Store list */}
              {stores.map(store => (
                <button
                  key={store.id}
                  onClick={() => { setSelectedStoreId(store.id); setDropdownOpen(false); }}
                  className={`w-full px-3 py-2.5 flex items-center gap-2 text-sm transition-colors ${
                    selectedStoreId === store.id ? 'bg-teal-50 text-teal-700 font-medium' : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {selectedStoreId === store.id ? (
                    <svg className="w-4 h-4 text-teal-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <span className="w-4" />
                  )}
                  <span>{store.restaurant_name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      <div className="px-4 pt-4 space-y-4">
        {/* Smart Agenda Card - based on briefing problems */}
        {problems.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div
              className="px-4 py-3 flex items-center justify-between cursor-pointer"
              onClick={() => setAgendaCollapsed(!agendaCollapsed)}
            >
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                <span className="text-sm font-semibold text-gray-900">
                  智能议题 · {problems.length} 项关注
                </span>
              </div>
              <svg
                className={`w-4 h-4 text-gray-400 transition-transform ${agendaCollapsed ? '' : 'rotate-180'}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
            {!agendaCollapsed && (
              <div className="px-4 pb-3 space-y-2">
                {problems.slice(0, 5).map((p, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <span className={`w-1.5 h-1.5 mt-1.5 rounded-full flex-shrink-0 ${
                      p.severity === 'red' ? 'bg-red-500' : 'bg-amber-400'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-700">{p.title}</p>
                      <p className="text-xs text-gray-400">
                        {p.restaurantName}
                        {p.metric && <> · {p.metric}</>}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Waveform + Recording Controls */}
        <div className="bg-white rounded-2xl shadow-sm p-6 flex flex-col items-center gap-4">
          {/* Duration display */}
          {isRecording && (
            <div className="text-2xl font-mono text-gray-900 tabular-nums">
              {formatDuration(duration)}
            </div>
          )}

          {/* Waveform */}
          <div className="w-full h-20">
            <WaveformVisualizer
              analyserData={analyserData}
              isRecording={isRecording}
            />
          </div>

          {/* Record Button */}
          <RecordButton
            isRecording={isRecording}
            onStart={handleStart}
            onStop={handleStop}
          />

          {!isRecording && (
            <p className="text-xs text-gray-400">
              {selectedStoreId
                ? `点击开始录制与${selectedStore?.restaurant_name || ''}的沟通`
                : '点击开始录制经营会'}
            </p>
          )}
        </div>

        {/* My Meeting History */}
        {meetings.length > 0 && (
          <div>
            <MeetingHistory
              meetings={meetings}
              onRetry={handleRetry}
              onDelete={handleDelete}
              onViewDetail={setSelectedMeeting}
              title="我的会议记录"
            />
          </div>
        )}
      </div>

      {/* Meeting Detail Bottom Sheet */}
      <MeetingDetail
        meeting={selectedMeeting}
        onClose={() => setSelectedMeeting(null)}
      />

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full text-sm font-medium shadow-lg transition-all ${
          toast.type === 'success' ? 'bg-green-600 text-white' :
          toast.type === 'error' ? 'bg-red-600 text-white' :
          'bg-gray-800 text-white'
        }`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
