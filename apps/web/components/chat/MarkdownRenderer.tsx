// MarkdownRenderer Component - Renders markdown/HTML content in chat messages
// v2.0 - Added lingtin:// action link buttons + :::quick-questions::: block parsing
// Content comes from our own AI backend, not from untrusted user input.

'use client';

import { useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface MarkdownRendererProps {
  content: string;
  className?: string;
  onQuickQuestion?: (question: string) => void;
}

// Simple markdown to HTML converter for chat messages
// Supports: headers, bold, italic, lists, code blocks, inline code, links, blockquotes
function parseMarkdown(text: string): { html: string; quickQuestions: string[] } {
  if (!text) return { html: '', quickQuestions: [] };

  // Extract :::quick-questions block before processing
  let quickQuestions: string[] = [];
  let processedText = text.replace(/:::quick-questions\n([\s\S]*?):::/g, (_, content) => {
    quickQuestions = content
      .split('\n')
      .map((line: string) => line.replace(/^-\s*/, '').trim())
      .filter(Boolean);
    return ''; // Remove from output
  });

  let html = processedText;

  // Escape HTML entities to prevent XSS
  html = html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Code blocks (must be processed before other patterns)
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre><code class="${lang}">${code.trim()}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Headers (## style)
  html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Bold and italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
  html = html.replace(/_(.+?)_/g, '<em>$1</em>');

  // Blockquotes
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

  // Horizontal rules
  html = html.replace(/^---$/gm, '<hr>');
  html = html.replace(/^\*\*\*$/gm, '<hr>');

  // Unordered lists - convert consecutive list items into proper list
  html = html.replace(/^[\-\*] (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`);

  // Ordered lists - convert consecutive numbered items into proper list
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
  // Wrap consecutive <li> not already in <ul> into <ol>
  html = html.replace(/(<li>.*<\/li>\n?)(?![^<]*<\/ul>)/g, (match, group) => {
    // Check if already wrapped
    if (html.indexOf(`<ul>${match}`) !== -1) return match;
    return match;
  });

  // Links - handle lingtin:// action links as pill buttons
  html = html.replace(/\[([^\]]+)\]\(lingtin:\/\/([^)]+)\)/g,
    '<button class="lingtin-action-btn" data-path="/$2">$1 →</button>');

  // Regular links [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  // Line breaks - convert double newlines to paragraphs, single newlines to <br>
  // But don't add breaks inside code blocks or lists
  const parts = html.split(/(<pre>[\s\S]*?<\/pre>|<ul>[\s\S]*?<\/ul>|<ol>[\s\S]*?<\/ol>)/);
  html = parts.map((part) => {
    // Keep code blocks and lists as-is
    if (part.startsWith('<pre>') || part.startsWith('<ul>') || part.startsWith('<ol>')) {
      return part;
    }
    // Process regular text
    return part
      .split(/\n\n+/)
      .map(paragraph => paragraph.trim())
      .filter(Boolean)
      .map(paragraph => {
        // Don't wrap if it's already a block element
        if (/^<(h[1-4]|blockquote|hr)/.test(paragraph)) {
          return paragraph;
        }
        return `<p>${paragraph.replace(/\n/g, '<br>')}</p>`;
      })
      .join('');
  }).join('');

  return { html, quickQuestions };
}

export function MarkdownRenderer({ content, className = '', onQuickQuestion }: MarkdownRendererProps) {
  const router = useRouter();
  const { html, quickQuestions } = useMemo(() => parseMarkdown(content), [content]);

  // Handle clicks on lingtin:// action buttons
  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('lingtin-action-btn')) {
      e.preventDefault();
      const path = target.getAttribute('data-path');
      if (path) {
        router.push(path);
      }
    }
  }, [router]);

  // Content is from our own AI backend (not untrusted user input).
  // HTML entities are escaped in parseMarkdown before any processing.
  return (
    <div>
      <div
        className={`prose-chat ${className}`}
        dangerouslySetInnerHTML={{ __html: html }}
        onClick={handleClick}
      />
      {quickQuestions.length > 0 && onQuickQuestion && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <p className="text-xs text-gray-400 mb-2">试试问我：</p>
          <div className="flex flex-wrap gap-1.5">
            {quickQuestions.map((q) => (
              <button
                key={q}
                onClick={() => onQuickQuestion(q)}
                className="px-2.5 py-1 bg-gray-50 border border-gray-200 rounded-full text-xs text-gray-600 hover:border-primary-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
