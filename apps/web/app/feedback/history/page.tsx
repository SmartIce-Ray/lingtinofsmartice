// Feedback History Page - View submitted feedback with status and admin replies

'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { UserMenu } from '@/components/layout/UserMenu';
import useSWR from 'swr';

interface FeedbackItem {
  id: string;
  input_type: 'text' | 'voice';
  content_text: string;
  audio_url: string | null;
  category: string | null;
  ai_summary: string | null;
  priority: string | null;
  tags: string[];
  status: string;
  admin_reply: string | null;
  admin_reply_at: string | null;
  created_at: string;
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: '待处理', color: 'bg-gray-100 text-gray-600' },
  read: { label: '已读', color: 'bg-primary-50 text-primary-600' },
  in_progress: { label: '处理中', color: 'bg-amber-50 text-amber-600' },
  resolved: { label: '已解决', color: 'bg-green-50 text-green-600' },
  dismissed: { label: '已关闭', color: 'bg-gray-100 text-gray-400' },
};

const CATEGORY_LABELS: Record<string, string> = {
  bug: '系统故障',
  feature_request: '功能需求',
  usability: '易用性',
  performance: '性能',
  content: '内容质量',
  other: '其他',
};

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hour = d.getHours().toString().padStart(2, '0');
  const min = d.getMinutes().toString().padStart(2, '0');
  return `${month}/${day} ${hour}:${min}`;
}

export default function FeedbackHistoryPage() {
  const { user } = useAuth();
  const router = useRouter();

  const { data, isLoading } = useSWR<{ data: FeedbackItem[] }>(
    user ? `/api/feedback/mine?employee_id=${user.id}` : null
  );

  const feedbacks = data?.data ?? [];

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-lg font-semibold text-gray-900">我的反馈</h1>
        </div>
        <UserMenu />
      </header>

      <div className="px-4 py-4 max-w-lg mx-auto space-y-3">
        {isLoading && (
          <div className="text-center py-12 text-gray-400 text-sm">加载中...</div>
        )}

        {!isLoading && feedbacks.length === 0 && (
          <div className="text-center py-12 space-y-3">
            <p className="text-gray-400 text-sm">还没有提交过反馈</p>
            <button
              onClick={() => router.push('/feedback')}
              className="text-sm text-primary-600 hover:text-primary-700 font-medium"
            >
              去提交反馈 →
            </button>
          </div>
        )}

        {feedbacks.map((fb) => {
          const statusInfo = STATUS_MAP[fb.status] || STATUS_MAP.pending;
          return (
            <div key={fb.id} className="bg-white rounded-xl p-4 shadow-sm space-y-2">
              {/* Header row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${statusInfo.color}`}>
                    {statusInfo.label}
                  </span>
                  {fb.category && (
                    <span className="text-xs text-gray-400">
                      {CATEGORY_LABELS[fb.category] || fb.category}
                    </span>
                  )}
                </div>
                <span className="text-xs text-gray-400">{formatTime(fb.created_at)}</span>
              </div>

              {/* Content */}
              <p className="text-sm text-gray-800 line-clamp-3">
                {fb.content_text || fb.ai_summary || '(语音反馈处理中...)'}
              </p>

              {/* Tags */}
              {fb.tags && fb.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {fb.tags.map((tag, i) => (
                    <span key={i} className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Voice indicator */}
              {fb.input_type === 'voice' && fb.audio_url && (
                <div className="flex items-center gap-1 text-xs text-gray-400">
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                    <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                  </svg>
                  语音反馈
                </div>
              )}

              {/* Admin reply */}
              {fb.admin_reply && (
                <div className="mt-2 bg-primary-50 rounded-lg p-3 space-y-1">
                  <p className="text-xs font-medium text-primary-700">管理层回复</p>
                  <p className="text-sm text-primary-800">{fb.admin_reply}</p>
                  {fb.admin_reply_at && (
                    <p className="text-[10px] text-primary-400">{formatTime(fb.admin_reply_at)}</p>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* FAB to submit new feedback */}
        <div className="fixed bottom-6 right-6">
          <button
            onClick={() => router.push('/feedback')}
            className="w-14 h-14 bg-primary-600 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-primary-700 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
