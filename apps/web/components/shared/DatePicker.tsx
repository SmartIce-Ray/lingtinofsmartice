'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  getChinaToday,
  getChinaDaysAgo,
  getChineseWeekday,
  getMonthGrid,
  isSameDate,
} from '@/lib/date-utils';
import type { DateRange } from '@/lib/date-utils';

interface DateRangePreset {
  label: string;
  getRange: () => DateRange;
}

interface DatePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  maxDate?: string;
  minDate?: string;
  presets?: DateRangePreset[];
  className?: string;
}

// Default presets for admin pages
export const adminPresets: DateRangePreset[] = [
  { label: '昨日', getRange: () => ({ startDate: getChinaDaysAgo(1), endDate: getChinaDaysAgo(1) }) },
  { label: '前天', getRange: () => ({ startDate: getChinaDaysAgo(2), endDate: getChinaDaysAgo(2) }) },
  { label: '近7天', getRange: () => ({ startDate: getChinaDaysAgo(7), endDate: getChinaDaysAgo(1) }) },
  { label: '近30天', getRange: () => ({ startDate: getChinaDaysAgo(30), endDate: getChinaDaysAgo(1) }) },
];

// Default presets for store manager / chef pages
export const storePresets: DateRangePreset[] = [
  { label: '今日', getRange: () => ({ startDate: getChinaToday(), endDate: getChinaToday() }) },
  { label: '昨日', getRange: () => ({ startDate: getChinaDaysAgo(1), endDate: getChinaDaysAgo(1) }) },
  { label: '前天', getRange: () => ({ startDate: getChinaDaysAgo(2), endDate: getChinaDaysAgo(2) }) },
  { label: '近7天', getRange: () => ({ startDate: getChinaDaysAgo(7), endDate: getChinaToday() }) },
];

const WEEKDAY_HEADERS = ['一', '二', '三', '四', '五', '六', '日'];

// Check if dateStr is between start and end (exclusive of endpoints)
function isBetween(dateStr: string, start: string, end: string): boolean {
  return dateStr > start && dateStr < end;
}

export function DatePicker({
  value,
  onChange,
  maxDate,
  minDate,
  presets = [],
  className = '',
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  // Range selection state: first click sets rangeStart, second click completes range
  const [rangeStart, setRangeStart] = useState<string | null>(null);

  // Calendar view state: which month is being displayed
  const valueParts = value.startDate.split('-');
  const [viewYear, setViewYear] = useState(Number(valueParts[0]));
  const [viewMonth, setViewMonth] = useState(Number(valueParts[1]));

  // Sync calendar view when value changes externally
  useEffect(() => {
    const parts = value.startDate.split('-');
    setViewYear(Number(parts[0]));
    setViewMonth(Number(parts[1]));
  }, [value.startDate]);

  const effectiveMax = maxDate || getChinaToday();
  const effectiveMin = minDate || getChinaDaysAgo(90);

  // Smart label: show preset name if value matches, otherwise date range
  const triggerLabel = useMemo(() => {
    for (const p of presets) {
      const preset = p.getRange();
      if (isSameDate(value.startDate, preset.startDate) && isSameDate(value.endDate, preset.endDate)) {
        return p.label;
      }
    }
    if (isSameDate(value.startDate, value.endDate)) {
      const d = new Date(value.startDate + 'T00:00:00');
      return `${d.getMonth() + 1}/${d.getDate()} ${getChineseWeekday(value.startDate)}`;
    }
    const s = new Date(value.startDate + 'T00:00:00');
    const e = new Date(value.endDate + 'T00:00:00');
    return `${s.getMonth() + 1}/${s.getDate()} - ${e.getMonth() + 1}/${e.getDate()}`;
  }, [value, presets]);

  const grid = useMemo(() => getMonthGrid(viewYear, viewMonth), [viewYear, viewMonth]);

  const today = getChinaToday();

  const handleDayClick = useCallback(
    (dateStr: string) => {
      if (rangeStart === null) {
        // First click: set start
        setRangeStart(dateStr);
      } else {
        // Second click
        if (dateStr === rangeStart) {
          // Same day → single day selection
          onChange({ startDate: dateStr, endDate: dateStr });
          setRangeStart(null);
          setOpen(false);
        } else if (dateStr < rangeStart) {
          // Clicked before start → reset start
          setRangeStart(dateStr);
        } else {
          // Clicked after start → complete range
          onChange({ startDate: rangeStart, endDate: dateStr });
          setRangeStart(null);
          setOpen(false);
        }
      }
    },
    [rangeStart, onChange],
  );

  const handlePresetClick = useCallback(
    (preset: DateRangePreset) => {
      onChange(preset.getRange());
      setRangeStart(null);
      setOpen(false);
    },
    [onChange],
  );

  const goToPrevMonth = () => {
    if (viewMonth === 1) {
      setViewYear(viewYear - 1);
      setViewMonth(12);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const goToNextMonth = () => {
    if (viewMonth === 12) {
      setViewYear(viewYear + 1);
      setViewMonth(1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  // Check if next month exceeds maxDate
  const nextMonthFirst = viewMonth === 12
    ? `${viewYear + 1}-01-01`
    : `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-01`;
  const canGoNext = nextMonthFirst <= effectiveMax;

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [open]);

  // Reset rangeStart when closing
  const handleClose = useCallback(() => {
    setOpen(false);
    setRangeStart(null);
  }, []);

  const toDateStr = (day: number) =>
    `${viewYear}-${String(viewMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  // Check if a preset matches the current value
  const isPresetActive = (preset: DateRangePreset) => {
    const r = preset.getRange();
    return isSameDate(value.startDate, r.startDate) && isSameDate(value.endDate, r.endDate);
  };

  return (
    <>
      {/* Trigger pill */}
      <button
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 transition-colors ${className}`}
      >
        {triggerLabel}
        <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Backdrop + Bottom Sheet */}
      {open && (
        <div className="fixed inset-0 z-50">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/30"
            onClick={handleClose}
          />

          {/* Bottom Sheet */}
          <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl animate-slide-up max-h-[70vh] overflow-hidden">
            {/* Drag indicator */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-gray-300" />
            </div>

            <div className="px-4 pb-6">
              {/* Preset row */}
              {presets.length > 0 && (
                <div className="flex gap-2 mb-4 overflow-x-auto">
                  {presets.map((p) => {
                    const isActive = isPresetActive(p);
                    return (
                      <button
                        key={p.label}
                        onClick={() => handlePresetClick(p)}
                        className={`flex-shrink-0 min-h-[40px] px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                          isActive
                            ? 'bg-primary-600 text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200 active:bg-gray-300'
                        }`}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Range selection hint */}
              {rangeStart && (
                <div className="text-xs text-primary-600 text-center mb-2">
                  再点一个日期作为结束
                </div>
              )}

              {/* Month header */}
              <div className="flex items-center justify-between mb-3">
                <button
                  onClick={goToPrevMonth}
                  className="w-10 h-10 flex items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 active:bg-gray-200"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <span className="text-base font-semibold text-gray-800">
                  {viewYear}年{viewMonth}月
                </span>
                <button
                  onClick={goToNextMonth}
                  disabled={!canGoNext}
                  className={`w-10 h-10 flex items-center justify-center rounded-full transition-colors ${
                    canGoNext
                      ? 'text-gray-500 hover:bg-gray-100 active:bg-gray-200'
                      : 'text-gray-200'
                  }`}
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>

              {/* Weekday header */}
              <div className="grid grid-cols-7 mb-1">
                {WEEKDAY_HEADERS.map((wd) => (
                  <div key={wd} className="text-center text-xs text-gray-400 py-1">
                    {wd}
                  </div>
                ))}
              </div>

              {/* Date grid */}
              {grid.map((week, wi) => (
                <div key={wi} className="grid grid-cols-7">
                  {week.map((day, di) => {
                    if (day === null) {
                      return <div key={di} className="w-10 h-10 mx-auto" />;
                    }
                    const dateStr = toDateStr(day);
                    const isDisabled = dateStr > effectiveMax || dateStr < effectiveMin;

                    // Determine visual state
                    const isToday = isSameDate(dateStr, today);

                    // Active range: either committed value or in-progress selection
                    const activeStart = rangeStart || value.startDate;
                    const activeEnd = rangeStart ? rangeStart : value.endDate;
                    const isRangeStart = isSameDate(dateStr, activeStart);
                    const isRangeEnd = !rangeStart && isSameDate(dateStr, activeEnd);
                    const isEndpoint = isRangeStart || isRangeEnd;
                    const isInRange = !rangeStart && activeStart !== activeEnd && isBetween(dateStr, activeStart, activeEnd);

                    return (
                      <div key={di} className="flex items-center justify-center relative">
                        {/* Range band background */}
                        {isInRange && (
                          <div className="absolute inset-0 bg-primary-50" />
                        )}
                        {isRangeStart && activeStart !== activeEnd && !rangeStart && (
                          <div className="absolute inset-y-0 right-0 w-1/2 bg-primary-50" />
                        )}
                        {isRangeEnd && activeStart !== activeEnd && (
                          <div className="absolute inset-y-0 left-0 w-1/2 bg-primary-50" />
                        )}
                        <button
                          onClick={() => !isDisabled && handleDayClick(dateStr)}
                          disabled={isDisabled}
                          className={`relative z-10 w-10 h-10 rounded-full text-sm font-medium transition-colors ${
                            isEndpoint
                              ? 'bg-primary-600 text-white'
                              : isInRange
                                ? 'text-primary-700'
                                : isToday
                                  ? 'ring-2 ring-primary-500 text-gray-900'
                                  : isDisabled
                                    ? 'text-gray-300 cursor-default'
                                    : 'text-gray-700 hover:bg-gray-100 active:bg-gray-200'
                          }`}
                        >
                          {day}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Safe area for iPhone home indicator */}
            <div className="h-safe-bottom" />
          </div>
        </div>
      )}
    </>
  );
}
