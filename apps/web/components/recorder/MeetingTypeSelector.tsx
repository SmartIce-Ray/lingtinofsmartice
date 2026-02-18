// Meeting Type Selector - Choose meeting type (pre_meal/daily_review/weekly)

'use client';

import { MeetingType } from '@/hooks/useMeetingStore';

interface MeetingTypeSelectorProps {
  value: MeetingType | '';
  onChange: (type: MeetingType) => void;
  disabled?: boolean;
}

const MEETING_TYPES: Array<{
  type: MeetingType;
  label: string;
  icon: string;
}> = [
  { type: 'pre_meal', label: '餐前会', icon: '🍳' },
  { type: 'daily_review', label: '每日复盘', icon: '📋' },
  { type: 'weekly', label: '周例会', icon: '📅' },
];

export function MeetingTypeSelector({ value, onChange, disabled = false }: MeetingTypeSelectorProps) {
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm">
      <h2 className="text-sm font-medium text-gray-700 mb-3">选择会议类型</h2>
      <div className="grid grid-cols-3 gap-3">
        {MEETING_TYPES.map(({ type, label, icon }) => (
          <button
            key={type}
            onClick={() => onChange(type)}
            disabled={disabled}
            className={`flex flex-col items-center gap-1.5 p-3 rounded-xl transition-all ${
              value === type
                ? 'bg-primary-50 border-2 border-primary-500 shadow-sm'
                : 'bg-gray-50 border-2 border-transparent hover:bg-gray-100'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <span className="text-2xl">{icon}</span>
            <span className={`text-sm font-medium ${
              value === type ? 'text-primary-700' : 'text-gray-700'
            }`}>
              {label}
            </span>
          </button>
        ))}
      </div>

      <div className="text-center mt-3">
        <span className="text-gray-500 text-sm">已选: </span>
        <span className={`font-bold text-sm ${value ? 'text-primary-600' : 'text-gray-300'}`}>
          {value ? MEETING_TYPES.find(t => t.type === value)?.label : '--'}
        </span>
      </div>
    </div>
  );
}
