// Admin Briefing Page - Daily cross-restaurant anomaly report
// v1.0 - Problem-first briefing with customer quotes + audio playback

'use client';

import { useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { useAuth } from '@/contexts/AuthContext';
import { UserMenu } from '@/components/layout/UserMenu';

// --- Types ---
interface BriefingEvidence {
  text: string;
  tableId: string;
  audioUrl: string | null;
}

interface BriefingProblem {
  severity: 'red' | 'yellow';
  category: string;
  restaurantId: string;
  restaurantName: string;
  title: string;
  evidence: BriefingEvidence[];
  metric?: string;
}

interface BriefingResponse {
  date: string;
  greeting: string;
  problems: BriefingProblem[];
  healthy_count: number;
  restaurant_count: number;
  avg_sentiment: number | null;
  avg_coverage: number;
}

// Category icon map
const CATEGORY_ICONS: Record<string, string> = {
  dish_quality: '🍳',
  service_speed: '⏱️',
  staff_attitude: '😐',
  environment: '🏠',
  coverage: '📉',
  sentiment: '😟',
  no_visits: '⚠️',
  action_overdue: '📋',
};

export default function AdminBriefingPage() {
  const { user } = useAuth();
  const router = useRouter();

  // Audio playback
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingKey, setPlayingKey] = useState<string | null>(null);

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setPlayingKey(null);
  }, []);

  const handleAudioToggle = useCallback(
    (key: string, audioUrl: string) => {
      if (playingKey === key) {
        stopAudio();
        return;
      }
      stopAudio();
      const audio = new Audio(audioUrl);
      audio.onended = () => { setPlayingKey(null); audioRef.current = null; };
      audio.onerror = () => { setPlayingKey(null); audioRef.current = null; };
      audio.play();
      audioRef.current = audio;
      setPlayingKey(key);
    },
    [playingKey, stopAudio],
  );

  // Fetch briefing data
  const { data, isLoading } = useSWR<BriefingResponse>('/api/dashboard/briefing');

  const userName = user?.employeeName || user?.username || '您';
  const greeting = data?.greeting || '您好';
  const problems = data?.problems || [];
  const healthyCount = data?.healthy_count ?? 0;
  const restaurantCount = data?.restaurant_count ?? 0;
  const avgSentiment = data?.avg_sentiment;
  const avgCoverage = data?.avg_coverage ?? 0;

  // Format today's date
  const today = new Date();
  const dateStr = `${today.getMonth() + 1}/${today.getDate()} 周${'日一二三四五六'[today.getDay()]}`;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">每日简报</h1>
        <UserMenu />
      </header>

      <div className="px-4 py-4 space-y-4">
        {/* Greeting banner */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              {greeting}，{userName.slice(0, 3)}
            </h2>
            {!isLoading && problems.length > 0 && (
              <p className="text-sm text-gray-500 mt-0.5">
                昨日 {restaurantCount} 家门店，{problems.length} 件事需要关注
              </p>
            )}
            {!isLoading && problems.length === 0 && restaurantCount > 0 && (
              <p className="text-sm text-gray-500 mt-0.5">
                昨日 {restaurantCount} 家门店均运营良好
              </p>
            )}
          </div>
          <span className="text-sm text-gray-400">{dateStr}</span>
        </div>

        {/* Loading state */}
        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white rounded-xl p-4 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-2/3 mb-3" />
                <div className="h-3 bg-gray-100 rounded w-full mb-2" />
                <div className="h-3 bg-gray-100 rounded w-4/5" />
              </div>
            ))}
          </div>
        )}

        {/* Problem cards */}
        {!isLoading && problems.length > 0 && (
          <div className="space-y-3">
            {problems.map((problem, idx) => (
              <ProblemCard
                key={`${problem.restaurantId}-${problem.category}-${idx}`}
                index={idx + 1}
                problem={problem}
                playingKey={playingKey}
                onAudioToggle={handleAudioToggle}
                onNavigate={(restId) => router.push(`/admin/restaurant-detail?id=${restId}`)}
              />
            ))}
          </div>
        )}

        {/* Empty state - all healthy */}
        {!isLoading && problems.length === 0 && restaurantCount > 0 && (
          <div className="bg-white rounded-xl p-6 text-center">
            <div className="text-4xl mb-3">✅</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">一切正常</h3>
            <p className="text-sm text-gray-500">
              昨日 {restaurantCount} 家门店均运营良好
            </p>
            {avgSentiment != null && (
              <p className="text-sm text-gray-400 mt-1">
                平均情绪 {avgSentiment.toFixed(2)} · 平均覆盖率 {avgCoverage}%
              </p>
            )}
          </div>
        )}

        {/* Healthy restaurants summary */}
        {!isLoading && problems.length > 0 && healthyCount > 0 && (
          <div className="bg-white rounded-xl p-4">
            <div className="flex items-center gap-2 text-green-600 mb-1">
              <span>✅</span>
              <span className="font-medium">其余 {healthyCount} 家门店运营正常</span>
            </div>
            {avgSentiment != null && (
              <p className="text-sm text-gray-400 ml-6">
                平均情绪 {avgSentiment.toFixed(2)} · 平均覆盖率 {avgCoverage}%
              </p>
            )}
          </div>
        )}

        {/* Link to full dashboard */}
        {!isLoading && (
          <button
            onClick={() => router.push('/admin/dashboard')}
            className="w-full text-center text-sm text-primary-600 font-medium py-3"
          >
            查看全部门店 →
          </button>
        )}
      </div>
    </div>
  );
}

// --- Problem Card Component ---
function ProblemCard({
  index,
  problem,
  playingKey,
  onAudioToggle,
  onNavigate,
}: {
  index: number;
  problem: BriefingProblem;
  playingKey: string | null;
  onAudioToggle: (key: string, url: string) => void;
  onNavigate: (restaurantId: string) => void;
}) {
  const severityBorder = problem.severity === 'red' ? 'border-l-red-500' : 'border-l-amber-400';
  const severityDot = problem.severity === 'red'
    ? 'bg-red-500'
    : 'bg-amber-400';
  const icon = CATEGORY_ICONS[problem.category] || '⚠️';

  return (
    <div className={`bg-white rounded-xl border-l-4 ${severityBorder} overflow-hidden`}>
      <div className="p-4">
        {/* Title row */}
        <div className="flex items-start gap-2 mb-2">
          <span className={`inline-block w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${severityDot}`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-medium text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                {problem.restaurantName}
              </span>
              <span className="text-sm font-semibold text-gray-900">
                {icon} {problem.title}
              </span>
            </div>
          </div>
        </div>

        {/* Metric (for coverage/sentiment anomalies) */}
        {problem.metric && (
          <p className="text-xs text-gray-500 ml-4 mb-2">{problem.metric}</p>
        )}

        {/* Evidence quotes */}
        {problem.evidence.length > 0 && (
          <div className="ml-4 bg-gray-50 rounded-lg p-3 space-y-1.5">
            {problem.evidence.map((ev, i) => (
              <div key={i} className="flex items-start justify-between gap-2">
                <p className="text-sm text-gray-700 flex-1">
                  &ldquo;{ev.text}&rdquo;
                  <span className="text-xs text-gray-400 ml-1">— {ev.tableId}</span>
                </p>
                {ev.audioUrl && (
                  <button
                    onClick={() => onAudioToggle(`${problem.restaurantId}-${i}`, ev.audioUrl!)}
                    className="flex-shrink-0 text-xs text-primary-600 font-medium flex items-center gap-0.5"
                  >
                    {playingKey === `${problem.restaurantId}-${i}` ? '⏸ 暂停' : '▶ 原声'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Action links */}
        <div className="flex items-center justify-end gap-3 mt-3">
          <button
            onClick={() => onNavigate(problem.restaurantId)}
            className="text-sm text-primary-600 font-medium"
          >
            查看详情 →
          </button>
        </div>
      </div>
    </div>
  );
}
