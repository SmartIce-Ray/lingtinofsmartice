// Staff Questions Page - View employee chat history and visit records
// v1.0 - Initial version with two tabs: AI chat history and visit records

'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { useAuth } from '@/contexts/AuthContext';
import { UserMenu } from '@/components/layout/UserMenu';

// Types for chat history
interface ChatHistoryItem {
  id: number;
  employee_name: string;
  content: string;
  role: 'user' | 'assistant';
  created_at: string;
  session_id: string;
}

// Types for visit records
interface VisitRecord {
  id: string;
  employee_name: string;
  table_id: string;
  manager_questions: string[];
  customer_answers: string[];
  ai_summary: string;
  sentiment_score: number;
  created_at: string;
}

// Response types
interface ChatHistoryResponse {
  items: ChatHistoryItem[];
}

interface VisitRecordsResponse {
  items: VisitRecord[];
}

// Format date for display
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return '刚刚';
  if (diffMins < 60) return `${diffMins}分钟前`;
  if (diffHours < 24) return `${diffHours}小时前`;
  if (diffDays < 7) return `${diffDays}天前`;

  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

export default function StaffQuestionsPage() {
  const [activeTab, setActiveTab] = useState<'chat' | 'visits'>('chat');
  const { user } = useAuth();
  const restaurantId = user?.restaurantId;

  // Fetch chat history
  const { data: chatData, isLoading: chatLoading } = useSWR<ChatHistoryResponse>(
    restaurantId ? `/api/staff/chat-history?restaurant_id=${restaurantId}` : null
  );

  // Fetch visit records
  const { data: visitsData, isLoading: visitsLoading } = useSWR<VisitRecordsResponse>(
    restaurantId ? `/api/staff/visit-records?restaurant_id=${restaurantId}` : null
  );

  const chatHistory = chatData?.items ?? [];
  const visitRecords = visitsData?.items ?? [];
  const loading = activeTab === 'chat' ? chatLoading : visitsLoading;

  // Group chat history by session
  const groupedChats = chatHistory.reduce((acc, item) => {
    if (!acc[item.session_id]) {
      acc[item.session_id] = [];
    }
    acc[item.session_id].push(item);
    return acc;
  }, {} as Record<string, ChatHistoryItem[]>);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">员工提问</h1>
        <UserMenu />
      </header>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200">
        <div className="flex">
          <button
            onClick={() => setActiveTab('chat')}
            className={`flex-1 py-3 text-sm font-medium text-center border-b-2 transition-colors ${
              activeTab === 'chat'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            AI 智库对话
          </button>
          <button
            onClick={() => setActiveTab('visits')}
            className={`flex-1 py-3 text-sm font-medium text-center border-b-2 transition-colors ${
              activeTab === 'visits'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            桌访录音内容
          </button>
        </div>
      </div>

      <main className="p-4">
        {loading && (
          <div className="text-center py-8 text-gray-500">加载中...</div>
        )}

        {/* Chat History Tab */}
        {activeTab === 'chat' && !loading && (
          <div className="space-y-4">
            {Object.keys(groupedChats).length === 0 ? (
              <div className="bg-white rounded-2xl p-8 shadow-sm text-center">
                <div className="text-gray-400 mb-2">
                  <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <div className="text-gray-500 text-sm">暂无员工提问记录</div>
                <div className="text-gray-400 text-xs mt-1">员工使用 AI 智库后，对话记录将显示在这里</div>
              </div>
            ) : (
              Object.entries(groupedChats).map(([sessionId, messages]) => {
                const userMessages = messages.filter(m => m.role === 'user');
                const firstUserMsg = userMessages[0];
                if (!firstUserMsg) return null;

                return (
                  <div key={sessionId} className="bg-white rounded-2xl p-4 shadow-sm">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
                          <span className="text-primary-600 text-sm font-medium">
                            {(firstUserMsg.employee_name || '员工').charAt(0)}
                          </span>
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {firstUserMsg.employee_name || '员工'}
                          </div>
                          <div className="text-xs text-gray-400">
                            {formatDate(firstUserMsg.created_at)}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2 mt-3">
                      {userMessages.slice(0, 3).map((msg, idx) => (
                        <div key={idx} className="bg-gray-50 rounded-lg p-3">
                          <div className="text-sm text-gray-700">{msg.content}</div>
                        </div>
                      ))}
                      {userMessages.length > 3 && (
                        <div className="text-xs text-gray-400 text-center">
                          还有 {userMessages.length - 3} 条提问...
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Visit Records Tab */}
        {activeTab === 'visits' && !loading && (
          <div className="space-y-4">
            {visitRecords.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 shadow-sm text-center">
                <div className="text-gray-400 mb-2">
                  <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                </div>
                <div className="text-gray-500 text-sm">暂无桌访录音记录</div>
                <div className="text-gray-400 text-xs mt-1">店长完成桌访录音后，内容将显示在这里</div>
              </div>
            ) : (
              visitRecords.map((record) => (
                <div key={record.id} className="bg-white rounded-2xl p-4 shadow-sm">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                        <span className="text-blue-600 text-sm font-medium">
                          {record.table_id}
                        </span>
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {record.employee_name || '店长'} · {record.table_id}桌
                        </div>
                        <div className="text-xs text-gray-400">
                          {formatDate(record.created_at)}
                        </div>
                      </div>
                    </div>
                    <div className={`px-2 py-0.5 rounded-full text-xs ${
                      record.sentiment_score >= 0.6
                        ? 'bg-green-100 text-green-700'
                        : record.sentiment_score >= 0.4
                          ? 'bg-gray-100 text-gray-600'
                          : 'bg-red-100 text-red-600'
                    }`}>
                      {record.sentiment_score >= 0.6 ? '正面' : record.sentiment_score >= 0.4 ? '中性' : '负面'}
                    </div>
                  </div>

                  {/* AI Summary */}
                  {record.ai_summary && (
                    <div className="text-sm text-gray-600 mb-3 italic">
                      &quot;{record.ai_summary}&quot;
                    </div>
                  )}

                  {/* Manager Questions */}
                  {record.manager_questions && record.manager_questions.length > 0 && (
                    <div className="mb-2">
                      <div className="text-xs text-blue-500 mb-1">店长问:</div>
                      <div className="bg-blue-50 rounded-lg p-2 text-sm text-blue-800">
                        {record.manager_questions.slice(0, 2).join(' ')}
                        {record.manager_questions.length > 2 && '...'}
                      </div>
                    </div>
                  )}

                  {/* Customer Answers */}
                  {record.customer_answers && record.customer_answers.length > 0 && (
                    <div>
                      <div className="text-xs text-gray-500 mb-1">顾客答:</div>
                      <div className="bg-gray-50 rounded-lg p-2 text-sm text-gray-700">
                        {record.customer_answers.slice(0, 2).join(' ')}
                        {record.customer_answers.length > 2 && '...'}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </main>
    </div>
  );
}
