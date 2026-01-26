// ThinkingIndicator - Animated thinking status with fade transitions
// v1.2 - Simplified: removed bouncing dots, keep only text with animated ellipsis

'use client';

import { useState, useEffect, useRef } from 'react';

interface ThinkingIndicatorProps {
  status: string;
}

export function ThinkingIndicator({ status }: ThinkingIndicatorProps) {
  const [displayStatus, setDisplayStatus] = useState(status);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [dots, setDots] = useState('');
  const prevStatusRef = useRef(status);

  // Animated ellipsis effect
  useEffect(() => {
    const interval = setInterval(() => {
      setDots(prev => {
        if (prev === '...') return '';
        return prev + '.';
      });
    }, 400);

    return () => clearInterval(interval);
  }, []);

  // Fade transition when status changes
  useEffect(() => {
    if (status !== prevStatusRef.current) {
      // Start fade out
      setIsTransitioning(true);

      // After fade out, update text and fade in
      const timeout = setTimeout(() => {
        setDisplayStatus(status);
        setIsTransitioning(false);
      }, 200);

      prevStatusRef.current = status;
      return () => clearTimeout(timeout);
    }
  }, [status]);

  // Remove trailing dots from status for custom animation
  const statusWithoutDots = displayStatus.replace(/\.{1,3}$/, '');

  return (
    <div className="flex items-center">
      {/* Status text with fade transition and animated ellipsis */}
      <span
        className={`text-gray-500 text-sm transition-opacity duration-200 ${
          isTransitioning ? 'opacity-0' : 'opacity-100'
        }`}
      >
        {statusWithoutDots}
        <span className="inline-block w-6 text-left">{dots}</span>
      </span>
    </div>
  );
}
