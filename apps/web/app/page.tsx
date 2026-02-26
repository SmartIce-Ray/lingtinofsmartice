// Home Page - Auto redirect based on user role
// v1.1 - Changed from landing page to role-based redirect

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

export default function HomePage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;

    if (!user) {
      router.replace('/login');
      return;
    }

    // Redirect based on role — AI 智库 as home for all roles
    if (user.roleCode === 'administrator') {
      router.replace('/admin/chat');
    } else if (user.roleCode === 'head_chef' || user.roleCode === 'chef') {
      router.replace('/chef/chat');
    } else {
      router.replace('/chat');
    }
  }, [user, isLoading, router]);

  // Show loading while redirecting
  return (
    <main className="flex min-h-screen items-center justify-center">
      <div className="text-gray-500">Loading...</div>
    </main>
  );
}
