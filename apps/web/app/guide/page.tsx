// Guide Page - Version update history organized by role
// Writing lingtin_guide_seen_version on mount clears the red dot in UserMenu

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { UserMenu } from '@/components/layout/UserMenu';
import { APP_VERSION } from '@/components/layout/UpdatePrompt';
import { getNotesForRole, type ReleaseNote, type ReleaseNoteItem } from '@/lib/release-notes';

const LS_KEY = 'lingtin_guide_seen_version';

const ROLE_LABELS: Record<string, string> = {
  manager: '店长',
  administrator: '管理层',
  head_chef: '厨师长',
};

function NoteItemCard({ item }: { item: ReleaseNoteItem }) {
  return (
    <div className="border-l-2 border-primary-400 pl-3 space-y-2">
      <p className="text-sm font-semibold text-gray-900">{item.title}</p>
      <div className="bg-gray-50 rounded-lg p-2.5 flex items-start gap-2">
        <svg className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-xs text-gray-600 leading-relaxed">{item.howToUse}</p>
      </div>
      <div className="bg-emerald-50 rounded-lg p-2.5 flex items-start gap-2">
        <svg className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
        <p className="text-xs text-emerald-700 leading-relaxed">{item.value}</p>
      </div>
    </div>
  );
}

function VersionCard({ note, isLatest }: { note: ReleaseNote; isLatest: boolean }) {
  const [expanded, setExpanded] = useState(isLatest);

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      {/* Header - always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-primary-50 text-primary-700 shrink-0">
            v{note.version}
          </span>
          {isLatest && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 shrink-0">
              最新
            </span>
          )}
          <span className="text-sm font-medium text-gray-900 truncate">{note.title}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          <span className="text-xs text-gray-400">{note.date}</span>
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3 divide-y divide-gray-100">
          {note.items.map((item, i) => (
            <div key={i} className={i > 0 ? 'pt-3' : ''}>
              <NoteItemCard item={item} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function GuidePage() {
  const { user } = useAuth();
  const router = useRouter();
  const [notes, setNotes] = useState<ReleaseNote[]>([]);

  // Mark as seen on mount → clear red dot
  useEffect(() => {
    try { localStorage.setItem(LS_KEY, APP_VERSION); } catch {}
    window.dispatchEvent(new CustomEvent('lingtin-guide-seen'));
  }, []);

  useEffect(() => {
    if (!user) return;
    setNotes(getNotesForRole(user.roleCode));
  }, [user]);

  if (!user) return null;

  const roleLabel = ROLE_LABELS[user.roleCode] || user.roleCode;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.history.length > 1 ? router.back() : router.push('/')}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-lg font-semibold text-gray-900">使用指南</h1>
        </div>
        <UserMenu />
      </header>

      {/* Banner */}
      <div className="bg-gradient-to-b from-primary-50 to-transparent px-4 pt-4 pb-2">
        <p className="text-xs text-gray-500">
          {roleLabel}版 · 共 {notes.length} 个版本更新
        </p>
      </div>

      {/* Version cards */}
      <div className="px-4 pb-8 space-y-3">
        {notes.length === 0 && (
          <div className="text-center py-12 text-gray-400 text-sm">
            暂无与你角色相关的更新记录
          </div>
        )}
        {notes.map((note, i) => (
          <VersionCard key={`${note.version}-${note.title}`} note={note} isLatest={i === 0} />
        ))}
      </div>
    </div>
  );
}
