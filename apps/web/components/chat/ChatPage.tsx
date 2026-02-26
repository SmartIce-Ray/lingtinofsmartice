// ChatPage - Unified chat page component for all roles
// v1.0 - Shared by manager, admin, and chef with role-specific configuration

'use client';

import { useState, useRef, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useChatStream } from '@/hooks/useChatStream';
import { useDailyBriefing } from '@/hooks/useDailyBriefing';
import { MarkdownRenderer } from '@/components/chat/MarkdownRenderer';
import { ThinkingIndicator } from '@/components/chat/ThinkingIndicator';
import { UserMenu } from '@/components/layout/UserMenu';

export interface ChatPageConfig {
  role: 'manager' | 'admin' | 'chef';
  headerTitle: string;
  placeholder: string;
  fallbackQuickQuestions: string[];
  chatBasePath: string; // For URL cleanup, e.g. '/chat', '/admin/chat'
}

interface ChatPageProps {
  config: ChatPageConfig;
}

function ChatLoadingFallback({ title }: { title: string }) {
  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-gray-50">
      <header className="bg-white shadow-sm px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
      </header>
      <div className="flex-1 flex items-center justify-center">
        <div className="text-gray-500">加载中...</div>
      </div>
    </div>
  );
}

export default function ChatPage({ config }: ChatPageProps) {
  return (
    <Suspense fallback={<ChatLoadingFallback title={config.headerTitle} />}>
      <ChatContent config={config} />
    </Suspense>
  );
}

function ChatContent({ config }: ChatPageProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { messages, isLoading, isInitialized, sendMessage, retryMessage, stopRequest, clearMessages } = useChatStream();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-trigger daily briefing
  const { reset: resetBriefing } = useDailyBriefing({
    sendMessage,
    isLoading,
    isInitialized,
    messageCount: messages.length,
  });

  // All messages are visible (briefing triggers use hideUserMessage, so they're never added)
  const visibleMessages = messages;

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handle pre-filled question from URL query parameter
  useEffect(() => {
    const queryQuestion = searchParams.get('q');
    if (!queryQuestion || !isInitialized || isLoading) return;

    const processedKey = 'lingtin_processed_query';
    const lastProcessed = sessionStorage.getItem(processedKey);

    if (lastProcessed === queryQuestion) {
      router.replace(config.chatBasePath, { scroll: false });
      return;
    }

    sessionStorage.setItem(processedKey, queryQuestion);
    router.replace(config.chatBasePath, { scroll: false });
    sendMessage(queryQuestion);
  }, [searchParams, isLoading, isInitialized, sendMessage, router, config.chatBasePath]);

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
        <h1 className="text-lg font-semibold text-gray-900">{config.headerTitle}</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => { resetBriefing(); clearMessages(); }}
            disabled={isLoading}
            className="text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50"
          >
            清空对话
          </button>
          <UserMenu />
        </div>
      </header>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
        {visibleMessages.map((msg) => (
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
              {msg.role === 'user' ? (
                <div className="whitespace-pre-wrap">{msg.content}</div>
              ) : msg.isError ? (
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
                <ThinkingIndicator status={msg.thinkingStatus} />
              ) : msg.isStopped ? (
                <div className="text-gray-500 text-sm">{msg.content}</div>
              ) : msg.content ? (
                <MarkdownRenderer
                  content={msg.content}
                  onQuickQuestion={handleQuickQuestion}
                />
              ) : msg.isStreaming ? (
                <ThinkingIndicator status="思考中" />
              ) : null}
              {msg.isStreaming && msg.content && (
                <span className="inline-block w-2 h-4 bg-primary-500 ml-1 animate-pulse" />
              )}
            </div>
          </div>
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Questions - show when no messages */}
      {visibleMessages.length === 0 && !isLoading ? (
        <div className="px-4 py-6 flex-shrink-0">
          <p className="text-center text-sm text-gray-400 mb-3">可以问我</p>
          <div className="space-y-2 max-w-sm mx-auto">
            {config.fallbackQuickQuestions.map((q) => (
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
      ) : visibleMessages.length > 0 ? (
        <div className="px-4 py-2 flex gap-2 overflow-x-auto flex-shrink-0 scrollbar-hide">
          {config.fallbackQuickQuestions.map((q) => (
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
      ) : null}

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 bg-white border-t flex-shrink-0">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={config.placeholder}
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
