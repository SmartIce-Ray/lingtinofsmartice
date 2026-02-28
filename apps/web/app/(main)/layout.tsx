// Main App Layout - Layout with bottom navigation
// v1.2 - Added WhatsNewModal for version update notifications

'use client';

import { BottomNav } from '@/components/layout/BottomNav';
import { WhatsNewModal } from '@/components/layout/WhatsNewModal';

export default function MainAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen pb-16">
      {children}
      <BottomNav />
      <WhatsNewModal />
    </div>
  );
}
