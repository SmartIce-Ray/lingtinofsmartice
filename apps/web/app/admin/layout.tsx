// Admin Layout - Layout with bottom navigation for boss/administrator role
// v1.2 - Added WhatsNewModal for version update notifications

'use client';

import { AdminBottomNav } from '@/components/layout/AdminBottomNav';
import { WhatsNewModal } from '@/components/layout/WhatsNewModal';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen pb-16">
      {children}
      <AdminBottomNav />
      <WhatsNewModal />
    </div>
  );
}
