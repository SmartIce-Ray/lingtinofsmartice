// Recorder Page - Store manager records table visits with database sync
// v2.6 - Added today/yesterday date selector for recording history

'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useAudioRecorder } from '@/hooks/useAudioRecorder';
import { useRecordingStore } from '@/hooks/useRecordingStore';
import { useAuth } from '@/contexts/AuthContext';
import { TableSelector } from '@/components/recorder/TableSelector';
import { WaveformVisualizer } from '@/components/recorder/WaveformVisualizer';
import { RecordButton } from '@/components/recorder/RecordButton';
import { RecordingHistory } from '@/components/recorder/RecordingHistory';
import { UserMenu } from '@/components/layout/UserMenu';
import { processRecordingInBackground, retryPendingFromDatabase } from '@/lib/backgroundProcessor';

// Format seconds to MM:SS
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Get start of day timestamp for a date selection
function getDateRange(selection: string): { start: number; end: number } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (selection === '昨日') {
    start.setDate(start.getDate() - 1);
  }
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.getTime(), end: end.getTime() };
}

export default function RecorderPage() {
  const [tableId, setTableId] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [pendingSave, setPendingSave] = useState(false);
  const [selectedDate, setSelectedDate] = useState('今日');

  const { user } = useAuth();
  const restaurantId = user?.restaurantId;

  const [recorderState, recorderActions] = useAudioRecorder();
  const { isRecording, duration, audioBlob, error, analyserData } = recorderState;
  const { startRecording, stopRecording, resetRecording } = recorderActions;

  // Pass restaurantId to sync with database
  const {
    recordings,
    saveRecording,
    updateRecording,
    deleteRecording,
    getRecordingsNeedingRetry,
  } = useRecordingStore(restaurantId);

  // Filter recordings by selected date
  const filteredRecordings = useMemo(() => {
    const { start, end } = getDateRange(selectedDate);
    return recordings.filter(rec => rec.timestamp >= start && rec.timestamp < end);
  }, [recordings, selectedDate]);

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
  useEffect(() => {
    const retryInterruptedUploads = async () => {
      const needRetry = getRecordingsNeedingRetry();
      if (needRetry.length === 0) return;

      showToast(`发现 ${needRetry.length} 条未完成上传`, 'info');

      for (const recording of needRetry) {
        processRecordingInBackground(recording, {
          onStatusChange: (id, status, data) => {
            updateRecording(id, { status, ...data });
            if (status === 'completed') {
              showToast(`${recording.tableId} 桌录音恢复完成`, 'success');
            }
          },
          onError: (id, errorMsg) => {
            console.error(`Recording ${id} retry failed:`, errorMsg);
          },
        }, restaurantId);
      }
    };

    // Delay to ensure recordings are loaded from localStorage
    const timer = setTimeout(retryInterruptedUploads, 1000);
    return () => clearTimeout(timer);
  }, [getRecordingsNeedingRetry, updateRecording, restaurantId, showToast]);

  // Handle recording start
  const handleStart = useCallback(async () => {
    if (!tableId) {
      showToast('请先选择桌号', 'error');
      return;
    }
    await startRecording();
  }, [tableId, startRecording, showToast]);

  // Handle recording stop
  const handleStop = useCallback(async () => {
    stopRecording();
    setPendingSave(true);
  }, [stopRecording]);

  // When audioBlob is ready after stopping, save and process
  useEffect(() => {
    if (audioBlob && !isRecording && tableId && pendingSave) {
      setPendingSave(false);

      const processAsync = async () => {
        // Step 1: Save locally immediately
        const recording = await saveRecording(tableId, duration, audioBlob);
        showToast(`${tableId} 桌录音已保存`, 'success');

        // Step 2: Reset for next recording
        const savedTableId = tableId;
        resetRecording();
        setTableId('');

        // Step 3: Process in background (silent)
        processRecordingInBackground(recording, {
          onStatusChange: (id, status, data) => {
            updateRecording(id, { status, ...data });
            // Show completion toast
            if (status === 'completed') {
              showToast(`${savedTableId} 桌分析完成`, 'success');
            }
          },
          onError: (id, errorMsg) => {
            console.error(`Recording ${id} failed:`, errorMsg);
          },
        }, restaurantId);
      };

      processAsync();
    }
  }, [audioBlob, isRecording, tableId, duration, pendingSave, saveRecording, resetRecording, updateRecording, showToast]);

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
      {/* Header */}
      <header className="bg-white shadow-sm px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">桌访录音</h1>
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

        {/* Record Button */}
        <div className="flex justify-center py-2">
          <RecordButton
            isRecording={isRecording}
            disabled={false}
            onStart={handleStart}
            onStop={handleStop}
          />
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
