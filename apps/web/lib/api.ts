// API Configuration - Direct backend calls (no proxy)
// v1.0 - Removed Next.js API Routes proxy layer for simpler deployment

// Backend API URL - must be set in environment variables
export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Helper to build full API URL
export function getApiUrl(path: string): string {
  // Remove leading slash if present to avoid double slashes
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return `${API_URL}/${cleanPath}`;
}
