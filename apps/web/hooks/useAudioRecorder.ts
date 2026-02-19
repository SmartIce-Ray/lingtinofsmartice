// Audio Recorder Hook - Handle browser audio recording
// v1.7 - Increased audioBitsPerSecond to 96kbps for better STT accuracy in noisy environments

'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

// MIME type detection with fallback chain for cross-browser compatibility
// Safari < 18.4 only supports audio/mp4, Chrome/Firefox support audio/webm
function getSupportedMimeType(): string | undefined {
  const types = [
    'audio/webm;codecs=opus', // Best quality: Chrome, Firefox, Safari 18.4+
    'audio/webm', // Fallback webm
    'audio/mp4', // Safari < 18.4, iOS Safari, WeChat iOS WebView
    'audio/ogg;codecs=opus', // Firefox alternative
  ];

  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) {
      console.log(`[useAudioRecorder] Using mimeType: ${type}`);
      return type;
    }
  }
  console.warn(
    '[useAudioRecorder] No preferred mimeType supported, using browser default'
  );
  return undefined;
}

export interface AudioRecorderState {
  isRecording: boolean;
  isPaused: boolean;
  duration: number;
  audioBlob: Blob | null;
  audioUrl: string | null;
  error: string | null;
  analyserData: Uint8Array | null;
}

export interface AudioRecorderActions {
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  pauseRecording: () => void;
  resumeRecording: () => void;
  resetRecording: () => void;
}

export function useAudioRecorder(): [AudioRecorderState, AudioRecorderActions] {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analyserData, setAnalyserData] = useState<Uint8Array | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);
  // Guard against duplicate calls using ref (survives across renders)
  const isStartingRef = useRef<boolean>(false);
  const isStoppingRef = useRef<boolean>(false);
  // Use refs for animation loop to avoid stale closure issues
  const isRecordingRef = useRef<boolean>(false);
  const isPausedRef = useRef<boolean>(false);
  // Throttle waveform updates for smoother animation
  const lastUpdateTimeRef = useRef<number>(0);
  const WAVEFORM_UPDATE_INTERVAL = 50; // Update every 50ms (20fps) instead of every frame (60fps)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  // Animation loop for waveform visualization (uses refs to avoid stale closures)
  // Uses getByteTimeDomainData for evenly distributed amplitude data (not frequency)
  // Throttled to 20fps for smoother, slower animation
  const startVisualization = useCallback(() => {
    const updateAnalyserData = (timestamp: number) => {
      if (analyserRef.current && isRecordingRef.current && !isPausedRef.current) {
        // Throttle updates to slow down the animation
        if (timestamp - lastUpdateTimeRef.current >= WAVEFORM_UPDATE_INTERVAL) {
          lastUpdateTimeRef.current = timestamp;
          const dataArray = new Uint8Array(analyserRef.current.fftSize);
          // Use time domain data (amplitude over time) instead of frequency data
          // This gives evenly distributed values across the array
          analyserRef.current.getByteTimeDomainData(dataArray);
          setAnalyserData(dataArray);
        }
        animationFrameRef.current = requestAnimationFrame(updateAnalyserData);
      }
    };
    animationFrameRef.current = requestAnimationFrame(updateAnalyserData);
  }, []);

  const startRecording = useCallback(async () => {
    // Guard against duplicate starts
    if (isStartingRef.current || mediaRecorderRef.current?.state === 'recording') {
      console.log('[useAudioRecorder] Ignoring duplicate start call');
      return;
    }
    isStartingRef.current = true;

    try {
      setError(null);
      audioChunksRef.current = [];

      // Request microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        },
      });

      streamRef.current = stream;

      // Set up Web Audio API for visualization
      audioContextRef.current = new AudioContext();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      source.connect(analyserRef.current);

      // Set up MediaRecorder with cross-browser MIME type detection
      const mimeType = getSupportedMimeType();
      // 96kbps balances file size and STT accuracy in noisy restaurant environments
      // Mobile Safari uses audio/mp4 (AAC) which defaults to 128kbps+ without this limit
      const recorderOptions: MediaRecorderOptions = {
        audioBitsPerSecond: 96000,
      };
      if (mimeType) {
        recorderOptions.mimeType = mimeType;
      }
      const mediaRecorder = new MediaRecorder(stream, recorderOptions);

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        // Use actual mimeType from recorder for proper format handling
        const blob = new Blob(audioChunksRef.current, {
          type: mediaRecorder.mimeType || 'audio/webm',
        });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        // Reset stopping guard after MediaRecorder fully stops
        isStoppingRef.current = false;
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(100); // Collect data every 100ms

      // Update refs BEFORE state (refs are synchronous)
      isRecordingRef.current = true;
      isPausedRef.current = false;

      setIsRecording(true);
      setIsPaused(false);
      startTimeRef.current = Date.now();

      // Start duration timer
      timerRef.current = setInterval(() => {
        setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);

      // Start visualization (now refs are already set)
      startVisualization();
    } catch (err) {
      setError(err instanceof Error ? err.message : '无法访问麦克风');
      console.error('Recording error:', err);
    } finally {
      isStartingRef.current = false;
    }
  }, [startVisualization]);

  const stopRecording = useCallback(() => {
    // Guard against duplicate stops using ref (more reliable than state)
    if (isStoppingRef.current) {
      console.log('[useAudioRecorder] Ignoring duplicate stop call');
      return;
    }

    const mediaRecorder = mediaRecorderRef.current;
    if (!mediaRecorder || mediaRecorder.state === 'inactive') {
      console.log('[useAudioRecorder] MediaRecorder not active, skipping stop');
      return;
    }

    isStoppingRef.current = true;

    // Update refs
    isRecordingRef.current = false;
    isPausedRef.current = false;

    // Stop MediaRecorder
    mediaRecorder.stop();
    setIsRecording(false);
    setIsPaused(false);

    // Stop all tracks to release microphone
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    // Clear timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    // Stop animation
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // Close audio context
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    setAnalyserData(null);
  }, []);

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording && !isPaused) {
      mediaRecorderRef.current.pause();
      isPausedRef.current = true;
      setIsPaused(true);

      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    }
  }, [isRecording, isPaused]);

  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording && isPaused) {
      mediaRecorderRef.current.resume();
      isPausedRef.current = false;
      setIsPaused(false);
      startVisualization();
    }
  }, [isRecording, isPaused, startVisualization]);

  const resetRecording = useCallback(() => {
    setAudioBlob(null);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    setAudioUrl(null);
    setDuration(0);
    setError(null);
    setAnalyserData(null);
    audioChunksRef.current = [];
  }, [audioUrl]);

  return [
    { isRecording, isPaused, duration, audioBlob, audioUrl, error, analyserData },
    { startRecording, stopRecording, pauseRecording, resumeRecording, resetRecording },
  ];
}
