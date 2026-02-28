// Admin Meetings Page - Cross-store meeting overview + my meetings
// Default shows yesterday's data, with date picker

'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { useAuth } from '@/contexts/AuthContext';
import { useManagedScope } from '@/hooks/useManagedScope';
import { UserMenu } from '@/components/layout/UserMenu';
import { MeetingDetail } from '@/components/recorder/MeetingDetail';
import { DatePicker, adminPresets } from '@/components/shared/DatePicker';
import { getChinaYesterday, singleDay, dateRangeParams } from '@/lib/date-utils';
import type { DateRange } from '@/lib/date-utils';
import type { MeetingRecord, MeetingType, MeetingStatus } from '@/hooks/useMeetingStore';

// --- Types ---
interface ApiMeeting {
  id: string;
  meeting_type: string;
  duration_seconds: number | null;
  ai_summary: string | null;
  action_items: Array<{ who: string; what: string; deadline: string }> | null;
  key_decisions: Array<{ decision: string; context: string }> | null;
  status: string;
  audio_url: string | null;
  created_at: string;
}

interface StoreOverview {
  id: string;
  name: string;
  meetings: ApiMeeting[];
  last_meeting_date: string | null;
}

interface AdminOverviewResponse {
  date: string;
  summary: {
    total_meetings: number;
    stores_with_meetings: number;
    stores_without: number;
  };
  stores: StoreOverview[];
  my_meetings: ApiMeeting[];
}

const MEETING_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  pre_meal: { label: '餐前会', color: 'bg-blue-100 text-blue-700' },
  daily_review: { label: '复盘', color: 'bg-amber-100 text-amber-700' },
  weekly: { label: '周例会', color: 'bg-purple-100 text-purple-700' },
  kitchen_meeting: { label: '厨房会议', color: 'bg-orange-100 text-orange-700' },
  cross_store_review: { label: '经营会', color: 'bg-indigo-100 text-indigo-700' },
  one_on_one: { label: '店长沟通', color: 'bg-teal-100 text-teal-700' },
};

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

function formatTime(isoStr: string): string {
  return new Date(isoStr).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '';
  if (seconds >= 60) {
    const mins = Math.floor(seconds / 60);
    return `${mins}分钟`;
  }
  return `${seconds}秒`;
}

function apiToMeetingRecord(m: ApiMeeting): MeetingRecord {
  return {
    id: m.id,
    meetingType: m.meeting_type as MeetingType,
    duration: m.duration_seconds || 0,
    timestamp: new Date(m.created_at).getTime(),
    status: (m.status === 'processed' ? 'processed' : m.status) as MeetingStatus,
    audioUrl: m.audio_url || undefined,
    aiSummary: m.ai_summary || undefined,
    actionItems: m.action_items || undefined,
    keyDecisions: m.key_decisions || undefined,
  };
}

// --- Meeting Summary Row ---
function MeetingSummaryRow({
  meeting,
  onTap,
}: {
  meeting: ApiMeeting;
  onTap: () => void;
}) {
  const typeInfo = MEETING_TYPE_LABELS[meeting.meeting_type] || { label: meeting.meeting_type, color: 'bg-gray-100 text-gray-700' };
  const actionCount = meeting.action_items?.length || 0;
  const isProcessed = meeting.status === 'processed';

  return (
    <div
      className={`flex items-start gap-3 py-2.5 ${isProcessed ? 'cursor-pointer active:bg-gray-50' : ''}`}
      onClick={isProcessed ? onTap : undefined}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${typeInfo.color}`}>
            {typeInfo.label}
          </span>
          <span className="text-xs text-gray-400">
            {formatTime(meeting.created_at)}
          </span>
          {meeting.duration_seconds && (
            <span className="text-xs text-gray-300">
              {formatDuration(meeting.duration_seconds)}
            </span>
          )}
        </div>
        {isProcessed && meeting.ai_summary && (
          <p className="text-xs text-gray-500 mt-1 line-clamp-1">{meeting.ai_summary}</p>
        )}
        {meeting.status === 'processing' && (
          <p className="text-xs text-yellow-600 mt-1 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />
            AI分析中...
          </p>
        )}
        {meeting.status === 'error' && (
          <p className="text-xs text-red-500 mt-1">处理失败</p>
        )}
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
        {isProcessed && actionCount > 0 && (
          <span className="text-[11px] text-primary-600 bg-primary-50 px-1.5 py-0.5 rounded">
            {actionCount}项待办
          </span>
        )}
        {isProcessed && (
          <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        )}
      </div>
    </div>
  );
}

// --- Store Meeting Card ---
function StoreMeetingCard({
  store,
  expanded,
  onToggle,
  onMeetingTap,
}: {
  store: StoreOverview;
  expanded: boolean;
  onToggle: () => void;
  onMeetingTap: (m: ApiMeeting) => void;
}) {
  const hasMeetings = store.meetings.length > 0;

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <div
        className={`px-4 py-3 flex items-center justify-between ${hasMeetings ? 'cursor-pointer active:bg-gray-50' : ''}`}
        onClick={hasMeetings ? onToggle : undefined}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-900">{store.name}</span>
          {hasMeetings && (
            <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-primary-50 text-primary-600">
              {store.meetings.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!hasMeetings && (
            <span className="text-xs text-gray-300">
              {store.last_meeting_date
                ? `上次 ${formatDateLabel(store.last_meeting_date)}`
                : '暂无会议'}
            </span>
          )}
          {hasMeetings && (
            <svg
              className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          )}
        </div>
      </div>
      {hasMeetings && expanded && (
        <div className="px-4 divide-y divide-gray-50 border-t border-gray-50">
          {store.meetings.map((m) => (
            <MeetingSummaryRow key={m.id} meeting={m} onTap={() => onMeetingTap(m)} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminMeetingsPage() {
  const { user } = useAuth();
  const { managedIdsParam } = useManagedScope();
  const [dateRange, setDateRange] = useState<DateRange>(() => singleDay(getChinaYesterday()));
  const [selectedMeeting, setSelectedMeeting] = useState<MeetingRecord | null>(null);
  const [showMyMeetings, setShowMyMeetings] = useState(true);
  const [expandedStoreId, setExpandedStoreId] = useState<string | null>(null);

  const { data: apiData, isLoading, error } = useSWR<AdminOverviewResponse>(
    `/api/meeting/admin-overview?${dateRangeParams(dateRange)}${user?.id ? `&employee_id=${user.id}` : ''}${managedIdsParam}`
  );
  const data = apiData;
  const hasData = !!data;

  const storesWithMeetings = useMemo(
    () => (data?.stores || []).filter(s => s.meetings.length > 0),
    [data],
  );
  const storesWithout = useMemo(
    () => (data?.stores || []).filter(s => s.meetings.length === 0),
    [data],
  );

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <header className="bg-white shadow-sm px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">会议</h1>
        <div className="flex items-center gap-2">
          <DatePicker
            value={dateRange}
            onChange={setDateRange}
            maxDate={getChinaYesterday()}
            presets={adminPresets}
          />
          <Link
            href="/admin/meetings/record"
            className="flex items-center gap-1 px-3 py-1.5 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            录制
          </Link>
          <UserMenu />
        </div>
      </header>

      <div className="px-4 space-y-3">
        {/* Loading */}
        {isLoading && (
          <div className="space-y-3">
            {[1, 2].map(i => (
              <div key={i} className="bg-white rounded-2xl p-4 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-1/3 mb-3" />
                <div className="h-3 bg-gray-100 rounded w-full mb-2" />
                <div className="h-3 bg-gray-100 rounded w-2/3" />
              </div>
            ))}
          </div>
        )}

        {/* My Meetings */}
        {hasData && data.my_meetings.length > 0 && (
          <div className="bg-primary-50 rounded-2xl overflow-hidden">
            <div
              className="px-4 py-3 flex items-center justify-between cursor-pointer"
              onClick={() => setShowMyMeetings(!showMyMeetings)}
            >
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary-500" />
                <span className="text-sm font-semibold text-primary-800">
                  我的会议 · {data.my_meetings.length}条记录
                </span>
              </div>
              <svg
                className={`w-4 h-4 text-primary-400 transition-transform ${showMyMeetings ? 'rotate-180' : ''}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
            {showMyMeetings && (
              <div className="px-4 pb-3 divide-y divide-primary-100">
                {data.my_meetings.map((m) => (
                  <MeetingSummaryRow
                    key={m.id}
                    meeting={m}
                    onTap={() => setSelectedMeeting(apiToMeetingRecord(m))}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Summary stats */}
        {hasData && !isLoading && (
          <div className="text-xs text-gray-400 px-1">
            {data.stores.length} 家门店 · {data.summary.total_meetings} 次会议
            {data.summary.stores_without > 0 && (
              <> · <span className="text-amber-500">{data.summary.stores_without} 家未开会</span></>
            )}
          </div>
        )}

        {/* Stores with meetings */}
        {storesWithMeetings.map((store) => (
          <StoreMeetingCard
            key={store.id}
            store={store}
            expanded={expandedStoreId === store.id}
            onToggle={() => setExpandedStoreId(prev => prev === store.id ? null : store.id)}
            onMeetingTap={(m) => setSelectedMeeting(apiToMeetingRecord(m))}
          />
        ))}

        {/* Stores without meetings */}
        {storesWithout.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <div className="text-sm font-medium text-gray-400 mb-2">
              未开会门店 ({storesWithout.length})
            </div>
            <div className="flex flex-wrap gap-2">
              {storesWithout.map((store) => (
                <span key={store.id} className="text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded">
                  {store.name}
                  {store.last_meeting_date && (
                    <span className="text-gray-300 ml-1">
                      · {formatDateLabel(store.last_meeting_date)}
                    </span>
                  )}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Empty state - show when API returned empty data OR when API failed (not yet deployed) */}
        {!isLoading && (
          (hasData && data.summary.total_meetings === 0 && data.my_meetings.length === 0) ||
          (!hasData && !isLoading)
        ) && (
          <div className="bg-white rounded-2xl p-8 text-center">
            <div className="text-4xl mb-3">📋</div>
            <h3 className="text-base font-medium text-gray-700 mb-1">当日暂无会议</h3>
            <p className="text-sm text-gray-400">
              各门店开会后，会议纪要将自动同步到这里
            </p>
          </div>
        )}
      </div>

      {/* Meeting Detail Bottom Sheet */}
      <MeetingDetail
        meeting={selectedMeeting}
        onClose={() => setSelectedMeeting(null)}
      />
    </div>
  );
}
