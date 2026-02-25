// StealthOverlay - Fake WeChat chat interface overlay for discreet recording
// v1.1 - Added real avatar images from external sources

'use client';

import Image from 'next/image';

interface StealthOverlayProps {
  visible: boolean;
  onDismiss: () => void;
}

// Avatar URLs - using pravatar.cc for realistic avatars
const MOM_AVATAR = 'https://i.pravatar.cc/80?img=47';
const MY_AVATAR = 'https://i.pravatar.cc/80?img=68';

export function StealthOverlay({ visible, onDismiss }: StealthOverlayProps) {
  if (!visible) return null;

  const now = new Date();
  const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

  return (
    <div
      className="fixed inset-0 z-[100] bg-[#EDEDED] flex flex-col"
      onClick={onDismiss}
    >
      {/* WeChat-style header */}
      <div className="bg-[#EDEDED] pt-12 pb-2 px-4 flex items-center justify-between border-b border-gray-200">
        <div className="flex items-center gap-3">
          <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span className="text-lg font-medium text-gray-900">老妈</span>
        </div>
        <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
        </svg>
      </div>

      {/* Chat content */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Time indicator */}
        <div className="text-center">
          <span className="text-xs text-gray-500 bg-gray-200 px-2 py-1 rounded">昨天 20:32</span>
        </div>

        {/* Message from mom (left) */}
        <div className="flex items-start gap-2">
          <Image
            src={MOM_AVATAR}
            alt="妈"
            width={40}
            height={40}
            className="rounded flex-shrink-0"
            unoptimized
          />
          <div className="bg-white rounded-lg px-3 py-2 max-w-[70%] shadow-sm">
            <p className="text-gray-900 text-[15px]">今天忙不忙？晚上回来吃饭吗</p>
          </div>
        </div>

        {/* My message (right) */}
        <div className="flex items-start gap-2 justify-end">
          <div className="bg-[#95EC69] rounded-lg px-3 py-2 max-w-[70%] shadow-sm">
            <p className="text-gray-900 text-[15px]">今天加班，可能晚点</p>
          </div>
          <Image
            src={MY_AVATAR}
            alt="我"
            width={40}
            height={40}
            className="rounded flex-shrink-0"
            unoptimized
          />
        </div>

        {/* Message from mom */}
        <div className="flex items-start gap-2">
          <Image
            src={MOM_AVATAR}
            alt="妈"
            width={40}
            height={40}
            className="rounded flex-shrink-0"
            unoptimized
          />
          <div className="bg-white rounded-lg px-3 py-2 max-w-[70%] shadow-sm">
            <p className="text-gray-900 text-[15px]">好的，给你留饭</p>
          </div>
        </div>

        {/* Today's time indicator */}
        <div className="text-center">
          <span className="text-xs text-gray-500 bg-gray-200 px-2 py-1 rounded">{timeStr}</span>
        </div>

        {/* Recent message */}
        <div className="flex items-start gap-2">
          <Image
            src={MOM_AVATAR}
            alt="妈"
            width={40}
            height={40}
            className="rounded flex-shrink-0"
            unoptimized
          />
          <div className="bg-white rounded-lg px-3 py-2 max-w-[70%] shadow-sm">
            <p className="text-gray-900 text-[15px]">周末有空吗？你爸想去公园走走</p>
          </div>
        </div>
      </div>

      {/* WeChat-style input bar */}
      <div className="bg-[#F7F7F7] px-3 py-2 flex items-center gap-2 border-t border-gray-200 pb-8">
        <svg className="w-7 h-7 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
        </svg>
        <div className="flex-1 bg-white rounded-lg px-3 py-2 text-gray-400 text-[15px]">
          输入消息...
        </div>
        <svg className="w-7 h-7 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <svg className="w-7 h-7 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
        </svg>
      </div>
    </div>
  );
}
