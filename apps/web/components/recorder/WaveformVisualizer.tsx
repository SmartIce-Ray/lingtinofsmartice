// Waveform Visualizer Component - Display audio waveform animation
// v1.4 - Fixed: use time domain data (amplitude) for evenly distributed bars across canvas

'use client';

import { useRef, useEffect } from 'react';

interface WaveformVisualizerProps {
  analyserData: Uint8Array | null;
  isRecording: boolean;
  isPaused?: boolean;
}

export function WaveformVisualizer({
  analyserData,
  isRecording,
  isPaused = false,
}: WaveformVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Draw static flat line when not recording
  useEffect(() => {
    if (isRecording) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    // Clear canvas
    ctx.fillStyle = '#f9fafb';
    ctx.fillRect(0, 0, rect.width, rect.height);

    // Draw static flat line
    ctx.strokeStyle = '#d1d5db';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, rect.height / 2);
    ctx.lineTo(rect.width, rect.height / 2);
    ctx.stroke();
  }, [isRecording]);

  // Recording waveform visualization - bars follow audio volume
  useEffect(() => {
    if (!isRecording || !analyserData) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    // Clear canvas
    ctx.fillStyle = '#f9fafb';
    ctx.fillRect(0, 0, rect.width, rect.height);

    // Draw waveform bars based on audio data (time domain - amplitude)
    const barCount = 32;
    const barGap = 4;
    const totalGaps = (barCount - 1) * barGap;
    const barWidth = (rect.width - totalGaps) / barCount;
    const maxBarHeight = rect.height * 0.8;
    const centerY = rect.height / 2;

    // Sample analyser data evenly across the full array
    const step = Math.floor(analyserData.length / barCount);

    for (let i = 0; i < barCount; i++) {
      const dataIndex = i * step;
      const value = analyserData[dataIndex] || 128;

      // Time domain data: 128 is silence, deviation from 128 is amplitude
      // Calculate absolute deviation from center (0-128 range)
      const deviation = Math.abs(value - 128);
      const normalizedValue = deviation / 128;

      // Bar height follows audio amplitude
      const barHeight = Math.max(normalizedValue * maxBarHeight, 4);

      // Position bars evenly across the full width
      const x = i * (barWidth + barGap);
      const y = centerY - barHeight / 2;

      // Red color, intensity based on volume
      const hue = 0;
      const saturation = isPaused ? 20 : 70 + normalizedValue * 30;
      const lightness = isPaused ? 70 : 50 + normalizedValue * 10;

      ctx.fillStyle = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barHeight, 2);
      ctx.fill();
    }
  }, [analyserData, isRecording, isPaused]);

  return (
    <div className={`relative w-full bg-gray-50 rounded-xl overflow-hidden transition-all duration-300 ${isRecording ? 'h-32' : 'h-8'}`}>
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ width: '100%', height: '100%' }}
      />
      {isRecording && isPaused && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/50">
          <span className="text-gray-500 text-sm">已暂停</span>
        </div>
      )}
    </div>
  );
}
