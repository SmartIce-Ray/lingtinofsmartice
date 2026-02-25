// Record Button Component - Click to toggle recording
// v1.1 - Simplified to use only onClick, removed duplicate touch/mouse handlers

'use client';

import { useCallback, useRef } from 'react';

interface RecordButtonProps {
  isRecording: boolean;
  disabled?: boolean;
  disabledHint?: string;
  onStart: () => void;
  onStop: () => void;
}

export function RecordButton({
  isRecording,
  disabled = false,
  disabledHint,
  onStart,
  onStop,
}: RecordButtonProps) {
  // Debounce to prevent rapid double-clicks
  const lastClickRef = useRef<number>(0);

  const handleClick = useCallback(() => {
    if (disabled) return;

    // Debounce: ignore clicks within 300ms of last click
    const now = Date.now();
    if (now - lastClickRef.current < 300) {
      console.log('[RecordButton] Ignoring rapid click');
      return;
    }
    lastClickRef.current = now;

    if (isRecording) {
      onStop();
    } else {
      onStart();
    }
  }, [disabled, isRecording, onStart, onStop]);

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Pulsing ring animation */}
      <div className="relative">
        {isRecording && (
          <>
            <div className="absolute inset-0 w-28 h-28 bg-primary-400 rounded-full animate-pulse-ring pointer-events-none" />
            <div
              className="absolute inset-0 w-28 h-28 bg-primary-300 rounded-full animate-pulse-ring pointer-events-none"
              style={{ animationDelay: '0.5s' }}
            />
          </>
        )}

        {/* Main button */}
        <button
          onClick={handleClick}
          disabled={disabled}
          className={`relative w-28 h-28 rounded-full flex items-center justify-center shadow-lg transition-all duration-200 ${
            isRecording
              ? 'bg-primary-700 scale-110'
              : 'bg-primary-600 hover:bg-primary-700'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : 'active:scale-95'}`}
        >
          {isRecording ? (
            // Stop icon (square)
            <div className="w-8 h-8 bg-white rounded-sm" />
          ) : (
            // Microphone icon
            <svg className="w-12 h-12 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
            </svg>
          )}
        </button>
      </div>

      {/* Help text */}
      <p className={`text-sm ${disabled ? 'text-gray-400' : 'text-gray-500'}`}>
        {disabled && disabledHint ? disabledHint : isRecording ? '点击停止录音' : '点击开始录音'}
      </p>
    </div>
  );
}
