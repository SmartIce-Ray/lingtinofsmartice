// FeedbackManagement - Admin view to manage employee product feedback
// Features: filter by status/category, update status, reply

'use client';

import { useState, useRef, useMemo } from 'react';
import useSWR, { mutate } from 'swr';
import { useAuth, getAuthHeaders } from '@/contexts/AuthContext';
import { getApiUrl } from '@/lib/api';

interface FeedbackItem {
  id: string;
  restaurant_id: string;
  employee_id: string;
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
  master_employee?: { employee_name: string; restaurant_id: string } | null;
  master_restaurant?: { restaurant_name: string } | null;
}

const STATUS_OPTIONS = [
  { value: 'pending', label: '待处理' },
  { value: 'read', label: '已读' },
  { value: 'in_progress', label: '处理中' },
  { value: 'resolved', label: '已解决' },
  { value: 'dismissed', label: '已关闭' },
];

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-600',
  read: 'bg-primary-50 text-primary-600',
  in_progress: 'bg-amber-50 text-amber-600',
  resolved: 'bg-green-50 text-green-600',
  dismissed: 'bg-gray-100 text-gray-400',
};

const CATEGORY_LABELS: Record<string, string> = {
  bug: '系统故障',
  feature_request: '功能需求',
  usability: '易用性',
  performance: '性能',
  content: '内容质量',
  other: '其他',
};

const PRIORITY_COLORS: Record<string, string> = {
  high: 'text-red-600',
  medium: 'text-amber-600',
  low: 'text-green-600',
};

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hour = d.getHours().toString().padStart(2, '0');
  const min = d.getMinutes().toString().padStart(2, '0');
  return `${month}/${day} ${hour}:${min}`;
}

export function FeedbackManagement() {
  const { user } = useAuth();
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [submittingReply, setSubmittingReply] = useState(false);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [expandedStoreId, setExpandedStoreId] = useState<string | null>(null);

  const params = new URLSearchParams();
  if (statusFilter) params.set('status', statusFilter);
  if (categoryFilter) params.set('category', categoryFilter);
  const queryStr = params.toString() ? `?${params.toString()}` : '';

  const swrKey = `/api/feedback/all${queryStr}`;
  const { data, isLoading } = useSWR<{ data: FeedbackItem[] }>(swrKey);
  const feedbacks = data?.data ?? [];

  // Group feedbacks by store, sorted by pending count desc
  const storeGroups = useMemo(() => {
    const map = new Map<string, { name: string; feedbacks: FeedbackItem[]; pendingCount: number }>();
    for (const fb of feedbacks) {
      const rid = fb.restaurant_id;
      if (!map.has(rid)) {
        const name = fb.master_restaurant?.restaurant_name || '未知门店';
        map.set(rid, { name, feedbacks: [], pendingCount: 0 });
      }
      const group = map.get(rid)!;
      group.feedbacks.push(fb);
      if (fb.status === 'pending') group.pendingCount++;
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1].pendingCount - a[1].pendingCount);
  }, [feedbacks]);

  const handleStatusChange = async (feedbackId: string, newStatus: string) => {
    if (!user) return;
    try {
      const res = await fetch(getApiUrl(`api/feedback/${feedbackId}/status`), {
        method: 'PATCH',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, changed_by: user.id }),
      });
      if (!res.ok) throw new Error(`状态更新失败 (${res.status})`);
      mutate(swrKey);
    } catch (err) {
      alert(err instanceof Error ? err.message : '操作失败，请重试');
    }
  };

  const handleReply = async (feedbackId: string) => {
    if (!user || !replyText.trim()) return;
    setSubmittingReply(true);
    try {
      const res = await fetch(getApiUrl(`api/feedback/${feedbackId}/reply`), {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ reply: replyText.trim(), reply_by: user.id }),
      });
      if (!res.ok) throw new Error(`回复失败 (${res.status})`);
      setReplyingId(null);
      setReplyText('');
      mutate(swrKey);
    } catch (err) {
      alert(err instanceof Error ? err.message : '操作失败，请重试');
    } finally {
      setSubmittingReply(false);
    }
  };

  const toggleAudio = (feedbackId: string, audioUrl: string) => {
    if (playingAudioId === feedbackId) {
      audioRef.current?.pause();
      setPlayingAudioId(null);
      return;
    }
    if (audioRef.current) {
      audioRef.current.pause();
    }
    const audio = new Audio(audioUrl);
    audio.onended = () => setPlayingAudioId(null);
    audio.play();
    audioRef.current = audio;
    setPlayingAudioId(feedbackId);
  };

  if (isLoading) {
    return <div className="text-center py-12 text-gray-400 text-sm">加载中...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="text-xs bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-600"
        >
          <option value="">全部状态</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="text-xs bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-600"
        >
          <option value="">全部分类</option>
          {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <span className="text-xs text-gray-400 self-center ml-auto whitespace-nowrap">
          共 {feedbacks.length} 条
        </span>
      </div>

      {feedbacks.length === 0 && (
        <div className="text-center py-12 text-gray-400 text-sm">暂无反馈</div>
      )}

      {/* Store-grouped feedback cards */}
      {storeGroups.map(([storeId, group]) => {
        const isOpen = expandedStoreId === storeId;
        return (
          <div key={storeId} className="bg-white rounded-2xl shadow-sm overflow-hidden">
            {/* Store header - clickable */}
            <div
              className="px-4 py-3 flex items-center justify-between cursor-pointer active:bg-gray-50"
              onClick={() => setExpandedStoreId(prev => prev === storeId ? null : storeId)}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-900">{group.name}</span>
                {group.pendingCount > 0 && (
                  <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600">
                    {group.pendingCount} 待处理
                  </span>
                )}
                <span className="text-xs text-gray-400">{group.feedbacks.length} 条</span>
              </div>
              <svg
                className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>

            {/* Expanded feedback list */}
            {isOpen && (
              <div className="px-4 pb-3 space-y-3 border-t border-gray-50 pt-3">
                {group.feedbacks.map((fb) => {
                  const statusInfo = STATUS_COLORS[fb.status] || STATUS_COLORS.pending;
                  const employeeName = fb.master_employee?.employee_name || '未知';
                  const isReplying = replyingId === fb.id;

                  return (
                    <div key={fb.id} className="bg-gray-50 rounded-xl p-3.5 space-y-2.5">
                      {/* Top row: employee + time + status */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900">{employeeName}</span>
                          {fb.category && (
                            <span className="text-xs px-1.5 py-0.5 bg-primary-50 text-primary-600 rounded">
                              {CATEGORY_LABELS[fb.category] || fb.category}
                            </span>
                          )}
                          {fb.priority && (
                            <span className={`text-xs ${PRIORITY_COLORS[fb.priority] || ''}`}>
                              {fb.priority === 'high' ? '紧急' : fb.priority === 'low' ? '低' : ''}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-gray-400">{formatTime(fb.created_at)}</span>
                      </div>

                      {/* AI summary */}
                      {fb.ai_summary && (
                        <p className="text-xs text-gray-500 italic">{fb.ai_summary}</p>
                      )}

                      {/* Content */}
                      <p className="text-sm text-gray-800">
                        {fb.content_text || '(语音反馈处理中...)'}
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

                      {/* Voice playback */}
                      {fb.input_type === 'voice' && fb.audio_url && (
                        <button
                          onClick={() => toggleAudio(fb.id, fb.audio_url!)}
                          className="flex items-center gap-1.5 text-xs text-primary-600 hover:text-primary-700"
                        >
                          {playingAudioId === fb.id ? (
                            <>
                              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
                              停止播放
                            </>
                          ) : (
                            <>
                              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                              播放原声
                            </>
                          )}
                        </button>
                      )}

                      {/* Existing reply */}
                      {fb.admin_reply && (
                        <div className="bg-primary-50 rounded-lg p-2.5 space-y-1">
                          <p className="text-xs font-medium text-primary-700">已回复</p>
                          <p className="text-sm text-primary-800">{fb.admin_reply}</p>
                        </div>
                      )}

                      {/* Actions row */}
                      <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
                        {/* Status dropdown */}
                        <select
                          value={fb.status}
                          onChange={(e) => handleStatusChange(fb.id, e.target.value)}
                          className={`text-xs px-2 py-1 rounded-full border-0 ${statusInfo}`}
                        >
                          {STATUS_OPTIONS.map((s) => (
                            <option key={s.value} value={s.value}>{s.label}</option>
                          ))}
                        </select>

                        {/* Reply button */}
                        {!isReplying && (
                          <button
                            onClick={() => { setReplyingId(fb.id); setReplyText(fb.admin_reply || ''); }}
                            className="text-xs text-primary-600 hover:text-primary-700 ml-auto"
                          >
                            {fb.admin_reply ? '修改回复' : '回复'}
                          </button>
                        )}
                      </div>

                      {/* Reply input */}
                      {isReplying && (
                        <div className="space-y-2">
                          <textarea
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            placeholder="输入回复内容..."
                            className="w-full h-20 bg-white rounded-lg p-3 text-sm text-gray-800 placeholder:text-gray-400 border border-gray-200 focus:border-primary-400 focus:ring-1 focus:ring-primary-400 outline-none resize-none"
                            autoFocus
                          />
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => { setReplyingId(null); setReplyText(''); }}
                              className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5"
                            >
                              取消
                            </button>
                            <button
                              onClick={() => handleReply(fb.id)}
                              disabled={!replyText.trim() || submittingReply}
                              className="text-xs bg-primary-600 text-white px-3 py-1.5 rounded-lg disabled:opacity-50 hover:bg-primary-700"
                            >
                              {submittingReply ? '发送中...' : '发送回复'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
