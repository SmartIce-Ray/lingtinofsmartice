// QuestionPrompt - Read-only questionnaire prompt card for recorder page
// v1.0 - Collapsible amber card showing question list during recording

'use client';

import { useState } from 'react';

interface Question {
  id: string;
  text: string;
  category: string;
}

interface QuestionPromptProps {
  questions: Question[];
  visible: boolean;
}

export function QuestionPrompt({ questions, visible }: QuestionPromptProps) {
  const [collapsed, setCollapsed] = useState(false);

  if (!visible || questions.length === 0) return null;

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl shadow-sm overflow-hidden">
      {/* Header - always visible, click to toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full px-4 py-2.5 flex items-center justify-between text-left"
      >
        <span className="text-sm font-medium text-amber-800 flex items-center gap-1.5">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          问卷提示
        </span>
        <svg
          className={`w-4 h-4 text-amber-600 transition-transform ${collapsed ? '' : 'rotate-180'}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Question list - collapsible */}
      {!collapsed && (
        <div className="px-4 pb-3 max-h-40 overflow-y-auto">
          <ol className="space-y-1.5">
            {questions.map((q, idx) => (
              <li key={q.id} className="flex gap-2 text-sm text-amber-900">
                <span className="text-amber-500 font-medium flex-shrink-0">{idx + 1}.</span>
                <span>{q.text}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
