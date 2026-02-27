// BenchmarkPanel - Regional manager: my region vs company-wide metrics
// Only shown when user has managedRestaurantIds (regional manager)

'use client';

import useSWR from 'swr';

interface ComparisonMetric {
  mine: number;
  company: number;
}

interface BenchmarkResponse {
  period: { start: string; end: string };
  comparison: {
    sentiment: ComparisonMetric;
    coverage: ComparisonMetric;
    reviewCompletion: ComparisonMetric;
    actionCompletionRate: ComparisonMetric;
  };
  alerts: Array<{
    type: string;
    severity: 'high' | 'medium';
    storeName: string;
    storeId: string;
    message: string;
  }>;
  highlights: Array<{
    type: string;
    storeName: string;
    storeId: string;
    metricValue: number;
    description: string;
    isMyStore: boolean;
  }>;
}

function ComparisonCard({
  label,
  mine,
  company,
  unit,
  higherIsBetter = true,
}: {
  label: string;
  mine: number;
  company: number;
  unit: string;
  higherIsBetter?: boolean;
}) {
  const diff = mine - company;
  const isGood = higherIsBetter ? diff >= 0 : diff <= 0;
  const diffStr = diff > 0 ? `+${diff}` : `${diff}`;

  return (
    <div className="bg-white rounded-xl p-3 text-center">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="text-lg font-bold text-gray-900">
        {mine}{unit}
      </div>
      <div className={`text-xs mt-0.5 ${isGood ? 'text-green-600' : 'text-red-500'}`}>
        vs 全公司 {company}{unit}
        <span className="ml-1">({diffStr})</span>
      </div>
    </div>
  );
}

interface BenchmarkPanelProps {
  managedIdsParam: string;
}

export function BenchmarkPanel({ managedIdsParam }: BenchmarkPanelProps) {
  const { data, isLoading } = useSWR<BenchmarkResponse>(
    `/api/dashboard/benchmark?days=7${managedIdsParam}`
  );

  if (isLoading || !data) return null;

  const { comparison, alerts, highlights } = data;

  return (
    <div className="space-y-3">
      {/* Smart signals (execution gaps + trend anomalies) */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((alert, idx) => (
            <div
              key={idx}
              className={`rounded-xl px-4 py-3 ${
                alert.severity === 'high'
                  ? 'bg-red-50 border border-red-100'
                  : 'bg-amber-50 border border-amber-100'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  alert.severity === 'high' ? 'bg-red-500' : 'bg-amber-400'
                }`} />
                <span className="text-xs text-gray-400">{alert.storeName}</span>
              </div>
              <p className={`text-sm font-medium mt-1 ${
                alert.severity === 'high' ? 'text-red-700' : 'text-amber-700'
              }`}>
                {alert.message}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Benchmark comparison */}
      <div>
        <div className="text-sm font-medium text-gray-700 px-1 mb-2">基准对比（近 7 天）</div>
        <div className="grid grid-cols-2 gap-3">
          <ComparisonCard
            label="满意度"
            mine={Math.round(comparison.sentiment.mine)}
            company={Math.round(comparison.sentiment.company)}
            unit="分"
          />
          <ComparisonCard
            label="复盘完成率"
            mine={Math.round(comparison.reviewCompletion.mine)}
            company={Math.round(comparison.reviewCompletion.company)}
            unit="%"
          />
          <ComparisonCard
            label="覆盖率"
            mine={comparison.coverage.mine}
            company={comparison.coverage.company}
            unit="%"
          />
          <ComparisonCard
            label="待办完成率"
            mine={comparison.actionCompletionRate.mine}
            company={comparison.actionCompletionRate.company}
            unit="%"
          />
        </div>
      </div>

      {/* Highlights */}
      {highlights.length > 0 && (
        <div>
          <div className="text-sm font-medium text-gray-700 px-1 mb-2">改善亮点</div>
          <div className="space-y-2">
            {highlights.map((h, idx) => (
              <div
                key={idx}
                className={`rounded-xl px-4 py-3 flex items-center justify-between ${
                  h.isMyStore ? 'bg-green-50 border border-green-100' : 'bg-white'
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">{h.storeName}</span>
                    {h.isMyStore && (
                      <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                        我的门店
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{h.description}</p>
                </div>
                <div className="text-lg font-bold text-gray-900">
                  {h.metricValue}{h.type === 'sentiment_leader' ? '分' : '%'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
