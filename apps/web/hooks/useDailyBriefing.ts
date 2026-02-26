// Daily Briefing Hook - Auto-trigger daily AI briefing on first visit
// v1.1 - Don't set sessionStorage flag eagerly; rely on messageCount to skip

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

    // Skip if there are existing messages (briefing already completed or user has history)
    if (messageCount > 0) return;

    // Mark as sent in this session to prevent re-triggering on re-renders
    hasSent.current = true;

    // Trigger briefing with hidden user message
    sendMessage('__DAILY_BRIEFING__', { hideUserMessage: true });
  }, [isInitialized, isLoading, user, messageCount, sendMessage]);
}
