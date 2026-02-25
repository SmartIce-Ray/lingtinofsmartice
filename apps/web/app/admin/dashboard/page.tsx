// Admin Dashboard Page - Redirects to /admin/briefing (merged into 总览)
// v4.0 - Dashboard merged into briefing page

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminDashboardPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/admin/briefing');
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-400 text-sm">跳转中...</p>
    </div>
  );
}
