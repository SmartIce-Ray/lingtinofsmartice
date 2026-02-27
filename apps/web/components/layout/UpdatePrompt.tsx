// Update Prompt Component - Detects SW updates and prompts user to refresh
// v2.0 - Added force cache clear for Safari, proactive SW update check, long-press force update

'use client';

import { useEffect, useState, useRef, useCallback } from 'react';

// Build version - updated on each deployment
export const APP_VERSION = '2.0.0';
export const BUILD_DATE = '2026-02-28';

// Force clear all caches, unregister SW, and hard reload
async function forceUpdateApp() {
  console.log('[Lingtin] Force updating app...');
  try {
    // 1. Unregister all service workers
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map(r => r.unregister()));
      console.log(`[Lingtin] Unregistered ${registrations.length} service worker(s)`);
    }
    // 2. Clear all caches (Workbox runtime caches, precache, etc.)
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(name => caches.delete(name)));
      console.log(`[Lingtin] Cleared ${cacheNames.length} cache(s): ${cacheNames.join(', ')}`);
    }
  } catch (err) {
    console.error('[Lingtin] Error during force update:', err);
  }
  // 3. Hard reload (bypass browser cache)
  window.location.reload();
}

export function UpdatePrompt() {
  const [showUpdate, setShowUpdate] = useState(false);
  const [showVersion, setShowVersion] = useState(false);
  const [updating, setUpdating] = useState(false);
  // Long-press on version badge triggers force update
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    const handleControllerChange = () => {
      setShowUpdate(true);
    };

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

    navigator.serviceWorker.ready.then((registration) => {
      if (registration.waiting) {
        setShowUpdate(true);
      }

      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              setShowUpdate(true);
            }
          });
        }
      });

      // Proactively check for SW updates on page load (Safari may not do this automatically)
      registration.update().catch(() => {});
    });

    console.log(`[Lingtin] Version: ${APP_VERSION} (${BUILD_DATE})`);

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
    };
  }, []);

  const handleRefresh = useCallback(async () => {
    setUpdating(true);
    await forceUpdateApp();
  }, []);

  const handleDismiss = () => {
    setShowUpdate(false);
  };

  const toggleVersion = () => {
    setShowVersion(prev => !prev);
  };

  // Long-press (1.5s) on version badge = force update (debug shortcut)
  const handleVersionTouchStart = () => {
    longPressTimer.current = setTimeout(async () => {
      if (confirm('强制清除缓存并更新？')) {
        setUpdating(true);
        await forceUpdateApp();
      }
    }, 1500);
  };

  const handleVersionTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  return (
    <>
      {/* Update notification banner */}
      {showUpdate && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-blue-600 text-white px-4 py-3 shadow-lg animate-slide-down">
          <div className="flex items-center justify-between max-w-lg mx-auto">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span className="text-sm font-medium">有新版本可用</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleRefresh}
                disabled={updating}
                className="px-3 py-1 bg-white text-blue-600 rounded-full text-sm font-medium hover:bg-blue-50 transition-colors disabled:opacity-50"
              >
                {updating ? '更新中...' : '刷新'}
              </button>
              <button
                onClick={handleDismiss}
                className="p-1 hover:bg-blue-500 rounded-full transition-colors"
                aria-label="关闭"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Version indicator - tap to toggle, long-press to force update */}
      <button
        onClick={toggleVersion}
        onTouchStart={handleVersionTouchStart}
        onTouchEnd={handleVersionTouchEnd}
        onMouseDown={handleVersionTouchStart}
        onMouseUp={handleVersionTouchEnd}
        onMouseLeave={handleVersionTouchEnd}
        className="fixed bottom-20 right-2 z-40 text-[10px] text-gray-400 hover:text-gray-600 transition-colors select-none"
        aria-label="显示版本信息"
      >
        {showVersion ? `v${APP_VERSION} (${BUILD_DATE})` : `v${APP_VERSION}`}
      </button>
    </>
  );
}
