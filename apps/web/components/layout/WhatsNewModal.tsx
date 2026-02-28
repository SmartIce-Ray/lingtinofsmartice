// WhatsNew Modal - Shows version update content on first open after update
// Triggered by comparing localStorage('lingtin_whats_new_seen') vs APP_VERSION

'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { APP_VERSION } from './UpdatePrompt';
import { getLatestNoteForRole, type ReleaseNoteItem } from '@/lib/release-notes';

const LS_KEY = 'lingtin_whats_new_seen';

export function WhatsNewModal() {
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [note, setNote] = useState<{ title: string; date: string; items: ReleaseNoteItem[] } | null>(null);

  useEffect(() => {
    if (!user) return;
    try {
      const seen = localStorage.getItem(LS_KEY);
      if (seen === APP_VERSION) return;

      const found = getLatestNoteForRole(APP_VERSION, user.roleCode);
      if (!found) {
        localStorage.setItem(LS_KEY, APP_VERSION);
        return;
      }

      setNote({ title: found.title, date: found.date, items: found.items });
      requestAnimationFrame(() => {
        setVisible(true);
        setAnimating(true);
      });
    } catch {
      // localStorage unavailable (Safari private browsing), skip modal
    }
  }, [user]);

  // Escape key to close
  useEffect(() => {
    if (!visible) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [visible]);

  const handleClose = () => {
    setAnimating(false);
    setTimeout(() => {
      setVisible(false);
      try { localStorage.setItem(LS_KEY, APP_VERSION); } catch {}
    }, 200);
  };

  if (!visible || !note) return null;

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-end justify-center transition-colors duration-200 ${
        animating ? 'bg-black/40 backdrop-blur-sm' : 'bg-transparent'
      }`}
      onClick={handleClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`版本 ${APP_VERSION} 更新内容`}
        className={`w-full max-w-lg bg-white rounded-t-2xl shadow-2xl transition-transform duration-300 ease-out ${
          animating ? 'translate-y-0' : 'translate-y-full'
        }`}
        onClick={e => e.stopPropagation()}
      >
        {/* Header with gradient */}
        <div className="bg-gradient-to-br from-primary-500 to-primary-600 rounded-t-2xl px-5 pt-5 pb-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-white/80 bg-white/20 px-2 py-0.5 rounded-full">
              v{APP_VERSION}
            </span>
            <span className="text-xs text-white/60">{note.date}</span>
          </div>
          <h2 className="text-lg font-bold text-white">{note.title}</h2>
        </div>

        {/* Content */}
        <div className="px-5 py-4 max-h-[60vh] overflow-y-auto space-y-4">
          {note.items.map((item, i) => (
            <div key={i} className="border-l-2 border-primary-400 pl-3 space-y-2">
              <p className="text-sm font-semibold text-gray-900">{item.title}</p>
              <div className="bg-gray-50 rounded-lg p-2.5 flex items-start gap-2">
                <svg className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-xs text-gray-600 leading-relaxed">{item.howToUse}</p>
              </div>
              <div className="bg-green-50 rounded-lg p-2.5 flex items-start gap-2">
                <svg className="w-3.5 h-3.5 text-green-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <p className="text-xs text-green-700 leading-relaxed">{item.value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom button */}
        <div className="px-5 pb-5 pt-2">
          <button
            onClick={handleClose}
            className="w-full bg-primary-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-primary-700 transition-colors active:scale-[0.98]"
          >
            知道了
          </button>
        </div>

        {/* Safe area padding for iPhone */}
        <div className="h-[env(safe-area-inset-bottom)]" />
      </div>
    </div>
  );
}
