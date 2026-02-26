// User Menu Component - Display user avatar with dropdown menu
// v1.2 - Added 提交反馈 + 我的反馈 entries for all roles

'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

export function UserMenu() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Get first character of employee name (e.g., "梁店长" -> "梁")
  const avatarChar = user?.employeeName?.charAt(0) || '?';
  const isAdmin = user?.roleCode === 'administrator';

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
        <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
          <span className="text-primary-600 text-sm font-medium">
            {avatarChar}
          </span>
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
