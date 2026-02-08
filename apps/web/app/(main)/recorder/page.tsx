// Recorder Page - Store manager records table visits with database sync
// v3.2 - Added date parameter support for viewing historical recordings

'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useAudioRecorder } from '@/hooks/useAudioRecorder';
import { useRecordingStore } from '@/hooks/useRecordingStore';
import { useAuth } from '@/contexts/AuthContext';
import { TableSelector } from '@/components/recorder/TableSelector';
import { WaveformVisualizer } from '@/components/recorder/WaveformVisualizer';
import { RecordButton } from '@/components/recorder/RecordButton';
import { RecordingHistory } from '@/components/recorder/RecordingHistory';
import { StealthOverlay } from '@/components/recorder/StealthOverlay';
import { UserMenu } from '@/components/layout/UserMenu';
import { APP_VERSION } from '@/components/layout/UpdatePrompt';
import { processRecordingInBackground, retryPendingFromDatabase } from '@/lib/backgroundProcessor';

// Format seconds to MM:SS
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Get date string in YYYY-MM-DD format for API (China timezone)
function getDateString(selection: string): string | undefined {
  if (selection === '今日') return undefined; // Use default (today)
  // Use China timezone (UTC+8) for date calculation
  const now = new Date();
  const chinaOffset = 8 * 60; // UTC+8 in minutes
  const localOffset = now.getTimezoneOffset();
  const chinaTime = new Date(now.getTime() + (chinaOffset + localOffset) * 60 * 1000);
  if (selection === '昨日') {
    chinaTime.setDate(chinaTime.getDate() - 1);
  }
  // Format as YYYY-MM-DD without using toISOString (which converts back to UTC)
  const year = chinaTime.getFullYear();
  const month = String(chinaTime.getMonth() + 1).padStart(2, '0');
  const day = String(chinaTime.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function RecorderPage() {
  const [tableId, setTableId] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [pendingSave, setPendingSave] = useState(false);
  const [selectedDate, setSelectedDate] = useState('今日');
  const [stealthMode, setStealthMode] = useState(false);

  // Track recordings currently being processed to prevent duplicate processing
  const processingIdsRef = useRef<Set<string>>(new Set());
  // Track if retry effect has already run (only run once on mount)
  const retryEffectRanRef = useRef(false);
  // Store tableId when stopping recording (for use in save effect)
  const pendingTableIdRef = useRef<string>('');

  const { user } = useAuth();
  const restaurantId = user?.restaurantId;

  const [recorderState, recorderActions] = useAudioRecorder();
  const { isRecording, duration, audioBlob, error, analyserData } = recorderState;
  const { startRecording, stopRecording, resetRecording } = recorderActions;

  // Pass restaurantId and date to sync with database
  const dateParam = getDateString(selectedDate);
  const {
    recordings,
    isLoading: recordingsLoading,
    saveRecording,
    updateRecording,
    deleteRecording,
    getRecordingsNeedingRetry,
  } = useRecordingStore(restaurantId, dateParam);

  // No need to filter locally - recordings are already filtered by date from API
  const filteredRecordings = recordings;

  // Show toast message - defined early so it can be used in useEffects
  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2500);
  }, []);

  // Auto-retry pending records from database on page load
  // This recovers recordings that were interrupted by page refresh
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

  // Auto-retry interrupted uploads (uploading/saved status with audioData)
  // This recovers recordings that were interrupted during upload
  // Only runs ONCE on mount to avoid race conditions with new recordings
  useEffect(() => {
    // Only run once on mount
    if (retryEffectRanRef.current) return;
    retryEffectRanRef.current = true;

    const retryInterruptedUploads = async () => {
      const needRetry = getRecordingsNeedingRetry();
      // Filter out recordings that are already being processed
      const toRetry = needRetry.filter(r => !processingIdsRef.current.has(r.id));
      if (toRetry.length === 0) return;

      showToast(`发现 ${toRetry.length} 条未完成上传`, 'info');

      for (const recording of toRetry) {
        // Mark as processing to prevent duplicate processing
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
            console.error(`Recording ${id} retry failed:`, errorMsg);
          },
        }, restaurantId);
      }
    };

    // Delay to ensure recordings are loaded from localStorage
    const timer = setTimeout(retryInterruptedUploads, 1000);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Periodic cleanup of stale processingIdsRef entries
  // This prevents recordings from getting stuck if backend fails silently
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      recordings.forEach(rec => {
        // If marked as processing in frontend tracker but DB shows terminal state
        if (processingIdsRef.current.has(rec.id)) {
          if (rec.status === 'error' || rec.status === 'completed' || rec.status === 'processed') {
            processingIdsRef.current.delete(rec.id);
          }
        }
      });
    }, 10000); // Check every 10 seconds

    return () => clearInterval(cleanupInterval);
  }, [recordings]);

  // Handle recording start - show stealth overlay after starting
  const handleStart = useCallback(async () => {
    if (!tableId) {
      showToast('请先选择桌号', 'error');
      return;
    }
    await startRecording();
    setStealthMode(true);
  }, [tableId, startRecording, showToast]);

  // Exit stealth mode (called when user taps the overlay)
  const handleExitStealth = useCallback(() => {
    setStealthMode(false);
  }, []);

  // Handle recording stop - immediately clear table selection for better UX
  const handleStop = useCallback(async () => {
    // Save current tableId before clearing UI
    pendingTableIdRef.current = tableId;
    stopRecording();
    setPendingSave(true);
    // Immediately clear table selection UI
    setTableId('');
  }, [stopRecording, tableId]);

  // When audioBlob is ready after stopping, save and process
  useEffect(() => {
    // Use pendingTableIdRef since tableId is cleared immediately on stop
    const savedTableId = pendingTableIdRef.current;
    if (audioBlob && !isRecording && savedTableId && pendingSave) {
      setPendingSave(false);
      pendingTableIdRef.current = ''; // Clear the ref after use

      const processAsync = async () => {
        // Step 1: Save locally immediately
        const recording = await saveRecording(savedTableId, duration, audioBlob);
        showToast(`${savedTableId} 桌录音已保存`, 'success');

        // Step 2: Mark as processing to prevent duplicate processing by retry effect
        processingIdsRef.current.add(recording.id);

        // Step 3: Reset recorder state for next recording
        resetRecording();

        // Step 4: Process in background (silent)
        processRecordingInBackground(recording, {
          onStatusChange: (id, status, data) => {
            updateRecording(id, { status, ...data });
            // Show completion toast
            if (status === 'completed') {
              processingIdsRef.current.delete(id);
              showToast(`${savedTableId} 桌分析完成`, 'success');
            }
          },
          onError: (id, errorMsg) => {
            processingIdsRef.current.delete(id);
            console.error(`Recording ${id} failed:`, errorMsg);
          },
        }, restaurantId);
      };

      processAsync();
    }
  }, [audioBlob, isRecording, duration, pendingSave, saveRecording, resetRecording, updateRecording, showToast, restaurantId]);

  // Retry failed recording
  const handleRetry = useCallback((id: string) => {
    const recording = recordings.find(r => r.id === id);
    if (recording) {
      showToast('正在重试...', 'info');
      processRecordingInBackground(recording, {
        onStatusChange: (recId, status, data) => {
          updateRecording(recId, { status, ...data });
          if (status === 'completed') {
            showToast('重试成功', 'success');
          }
        },
        onError: (recId, errorMsg) => {
          showToast('重试失败', 'error');
          console.error(`Recording ${recId} retry failed:`, errorMsg);
        },
      }, restaurantId);
    }
  }, [recordings, updateRecording, showToast]);

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Stealth Mode Overlay - fake WeChat interface */}
      <StealthOverlay visible={stealthMode} onDismiss={handleExitStealth} />

      {/* Header */}
      <header className="bg-white shadow-sm px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold text-gray-900">桌访录音</h1>
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

      <main className="p-4 space-y-4">
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
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Waveform Visualizer */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <WaveformVisualizer
            analyserData={analyserData}
            isRecording={isRecording}
          />
          <p className="text-center text-2xl font-mono text-gray-700 mt-4">
            {formatDuration(duration)}
          </p>
        </div>

        {/* Table Selector */}
        <TableSelector
          value={tableId}
          onChange={setTableId}
          disabled={isRecording}
        />

        {/* Record Button with Stealth Mode Toggle */}
        <div className="flex justify-center items-center gap-4 py-2">
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
              {/* WeChat icon */}
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 01.213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 00.167-.054l1.903-1.114a.864.864 0 01.717-.098 10.16 10.16 0 002.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 01-1.162 1.178A1.17 1.17 0 014.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 01-1.162 1.178 1.17 1.17 0 01-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 01.598.082l1.584.926a.272.272 0 00.14.045c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.582.582 0 01-.023-.156.49.49 0 01.201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-6.656-6.088V8.89c-.135-.01-.269-.03-.406-.03zm-2.53 3.274c.535 0 .969.44.969.982a.976.976 0 01-.969.983.976.976 0 01-.969-.983c0-.542.434-.982.97-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 01-.969.983.976.976 0 01-.969-.983c0-.542.434-.982.969-.982z"/>
              </svg>
            </button>
          )}
        </div>

        {/* Recording History */}
        <RecordingHistory
          recordings={filteredRecordings}
          onRetry={handleRetry}
          onDelete={deleteRecording}
          title={selectedDate === '今日' ? '今日录音' : '昨日录音'}
        />
      </main>
    </div>
  );
}
