// Chat Stream Hook - Handle streaming chat responses with session persistence
// v2.3 - Changed: Direct backend API calls (removed Next.js proxy layer)
// v2.2 - Fixed: Clear thinkingStatus when stopping request, show "被打断" message
// v2.1 - Exposed isInitialized to fix race condition with URL query parameters
// v2.0 - Added retry functionality for failed messages

import { useState, useCallback, useRef, useEffect } from 'react';
import { getAuthHeaders, useAuth } from '@/contexts/AuthContext';
import { getApiUrl } from '@/lib/api';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
  thinkingStatus?: string;  // 显示思考步骤，如 "正在查询数据库..."
  isError?: boolean;        // 标记错误消息，显示重试按钮
  isStopped?: boolean;      // 标记被用户停止的消息，显示灰色
  originalQuestion?: string; // 保存原始问题用于重试
}

interface UseChatStreamReturn {
  messages: Message[];
  isLoading: boolean;
  isInitialized: boolean;  // True when messages have been loaded from storage
  error: string | null;
  sendMessage: (content: string) => Promise<void>;
  retryMessage: (messageId: string) => Promise<void>;
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
    if (!content.trim() || isLoading) {
      return;
    }

    // Cancel any ongoing request
    if (abortControllerRef.current) {
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

      const response = await fetch(getApiUrl('api/chat/message'), {
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

      if (!response.ok) {
        throw new Error('请求失败，请稍后重试');
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('无法读取响应');
      }

      const decoder = new TextDecoder();
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);

            if (data === '[DONE]') {
              setMessages(prev => prev.map(msg =>
                msg.id === assistantMessageId
                  ? { ...msg, isStreaming: false }
                  : msg
              ));
              continue;
            }

            try {
              const parsed = JSON.parse(data);

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
                throw new Error(parsed.content);
              }
            } catch (e) {
              // Skip invalid JSON lines
            }
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }

      const errorMessage = err instanceof Error ? err.message : '发生未知错误';
      setError(errorMessage);

      // Update assistant message with error and store original question for retry
      setMessages(prev => prev.map(msg =>
        msg.id === assistantMessageId
          ? {
              ...msg,
              content: `抱歉，${errorMessage}`,
              isStreaming: false,
              isError: true,
              originalQuestion: content,
            }
          : msg
      ));
    } finally {
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
    // Mark any streaming message as stopped and clear thinking status
    setMessages(prev => prev.map(msg =>
      msg.isStreaming
        ? { ...msg, isStreaming: false, thinkingStatus: undefined, isStopped: true, content: msg.content || '停止了思考。' }
        : msg
    ));
    setIsLoading(false);
  }, []);

  // Retry a failed message - removes the error message and its user question, then resends
  const retryMessage = useCallback(async (messageId: string) => {
    const errorMsg = messagesRef.current.find(m => m.id === messageId);
    if (!errorMsg?.originalQuestion || isLoading) return;

    const question = errorMsg.originalQuestion;

    // Remove the failed assistant message and its preceding user message
    setMessages(prev => {
      const errorIndex = prev.findIndex(m => m.id === messageId);
      if (errorIndex === -1) return prev;
      // Remove both the user message (errorIndex - 1) and the error message (errorIndex)
      return prev.filter((_, i) => i !== errorIndex && i !== errorIndex - 1);
    });

    // Wait for state update, then resend
    setTimeout(() => {
      sendMessage(question);
    }, 50);
  }, [isLoading, sendMessage]);

  return {
    messages,
    isLoading,
    isInitialized,
    error,
    sendMessage,
    retryMessage,
    stopRequest,
    clearMessages,
  };
}
