// SWR Provider - Global data fetching configuration with localStorage persistence
// v1.3 - Added: Auto-logout on 401 (expired token) for all API calls

'use client';

import { SWRConfig, Cache, State } from 'swr';
import { ReactNode, useEffect, useState } from 'react';
import { getApiUrl } from '@/lib/api';

// Cache key for localStorage
const CACHE_KEY = 'lingtin-swr-cache';

// SWR Cache type
type SWRCache = Cache<State<unknown, unknown>>;

// Create localStorage-based cache provider for SWR persistence
function createLocalStorageProvider(): SWRCache {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cachedData: [string, any][] = [];

  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(CACHE_KEY);
      if (stored) {
        cachedData = JSON.parse(stored);
      }
    } catch {
      // Ignore parse errors, start fresh
    }
  }

  const map = new Map(cachedData);

  // Save to localStorage before page unload
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
      try {
        const entries = Array.from(map.entries());
        // Only cache dashboard-related data, limit size
        const filteredEntries = entries.filter(([key]) =>
          key.includes('/api/dashboard/') || key.includes('/api/audio/') ||
          key.includes('/api/action-items') || key.includes('/api/meeting/') ||
          key.includes('/api/daily-summary') || key.includes('/api/feedback/')
        ).slice(0, 50);
        localStorage.setItem(CACHE_KEY, JSON.stringify(filteredEntries));
      } catch {
        // Ignore storage errors
      }
    });
  }

  return map as SWRCache;
}

// Auth keys (must match AuthContext.tsx)
const AUTH_TOKEN_KEY = 'lingtin_auth_token';
const AUTH_USER_KEY = 'lingtin_auth_user';

// Handle 401: clear stored credentials and redirect to login
function handleAuthExpired() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
  localStorage.removeItem(CACHE_KEY);
  window.location.href = '/login';
}

// Global fetcher function with auth headers
// Converts relative URLs to full backend API URLs
// Auto-redirects to login on 401 (expired token)
export async function fetcher<T>(url: string): Promise<T> {
  const token = typeof window !== 'undefined'
    ? localStorage.getItem(AUTH_TOKEN_KEY)
    : null;

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Convert relative URL to full backend URL
  const fullUrl = url.startsWith('/') ? getApiUrl(url.slice(1)) : url;
  const res = await fetch(fullUrl, { headers });

  if (!res.ok) {
    // Token expired or invalid - auto logout and redirect to login
    if (res.status === 401) {
      handleAuthExpired();
    }
    const error = new Error('API request failed');
    (error as Error & { status: number }).status = res.status;
    throw error;
  }

  return res.json();
}

interface SWRProviderProps {
  children: ReactNode;
}

export function SWRProvider({ children }: SWRProviderProps) {
  const [provider, setProvider] = useState<SWRCache | null>(null);

  // Initialize provider on client side only
  useEffect(() => {
    setProvider(createLocalStorageProvider());
  }, []);

  // Don't render SWRConfig until provider is ready (SSR safety)
  if (!provider) {
    return <>{children}</>;
  }

  return (
    <SWRConfig
      value={{
        provider: () => provider,
        fetcher,
        // Stale-while-revalidate: show cached data immediately, fetch in background
        revalidateOnFocus: true,
        revalidateOnReconnect: true,
        // Deduplicate requests within 2 seconds
        dedupingInterval: 2000,
        // Keep previous data while loading new data (smooth transitions)
        keepPreviousData: true,
        // Retry on error
        errorRetryCount: 2,
        errorRetryInterval: 3000,
      }}
    >
      {children}
    </SWRConfig>
  );
}
