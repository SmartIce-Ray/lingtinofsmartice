// Chat Page - AI-powered analytics assistant with streaming support
// v1.2 - Added markdown rendering for AI responses, fixed layout for bottom nav

'use client';

import { useState, useRef, useEffect } from 'react';
import { useChatStream } from '@/hooks/useChatStream';
import { MarkdownRenderer } from '@/components/chat/MarkdownRenderer';

export default function ChatPage() {
  const { messages, isLoading, sendMessage, clearMessages } = useChatStream();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const quickQuestions = [
    '今天投诉最多的菜',
    '本周情绪最低的桌',
    '退菜原因分析',
    '午市覆盖率如何',
  ];

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
        <button
          onClick={clearMessages}
          disabled={isLoading}
          className="text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50"
        >
          清空对话
        </button>
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
              ) : (
                <MarkdownRenderer content={msg.content} />
              )}
              {msg.isStreaming && (
                <span className="inline-block w-2 h-4 bg-primary-500 ml-1 animate-pulse" />
              )}
            </div>
          </div>
        ))}

        {/* Loading indicator */}
        {isLoading && messages[messages.length - 1]?.content === '' && (
          <div className="flex justify-start">
            <div className="bg-white shadow-sm rounded-2xl px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <span className="text-gray-400 text-sm">思考中...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Questions */}
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
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="px-6 py-3 bg-primary-600 text-white rounded-xl font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? (
              <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            ) : (
              '发送'
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
