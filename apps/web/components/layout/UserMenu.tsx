// User Menu Component - Display user avatar with dropdown menu
// v1.3 - Added 使用指南 entry with red dot for unread updates

'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { APP_VERSION } from './UpdatePrompt';

const GUIDE_SEEN_KEY = 'lingtin_guide_seen_version';

export function UserMenu() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Get first character of employee name (e.g., "梁店长" -> "梁")
  const avatarChar = user?.employeeName?.charAt(0) || '?';
  const isAdmin = user?.roleCode === 'administrator';

  // Check for unread guide updates
  useEffect(() => {
    try {
      const seen = localStorage.getItem(GUIDE_SEEN_KEY);
      setHasUnread(seen !== APP_VERSION);
    } catch {
      setHasUnread(false);
    }

    const handleGuideSeen = () => setHasUnread(false);
    window.addEventListener('lingtin-guide-seen', handleGuideSeen);
    return () => window.removeEventListener('lingtin-guide-seen', handleGuideSeen);
  }, []);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!user) return null;

  return (
    <div className="relative" ref={menuRef}>
      {/* Avatar Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2"
      >
        <span className="text-xs text-gray-500 hidden sm:inline">
          {user.restaurantName}
        </span>
        <div className="relative w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
          <span className="text-primary-600 text-sm font-medium">
            {avatarChar}
          </span>
          {hasUnread && (
            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white" />
          )}
        </div>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 top-10 w-48 bg-white rounded-xl shadow-lg border border-gray-100 py-2 z-50">
          {/* User Info */}
          <div className="px-4 py-2 border-b border-gray-100">
            <p className="text-sm font-medium text-gray-900">
              {user.employeeName}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {user.restaurantName}
            </p>
          </div>

          {/* Question Templates Management (admin only) */}
          {isAdmin && (
            <button
              onClick={() => {
                setIsOpen(false);
                router.push('/admin/question-templates/manage');
              }}
              className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2"
            >
              <span className="text-gray-400">📋</span>
              问卷管理
            </button>
          )}

          {/* Region Management (super admin only) */}
          {user.isSuperAdmin && (
            <button
              onClick={() => {
                setIsOpen(false);
                router.push('/admin/regions');
              }}
              className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2"
            >
              <span className="text-gray-400">🗺️</span>
              区域管理
            </button>
          )}

          {/* Submit Feedback (all roles) */}
          <button
            onClick={() => {
              setIsOpen(false);
              router.push('/feedback');
            }}
            className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2"
          >
            <span className="text-gray-400">💬</span>
            提交反馈
          </button>

          {/* My Feedback History (all roles) */}
          <button
            onClick={() => {
              setIsOpen(false);
              router.push('/feedback/history');
            }}
            className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2"
          >
            <span className="text-gray-400">📝</span>
            我的反馈
          </button>

          {/* Guide */}
          <button
            onClick={() => {
              setIsOpen(false);
              router.push('/guide');
            }}
            className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2"
          >
            <span className="text-gray-400">📖</span>
            <span className="flex-1">使用指南</span>
            {hasUnread && (
              <span className="w-2 h-2 bg-red-500 rounded-full" />
            )}
          </button>

          {/* Logout Button */}
          <button
            onClick={() => {
              setIsOpen(false);
              logout();
            }}
            className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 transition-colors"
          >
            退出登录
          </button>
        </div>
      )}
    </div>
  );
}
