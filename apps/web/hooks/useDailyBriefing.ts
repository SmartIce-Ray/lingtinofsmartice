// Daily Briefing Hook - Auto-trigger daily AI briefing on first visit
// v1.0 - Checks sessionStorage to avoid re-triggering within same day

import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { SendMessageOptions } from './useChatStream';

interface UseDailyBriefingOptions {
  sendMessage: (content: string, options?: SendMessageOptions) => Promise<void>;
  isLoading: boolean;
  isInitialized: boolean;
  messageCount: number; // Number of existing messages (to skip if already have history)
}

export function useDailyBriefing({
  sendMessage,
  isLoading,
  isInitialized,
  messageCount,
}: UseDailyBriefingOptions) {
  const { user } = useAuth();
  const hasSent = useRef(false);

  useEffect(() => {
    if (!isInitialized || isLoading || hasSent.current || !user) return;

    const roleCode = user.roleCode;
    const today = new Date().toISOString().slice(0, 10);
    const briefingKey = `lingtin_briefing_${roleCode}_${today}`;

    // Skip if already generated today or if there are existing messages
    if (sessionStorage.getItem(briefingKey) || messageCount > 0) return;

    // Mark as sent to prevent re-triggering
    hasSent.current = true;
    sessionStorage.setItem(briefingKey, '1');

    // Trigger briefing with hidden user message
    sendMessage('__DAILY_BRIEFING__', { hideUserMessage: true });
  }, [isInitialized, isLoading, user, messageCount, sendMessage]);
}
