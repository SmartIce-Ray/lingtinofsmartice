// Chat Page - AI-powered analytics assistant with streaming support
// v1.6 - Added stop button to cancel ongoing requests

'use client';

import { useState, useRef, useEffect } from 'react';
import { useChatStream } from '@/hooks/useChatStream';
import { MarkdownRenderer } from '@/components/chat/MarkdownRenderer';
import { ThinkingIndicator } from '@/components/chat/ThinkingIndicator';
import { UserMenu } from '@/components/layout/UserMenu';

export default function ChatPage() {
  const { messages, isLoading, sendMessage, stopRequest, clearMessages } = useChatStream();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const quickQuestions = [
    '最近有哪些客诉',
    '员工都问了哪些问题',
    '每天桌访情况如何',
    '客人对菜品评价如何',
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
              ) : msg.thinkingStatus ? (
                // Show thinking status with animated indicator
                <ThinkingIndicator status={msg.thinkingStatus} />
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
