// Table Selector Component - Select table by letter + number
// v1.4 - Updated: expanded numbers to 1-10

'use client';

import { useState, useCallback, useEffect } from 'react';

interface TableSelectorProps {
  value: string;
  onChange: (tableId: string) => void;
  disabled?: boolean;
}

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', '外', '包'];
const NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export function TableSelector({ value, onChange, disabled = false }: TableSelectorProps) {
  const [selectedLetter, setSelectedLetter] = useState<string>('');
  const [selectedNumber, setSelectedNumber] = useState<number | null>(null);

  // Sync internal state when value prop is cleared externally (e.g., after recording stops)
  useEffect(() => {
    if (value === '') {
      setSelectedLetter('');
      setSelectedNumber(null);
    }
  }, [value]);

  const handleLetterClick = useCallback(
    (letter: string) => {
      if (disabled) return;
      setSelectedLetter(letter);
      if (selectedNumber !== null) {
        onChange(`${letter}${selectedNumber}`);
      }
    },
    [disabled, selectedNumber, onChange],
  );

  const handleNumberClick = useCallback(
    (num: number) => {
      if (disabled) return;
      setSelectedNumber(num);
      if (selectedLetter) {
        onChange(`${selectedLetter}${num}`);
      }
    },
    [disabled, selectedLetter, onChange],
  );

  const handleClear = useCallback(() => {
    setSelectedLetter('');
    setSelectedNumber(null);
    onChange('');
  }, [onChange]);

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium text-gray-700">选择桌号</h2>
        {value && (
          <button
            onClick={handleClear}
            className="text-xs text-gray-400 hover:text-gray-600"
            disabled={disabled}
          >
            清除
          </button>
        )}
      </div>

      {/* Letter Row */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {LETTERS.map((letter) => (
          <button
            key={letter}
            onClick={() => handleLetterClick(letter)}
            disabled={disabled}
            className={`w-10 h-10 rounded-lg font-medium flex-shrink-0 transition-all ${
              selectedLetter === letter
                ? 'bg-primary-600 text-white shadow-md scale-105'
                : 'bg-gray-100 text-gray-700 hover:bg-primary-100 hover:text-primary-600'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {letter}
          </button>
        ))}
      </div>

      {/* Number Row */}
      <div className="flex gap-2 overflow-x-auto pb-2 mt-2 scrollbar-hide">
        {NUMBERS.map((num) => (
          <button
            key={num}
            onClick={() => handleNumberClick(num)}
            disabled={disabled}
            className={`w-10 h-10 rounded-lg font-medium flex-shrink-0 transition-all ${
              selectedNumber === num
                ? 'bg-primary-600 text-white shadow-md scale-105'
                : 'bg-gray-100 text-gray-700 hover:bg-primary-100 hover:text-primary-600'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {num}
          </button>
        ))}
      </div>

      {/* Selected Display */}
      <div className="text-center mt-4">
        <span className="text-gray-500">已选: </span>
        <span
          className={`font-bold text-lg ${
            value ? 'text-primary-600' : 'text-gray-300'
          }`}
        >
          {value || '--'}
        </span>
      </div>
    </div>
  );
}
