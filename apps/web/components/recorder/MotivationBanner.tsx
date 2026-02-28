// MotivationBanner - Daily motivational greeting + cumulative achievement stats
// v1.0 - Random daily greeting + 3 stats (total visits, positive reviews, resolved issues)

'use client';

import useSWR from 'swr';
import { getApiUrl } from '@/lib/api';
import { getAuthHeaders } from '@/contexts/AuthContext';

interface MotivationStats {
  total_visits: number;
  positive_count: number;
  resolved_issues: number;
}

// Rotating daily greetings — warm, store-manager-centric
const GREETINGS = [
  // 肯定付出
  '每一次走桌，都在让门店变得更好',
  '你的用心，顾客感受得到',
  '好评的背后，是你日复一日的坚持',
  '感谢你的付出，门店因你而不同',
  '你的坚持，让改变真正发生',
  '每一条录音，都是门店进步的基石',
  '你今天的努力，明天的顾客会感受到',
  '每位回头客背后，都有你走过的那一桌',
  '你走过的每一桌，都是对品质的承诺',
  '正因为有你，顾客才愿意再来',
  '你的认真，是门店最好的招牌',
  '有你在，顾客的声音不会被辜负',
  // 倾听价值
  '真诚的交流，是最好的服务',
  '用心倾听，才能做得更好',
  '顾客的每句真话，都值得被认真对待',
  '走近顾客，就是走近更好的自己',
  '多听一句，就多一个改进的机会',
  '愿意说真话的顾客，是最珍贵的朋友',
  '倾听，是服务的起点，也是信任的开始',
  '每次对话，都是一次了解顾客的机会',
  '好的服务，从认真听开始',
  '一句真实的反馈，胜过十句客套话',
  // 团队激励
  '你的用心带动了整个团队',
  '今天的努力，团队看得见',
  '好的门店，从每一次认真的桌访开始',
  '你收集的每条反馈，都在帮助团队成长',
  '因为你的坚持，团队在变得更好',
  '你是门店和顾客之间最温暖的桥梁',
  // 成长视角
  '每一个问题的发现，都是进步的开始',
  '今天比昨天多走一桌，就是进步',
  '持续的小改善，终会带来大变化',
  '发现问题不可怕，解决问题才了不起',
  '每一次改善，都让门店离卓越更近一步',
  '数据会说话，你的努力不会白费',
  '把每一次桌访当作学习的机会',
  '成长，藏在每一次和顾客的对话里',
  '坚持记录，时间会给你答案',
  // 真诚感谢
  '谢谢你愿意多走那一桌',
  '你每天弯下腰问一句"吃得怎么样"，这份用心我们都记得',
  '录音不只是任务，是你对这家店的责任心',
  '谢谢你把顾客的声音带回来',
  '因为你愿意听，很多问题才没有被忽略',
  '你做的这些，可能顾客不会说谢谢，但门店会记住',
  '忙了一天还坚持走桌，辛苦了',
  '谢谢你每天多做的这一步',
  '你比大多数人都更在意顾客的感受，这很了不起',
  '能坚持每天记录的人不多，你是其中一个',
  '你收集的不只是反馈，是让门店变好的可能',
  '谢谢你，认真对待每一位顾客的声音',
];

// Pick greeting based on day-of-year so it changes daily but stays stable within the day
function getDailyGreeting(): string {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now.getTime() - start.getTime()) / 86400000);
  return GREETINGS[dayOfYear % GREETINGS.length];
}

const fetcher = (url: string) =>
  fetch(getApiUrl(url), { headers: getAuthHeaders() }).then(r => r.json());

interface MotivationBannerProps {
  restaurantId: string | undefined;
  userName?: string;
}

export function MotivationBanner({ restaurantId, userName }: MotivationBannerProps) {
  const { data } = useSWR<MotivationStats>(
    restaurantId ? `api/dashboard/motivation-stats?restaurant_id=${restaurantId}` : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 300000 }, // cache 5 min
  );

  const greeting = getDailyGreeting();
  const displayName = userName || '';

  return (
    <div className="bg-gradient-to-br from-primary-50 via-gray-50 to-gray-100 rounded-2xl px-4 py-3 shadow-sm">
      {/* Greeting */}
      <p className="text-sm text-gray-700 leading-relaxed">
        {displayName && (
          <span className="font-medium text-gray-800">{displayName}，</span>
        )}
        {greeting}
      </p>

      {/* Stats row */}
      {data && (data.total_visits > 0 || data.positive_count > 0 || data.resolved_issues > 0) && (
        <div className="flex items-center gap-4 mt-2.5">
          <StatItem value={data.total_visits} label="次桌访" />
          <div className="w-px h-6 bg-gray-200" />
          <StatItem value={data.positive_count} label="次满意" />
          <div className="w-px h-6 bg-gray-200" />
          <StatItem value={data.resolved_issues} label="已改善" />
        </div>
      )}
    </div>
  );
}

function StatItem({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex items-baseline gap-1">
      <span className="text-lg font-semibold text-gray-800">{value}</span>
      <span className="text-xs text-gray-500">{label}</span>
    </div>
  );
}
