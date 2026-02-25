// Chat Page - AI-powered analytics assistant with streaming support
// v2.4 - Dynamic personalized quick questions based on today's data
// v2.3 - Fixed: Wrap useSearchParams in Suspense boundary for Next.js 14 static build

'use client';

import { useState, useRef, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { useAuth } from '@/contexts/AuthContext';
import { useChatStream } from '@/hooks/useChatStream';
import { MarkdownRenderer } from '@/components/chat/MarkdownRenderer';
import { ThinkingIndicator } from '@/components/chat/ThinkingIndicator';
import { UserMenu } from '@/components/layout/UserMenu';
import { getDateForSelection } from '@/lib/date-utils';

// Wrapper component to handle Suspense boundary for useSearchParams
export default function ChatPage() {
  return (
    <Suspense fallback={<ChatLoadingFallback />}>
      <ChatContent />
    </Suspense>
  );
}

// Loading fallback component
function ChatLoadingFallback() {
  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-gray-50">
      <header className="bg-white shadow-sm px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">AI 智库</h1>
      </header>
      <div className="flex-1 flex items-center justify-center">
        <div className="text-gray-500">加载中...</div>
      </div>
    </div>
  );
}

// Generate personalized quick questions based on today's data
function usePersonalizedQuestions(): string[] {
  const { user } = useAuth();
  const restaurantId = user?.restaurantId;
  const date = getDateForSelection('今日');
  const params = restaurantId
    ? new URLSearchParams({ restaurant_id: restaurantId, date }).toString()
    : null;

  const { data: sentimentData } = useSWR<{
    negative_feedbacks?: { text: string; count: number }[];
    positive_percent?: number;
    negative_percent?: number;
  }>(params ? `/api/dashboard/sentiment-summary?${params}` : null);

  const { data: coverageData } = useSWR<{
    periods?: { coverage: number; period: string }[];
  }>(params ? `/api/dashboard/coverage?${params}` : null);

  return useMemo(() => {
    const questions: string[] = [];

    // Coverage-based question
    const lowCoverage = coverageData?.periods?.find(p => p.coverage < 80);
    if (lowCoverage) {
      questions.push(`今天${lowCoverage.period === 'lunch' ? '午市' : '晚市'}覆盖率为什么下降了？`);
    }

    // Negative feedback-based question
    const topNeg = sentimentData?.negative_feedbacks?.[0];
    if (topNeg && topNeg.count >= 2) {
      questions.push(`"${topNeg.text}"被多桌提到，有什么改进建议？`);
    }

    // Always include these as fallbacks
    questions.push('帮我优化桌访话术');
    questions.push('最近有哪些需要改进的地方');

    return questions.slice(0, 4);
  }, [sentimentData, coverageData]);
}

function ChatContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { messages, isLoading, isInitialized, sendMessage, retryMessage, stopRequest, clearMessages } = useChatStream();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const quickQuestions = usePersonalizedQuestions();

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handle pre-filled question from URL query parameter
  // Use sessionStorage to track processed queries to prevent re-send on refresh
  useEffect(() => {
    const queryQuestion = searchParams.get('q');
    if (!queryQuestion || !isInitialized || isLoading) return;

    // Check if we've already processed this exact query
    const processedKey = 'lingtin_processed_query';
    const lastProcessed = sessionStorage.getItem(processedKey);

    if (lastProcessed === queryQuestion) {
      // Already processed this query, just clean up the URL
      router.replace('/chat', { scroll: false });
      return;
    }

    // Mark as processed and send the message
    sessionStorage.setItem(processedKey, queryQuestion);
    router.replace('/chat', { scroll: false });
    sendMessage(queryQuestion);
  }, [searchParams, isLoading, isInitialized, sendMessage, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const message = input;
    setInput('');
    await sendMessage(message);
  };

  const handleQuickQuestion = async (question: string) => {
    if (isLoading) return;
    setInput('');
    await sendMessage(question);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">AI 智库</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={clearMessages}
            disabled={isLoading}
            className="text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50"
          >
            清空对话
          </button>
          <UserMenu />
        </div>
      </header>

      {/* Messages area with proper overflow handling */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                msg.role === 'user'
                  ? 'bg-primary-600 text-white'
                  : 'bg-white shadow-sm text-gray-900'
              }`}
            >
              {/* User messages: plain text, Assistant messages: markdown rendered */}
              {msg.role === 'user' ? (
                <div className="whitespace-pre-wrap">{msg.content}</div>
              ) : msg.isError ? (
                // Error message with retry button
                <div className="space-y-2">
                  <div className="text-red-600">{msg.content}</div>
                  <button
                    onClick={() => retryMessage(msg.id)}
                    disabled={isLoading}
                    className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded-lg hover:bg-red-200 disabled:opacity-50 transition-colors"
                  >
                    重试
                  </button>
                </div>
              ) : msg.thinkingStatus ? (
                // Show thinking status with animated indicator
                <ThinkingIndicator status={msg.thinkingStatus} />
              ) : msg.isStopped ? (
                // Stopped message - same style as ThinkingIndicator
                <div className="text-gray-500 text-sm">{msg.content}</div>
              ) : msg.content ? (
                <MarkdownRenderer content={msg.content} />
              ) : msg.isStreaming ? (
                // Initial loading state before any status arrives
                <ThinkingIndicator status="思考中" />
              ) : null}
              {msg.isStreaming && msg.content && (
                <span className="inline-block w-2 h-4 bg-primary-500 ml-1 animate-pulse" />
              )}
            </div>
          </div>
        ))}

        {/* Loading indicator removed - now integrated into message bubble */}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Questions - show as centered cards when empty, inline chips otherwise */}
      {messages.length === 0 ? (
        <div className="px-4 py-6 flex-shrink-0">
          <p className="text-center text-sm text-gray-400 mb-3">💡 今天可以问我</p>
          <div className="space-y-2 max-w-sm mx-auto">
            {quickQuestions.map((q) => (
              <button
                key={q}
                onClick={() => handleQuickQuestion(q)}
                disabled={isLoading}
                className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 text-left hover:border-primary-500 hover:bg-primary-50 disabled:opacity-50 transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="px-4 py-2 flex gap-2 overflow-x-auto flex-shrink-0 scrollbar-hide">
          {quickQuestions.map((q) => (
            <button
              key={q}
              onClick={() => handleQuickQuestion(q)}
              disabled={isLoading}
              className="px-3 py-1.5 bg-white border border-gray-200 rounded-full text-sm text-gray-600 whitespace-nowrap hover:border-primary-500 hover:text-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 bg-white border-t flex-shrink-0">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="问我任何关于桌访的问题..."
            disabled={isLoading}
            className="flex-1 px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-primary-500 disabled:bg-gray-50 disabled:cursor-not-allowed"
          />
          {isLoading ? (
            <button
              type="button"
              onClick={stopRequest}
              className="px-6 py-3 bg-gray-500 text-white rounded-xl font-medium hover:bg-gray-600 transition-colors"
            >
              停止
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="px-6 py-3 bg-primary-600 text-white rounded-xl font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              发送
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
