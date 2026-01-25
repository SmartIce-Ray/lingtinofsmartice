// MarkdownRenderer Component - Renders markdown/HTML content in chat messages
// v1.0 - Initial implementation with basic markdown support

'use client';

import { useMemo } from 'react';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

// Simple markdown to HTML converter for chat messages
// Supports: headers, bold, italic, lists, code blocks, inline code, links, blockquotes
function parseMarkdown(text: string): string {
  if (!text) return '';

  let html = text;

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

  // Links [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  // Line breaks - convert double newlines to paragraphs, single newlines to <br>
  // But don't add breaks inside code blocks or lists
  const parts = html.split(/(<pre>[\s\S]*?<\/pre>|<ul>[\s\S]*?<\/ul>|<ol>[\s\S]*?<\/ol>)/);
  html = parts.map((part, index) => {
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

  return html;
}

export function MarkdownRenderer({ content, className = '' }: MarkdownRendererProps) {
  const htmlContent = useMemo(() => parseMarkdown(content), [content]);

  return (
    <div
      className={`prose-chat ${className}`}
      dangerouslySetInnerHTML={{ __html: htmlContent }}
    />
  );
}
