// Chat Stream Hook - Handle streaming chat responses with session persistence
// v1.8 - Fix: build history BEFORE setMessages to avoid async state issues

import { useState, useCallback, useRef, useEffect } from 'react';
import { getAuthHeaders, useAuth } from '@/contexts/AuthContext';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
  thinkingStatus?: string;  // 显示思考步骤，如 "正在查询数据库..."
}

interface UseChatStreamReturn {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  sendMessage: (content: string) => Promise<void>;
  stopRequest: () => void;
  clearMessages: () => void;
}

const STORAGE_KEY = 'lingtin_chat_messages';
const WELCOME_MESSAGE: Message = {
  id: 'welcome',
  role: 'assistant',
  content: '你好！我是 Lingtin AI 助手。你可以问我任何关于桌访数据的问题，例如："上周客人对新上的鲈鱼有什么看法？"',
};

// Load messages from sessionStorage
function getStoredMessages(): Message[] {
  if (typeof window === 'undefined') return [WELCOME_MESSAGE];
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      const messages = JSON.parse(stored) as Message[];
      // Clear any streaming state from previous session
      return messages.map(msg => ({ ...msg, isStreaming: false }));
    }
    return [WELCOME_MESSAGE];
  } catch {
    return [WELCOME_MESSAGE];
  }
}

// Save messages to sessionStorage
function saveMessages(messages: Message[]) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  } catch {
    // Ignore storage errors
  }
}

export function useChatStream(): UseChatStreamReturn {
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  // Use ref to always get latest messages in callbacks (fixes stale closure bug)
  const messagesRef = useRef<Message[]>(messages);

  // Get user's restaurant ID from auth context
  const { user } = useAuth();
  const restaurantId = user?.restaurantId;

  // Keep messagesRef in sync with messages state
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Load messages from sessionStorage on mount
  useEffect(() => {
    const stored = getStoredMessages();
    setMessages(stored);
    setIsInitialized(true);
  }, []);

  // Save messages to sessionStorage when they change
  useEffect(() => {
    if (isInitialized) {
      saveMessages(messages);
    }
  }, [messages, isInitialized]);

  const sendMessage = useCallback(async (content: string) => {
    console.log('[useChatStream] sendMessage called with:', content);
    console.log('[useChatStream] isLoading:', isLoading);

    if (!content.trim() || isLoading) {
      console.log('[useChatStream] Early return - empty content or loading');
      return;
    }

    // Cancel any ongoing request
    if (abortControllerRef.current) {
      console.log('[useChatStream] Aborting previous request');
      abortControllerRef.current.abort();
    }

    // Build conversation history BEFORE adding new messages (to avoid async state issues)
    // Include all previous messages plus the current user message
    const previousMessages = messagesRef.current.filter(
      msg => msg.id !== 'welcome' && !msg.isStreaming && msg.content.trim()
    );
    const historyMessages = [
      ...previousMessages.slice(-9).map(msg => ({ role: msg.role, content: msg.content })),
      { role: 'user' as const, content }  // Include current message
    ];

    // Debug log: show how many messages are being sent
    console.log('========== CHAT HISTORY DEBUG ==========');
    console.log(`Total messages in history: ${historyMessages.length}`);
    historyMessages.forEach((msg, i) => {
      const preview = msg.content.length > 50 ? msg.content.slice(0, 50) + '...' : msg.content;
      console.log(`  [${i + 1}] ${msg.role}: "${preview}"`);
    });
    console.log('=========================================');

    const userMessageId = `user-${Date.now()}`;
    const assistantMessageId = `assistant-${Date.now()}`;

    // Add user message
    setMessages(prev => [...prev, {
      id: userMessageId,
      role: 'user',
      content,
    }]);

    setIsLoading(true);
    setError(null);

    // Add empty assistant message for streaming
    setMessages(prev => [...prev, {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      isStreaming: true,
    }]);

    try {
      abortControllerRef.current = new AbortController();

      console.log('[useChatStream] Sending fetch to /api/chat with history:', historyMessages.length);
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          message: content,
          restaurant_id: restaurantId,
          history: historyMessages,
        }),
        signal: abortControllerRef.current.signal,
      });

      console.log('[useChatStream] Response status:', response.status);
      console.log('[useChatStream] Response ok:', response.ok);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[useChatStream] Response error:', errorText);
        throw new Error('请求失败，请稍后重试');
      }

      const reader = response.body?.getReader();
      if (!reader) {
        console.error('[useChatStream] No reader available');
        throw new Error('无法读取响应');
      }

      console.log('[useChatStream] Starting to read stream');
      const decoder = new TextDecoder();
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          console.log('[useChatStream] Stream done');
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        console.log('[useChatStream] Received chunk:', chunk);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);

            if (data === '[DONE]') {
              console.log('[useChatStream] Received [DONE]');
              setMessages(prev => prev.map(msg =>
                msg.id === assistantMessageId
                  ? { ...msg, isStreaming: false }
                  : msg
              ));
              continue;
            }

            try {
              const parsed = JSON.parse(data);
              console.log('[useChatStream] Parsed data:', parsed);

              if (parsed.type === 'thinking') {
                // Update thinking status (shown while AI is processing)
                setMessages(prev => prev.map(msg =>
                  msg.id === assistantMessageId
                    ? { ...msg, thinkingStatus: parsed.content }
                    : msg
                ));
              } else if (parsed.type === 'tool_use') {
                // Tool is being used, show status
                const toolName = parsed.tool === 'query_database' ? '查询数据库' : parsed.tool;
                setMessages(prev => prev.map(msg =>
                  msg.id === assistantMessageId
                    ? { ...msg, thinkingStatus: `正在${toolName}...` }
                    : msg
                ));
              } else if (parsed.type === 'text') {
                // Clear thinking status when actual content arrives
                fullContent += parsed.content;
                setMessages(prev => prev.map(msg =>
                  msg.id === assistantMessageId
                    ? { ...msg, content: fullContent, thinkingStatus: undefined }
                    : msg
                ));
              } else if (parsed.type === 'error') {
                console.error('[useChatStream] Error from server:', parsed.content);
                throw new Error(parsed.content);
              }
            } catch (e) {
              // Skip invalid JSON lines
              if (data.trim()) {
                console.log('[useChatStream] Failed to parse:', data);
              }
            }
          }
        }
      }
    } catch (err) {
      console.error('[useChatStream] Catch block error:', err);

      if (err instanceof Error && err.name === 'AbortError') {
        console.log('[useChatStream] Request was aborted');
        return;
      }

      const errorMessage = err instanceof Error ? err.message : '发生未知错误';
      setError(errorMessage);

      // Update assistant message with error
      setMessages(prev => prev.map(msg =>
        msg.id === assistantMessageId
          ? { ...msg, content: `抱歉，${errorMessage}`, isStreaming: false }
          : msg
      ));
    } finally {
      console.log('[useChatStream] Finally block');
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [isLoading, restaurantId]);

  const clearMessages = useCallback(() => {
    // Cancel any ongoing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    setMessages([WELCOME_MESSAGE]);
    setError(null);
    setIsLoading(false);
  }, []);

  // Stop ongoing request without clearing messages
  const stopRequest = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    // Mark any streaming message as stopped
    setMessages(prev => prev.map(msg =>
      msg.isStreaming
        ? { ...msg, isStreaming: false, content: msg.content || '(已停止)' }
        : msg
    ));
    setIsLoading(false);
  }, []);

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    stopRequest,
    clearMessages,
  };
}
