// QuestionPrompt - Read-only questionnaire prompt card for recorder page
// v2.0 - 3-question framework with follow-up prompts + collapsible closing tips

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

// Follow-up prompts keyed by question id
const FOLLOW_UP_PROMPTS: Record<string, string> = {
  q1: '如果顾客只说"都不错" → 那哪道最合您口味？',
  q2: '如果顾客说"没有" → 那上菜速度、服务这些呢？',
  q3: '如果"第一次" → 什么机缘来的？ 如果"经常来" → 最早怎么发现的？ 如果"朋友推荐" → 朋友推荐了什么菜？',
  q4: '如果顾客说"挺好的" → 那某位服务员有没有特别贴心的？',
};

// Why explanations keyed by question id — brief benefit for store manager
const QUESTION_WHY: Record<string, string> = {
  q1: '好处：引导顾客说出具体菜品，比"挺好"更有价值，也能发现爆款和改进点',
  q2: '好处："小遗憾"语气轻，顾客更愿意说真话，是发现服务盲点的最佳时机',
  q3: '好处：了解新老顾客比例和来源，帮你找到忠实粉丝和口碑传播渠道',
  q4: '好处：主动问服务细节让顾客感受到被重视，也能发现团队可表扬的亮点',
};

const CLOSING_TIPS = [
  { scenario: '提到问题', script: '您说的{问题}我马上去落实。谢谢您，很多客人不好意思提，您这样反而帮了我们大忙。' },
  { scenario: '全程满意', script: '看得出您对吃很有心得。我们过阵子有新菜试吃，方便加个微信吗？' },
  { scenario: '比较简短', script: '谢谢您，下次来可以试试我们的{推荐菜}，我觉得应该合您口味。' },
];

export function QuestionPrompt({ questions, visible }: QuestionPromptProps) {
  const [collapsed, setCollapsed] = useState(true);
  const [closingOpen, setClosingOpen] = useState(true);

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
          {collapsed && (
            <span className="text-xs text-amber-500 font-normal ml-0.5">· {questions.length}题</span>
          )}
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
        <div className="px-4 pb-3">
          <ol className="space-y-3">
            {questions.map((q, idx) => (
              <li key={q.id}>
                <div className="flex gap-2 text-sm text-amber-900">
                  <span className="text-amber-500 font-medium flex-shrink-0">{idx + 1}.</span>
                  <span>{q.text}</span>
                </div>
                {QUESTION_WHY[q.id] && (
                  <p className="ml-5 mt-0.5 text-xs text-amber-600/70 leading-relaxed italic">
                    {QUESTION_WHY[q.id]}
                  </p>
                )}
                {FOLLOW_UP_PROMPTS[q.id] && (
                  <p className="ml-5 mt-0.5 text-xs text-gray-400 leading-relaxed">
                    {FOLLOW_UP_PROMPTS[q.id]}
                  </p>
                )}
              </li>
            ))}
          </ol>

          {/* Closing tips - collapsible, default collapsed */}
          <div className="mt-3 pt-2.5 border-t border-amber-200/60">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setClosingOpen(!closingOpen);
              }}
              className="flex items-center gap-1 text-xs text-amber-600 font-medium hover:text-amber-700"
            >
              <svg
                className={`w-3 h-3 transition-transform ${closingOpen ? 'rotate-90' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              收束提示
            </button>
            {closingOpen && (
              <ol className="mt-1.5 space-y-1.5 ml-4">
                {CLOSING_TIPS.map((tip, idx) => (
                  <li key={idx} className="text-xs text-amber-700/70 leading-relaxed">
                    <span className="text-amber-800 font-medium">{tip.scenario}</span>
                    <span className="mx-1">→</span>
                    <span className="italic">&ldquo;{tip.script}&rdquo;</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
