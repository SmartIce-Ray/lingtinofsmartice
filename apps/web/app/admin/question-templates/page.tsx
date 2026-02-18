// Admin Question Templates Page - Manage questionnaire prompts
// v1.0 - CRUD for question templates

'use client';

import { useState } from 'react';
import useSWR, { mutate } from 'swr';
import { useAuth, getAuthHeaders } from '@/contexts/AuthContext';
import { getApiUrl } from '@/lib/api';
import { UserMenu } from '@/components/layout/UserMenu';

interface QuestionItem {
  id: string;
  text: string;
  category: string;
}

interface Template {
  id: string;
  restaurant_id: string;
  template_name: string;
  questions: QuestionItem[];
  is_active: boolean;
  effective_from: string | null;
  effective_to: string | null;
  created_at: string;
  updated_at: string;
}

interface TemplatesResponse {
  templates: Template[];
}

function generateId(): string {
  return `q${Date.now().toString(36)}`;
}

export default function QuestionTemplatesPage() {
  const { user } = useAuth();
  const restaurantId = user?.restaurantId;

  const swrKey = restaurantId ? `/api/question-templates?restaurant_id=${restaurantId}` : null;
  const { data, isLoading } = useSWR<TemplatesResponse>(swrKey);
  const templates = data?.templates ?? [];

  // Edit modal state
  const [editing, setEditing] = useState<Template | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formName, setFormName] = useState('');
  const [formQuestions, setFormQuestions] = useState<QuestionItem[]>([]);
  const [formActive, setFormActive] = useState(true);
  const [formFrom, setFormFrom] = useState('');
  const [formTo, setFormTo] = useState('');

  const openCreate = () => {
    setIsNew(true);
    setEditing(null);
    setFormName('');
    setFormQuestions([{ id: generateId(), text: '', category: '' }]);
    setFormActive(true);
    setFormFrom('');
    setFormTo('');
  };

  const openEdit = (tpl: Template) => {
    setIsNew(false);
    setEditing(tpl);
    setFormName(tpl.template_name);
    setFormQuestions(tpl.questions.length > 0 ? [...tpl.questions] : [{ id: generateId(), text: '', category: '' }]);
    setFormActive(tpl.is_active);
    setFormFrom(tpl.effective_from || '');
    setFormTo(tpl.effective_to || '');
  };

  const closeForm = () => {
    setEditing(null);
    setIsNew(false);
  };

  const addQuestion = () => {
    setFormQuestions([...formQuestions, { id: generateId(), text: '', category: '' }]);
  };

  const removeQuestion = (idx: number) => {
    if (formQuestions.length <= 1) return;
    setFormQuestions(formQuestions.filter((_, i) => i !== idx));
  };

  const updateQuestion = (idx: number, field: 'text' | 'category', value: string) => {
    const updated = [...formQuestions];
    updated[idx] = { ...updated[idx], [field]: value };
    setFormQuestions(updated);
  };

  const moveQuestion = (idx: number, direction: -1 | 1) => {
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= formQuestions.length) return;
    const updated = [...formQuestions];
    [updated[idx], updated[newIdx]] = [updated[newIdx], updated[idx]];
    setFormQuestions(updated);
  };

  const handleSave = async () => {
    const validQuestions = formQuestions.filter(q => q.text.trim());
    if (!formName.trim() || validQuestions.length === 0) return;

    setSaving(true);
    try {
      let res: Response;
      if (isNew) {
        res = await fetch(getApiUrl('api/question-templates'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({
            restaurant_id: restaurantId,
            template_name: formName.trim(),
            questions: validQuestions,
            is_active: formActive,
            effective_from: formFrom || undefined,
            effective_to: formTo || undefined,
          }),
        });
      } else if (editing) {
        res = await fetch(getApiUrl(`api/question-templates/${editing.id}`), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({
            template_name: formName.trim(),
            questions: validQuestions,
            is_active: formActive,
            effective_from: formFrom || null,
            effective_to: formTo || null,
          }),
        });
      } else {
        return;
      }
      if (!res.ok) {
        alert('保存失败，请重试');
        return;
      }
      await mutate(swrKey);
      closeForm();
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (tpl: Template) => {
    const res = await fetch(getApiUrl(`api/question-templates/${tpl.id}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ is_active: !tpl.is_active }),
    });
    if (!res.ok) {
      alert('操作失败，请重试');
      return;
    }
    await mutate(swrKey);
  };

  const handleDelete = async (tpl: Template) => {
    if (!confirm(`确定删除「${tpl.template_name}」？`)) return;
    const res = await fetch(getApiUrl(`api/question-templates/${tpl.id}`), {
      method: 'DELETE',
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) {
      alert('删除失败，请重试');
      return;
    }
    await mutate(swrKey);
  };

  const showForm = isNew || editing !== null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">问卷模板管理</h1>
        <UserMenu />
      </header>

      <main className="p-4 space-y-4">
        {/* Action bar */}
        <div className="flex justify-between items-center">
          <p className="text-sm text-gray-500">
            {templates.length > 0 ? `共 ${templates.length} 个模板` : '暂无模板'}
          </p>
          <button
            onClick={openCreate}
            className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
          >
            + 新建模板
          </button>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="text-center py-8 text-gray-500">加载中...</div>
        )}

        {/* Empty state */}
        {!isLoading && templates.length === 0 && !showForm && (
          <div className="bg-white rounded-2xl p-8 shadow-sm text-center">
            <div className="text-gray-400 mb-2">
              <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <div className="text-gray-500 text-sm">暂无问卷模板</div>
            <div className="text-gray-400 text-xs mt-1">点击「新建模板」创建问卷提示，录音时将显示在页面上</div>
          </div>
        )}

        {/* Template list */}
        {!isLoading && templates.map(tpl => (
          <div key={tpl.id} className="bg-white rounded-2xl p-4 shadow-sm">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-medium text-gray-900">{tpl.template_name}</h3>
                  {tpl.is_active ? (
                    <span className="px-1.5 py-0.5 text-xs bg-green-100 text-green-700 rounded-full">启用中</span>
                  ) : (
                    <span className="px-1.5 py-0.5 text-xs bg-gray-100 text-gray-500 rounded-full">已停用</span>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-0.5">
                  {tpl.questions.length} 个问题
                  {tpl.effective_from && ` · 从 ${tpl.effective_from}`}
                  {tpl.effective_to && ` 到 ${tpl.effective_to}`}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleToggleActive(tpl)}
                  className={`text-xs px-2 py-1 rounded-lg ${
                    tpl.is_active
                      ? 'text-gray-500 bg-gray-100 hover:bg-gray-200'
                      : 'text-green-600 bg-green-50 hover:bg-green-100'
                  }`}
                >
                  {tpl.is_active ? '停用' : '启用'}
                </button>
                <button
                  onClick={() => openEdit(tpl)}
                  className="text-xs px-2 py-1 rounded-lg text-primary-600 bg-primary-50 hover:bg-primary-100"
                >
                  编辑
                </button>
                <button
                  onClick={() => handleDelete(tpl)}
                  className="text-xs px-2 py-1 rounded-lg text-red-600 bg-red-50 hover:bg-red-100"
                >
                  删除
                </button>
              </div>
            </div>
            {/* Preview questions */}
            <ol className="space-y-1 pl-1">
              {tpl.questions.slice(0, 5).map((q, idx) => (
                <li key={q.id} className="text-sm text-gray-600 flex gap-2">
                  <span className="text-gray-400 flex-shrink-0">{idx + 1}.</span>
                  <span>{q.text}</span>
                  {q.category && (
                    <span className="text-xs text-gray-400 bg-gray-50 px-1 rounded flex-shrink-0">{q.category}</span>
                  )}
                </li>
              ))}
              {tpl.questions.length > 5 && (
                <li className="text-xs text-gray-400">...还有 {tpl.questions.length - 5} 个问题</li>
              )}
            </ol>
          </div>
        ))}

        {/* Create/Edit form */}
        {showForm && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border-2 border-primary-200">
            <h3 className="text-sm font-medium text-gray-900 mb-4">
              {isNew ? '新建问卷模板' : '编辑问卷模板'}
            </h3>

            {/* Template name */}
            <div className="mb-4">
              <label className="block text-xs text-gray-500 mb-1">模板名称</label>
              <input
                type="text"
                value={formName}
                onChange={e => setFormName(e.target.value)}
                placeholder="如：标准桌访问卷"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            {/* Questions */}
            <div className="mb-4">
              <label className="block text-xs text-gray-500 mb-2">问题列表</label>
              <div className="space-y-2">
                {formQuestions.map((q, idx) => (
                  <div key={q.id} className="flex gap-2 items-start">
                    <span className="text-xs text-gray-400 mt-2.5 w-4 text-right flex-shrink-0">{idx + 1}</span>
                    <input
                      type="text"
                      value={q.text}
                      onChange={e => updateQuestion(idx, 'text', e.target.value)}
                      placeholder="问题内容"
                      className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                    <input
                      type="text"
                      value={q.category}
                      onChange={e => updateQuestion(idx, 'category', e.target.value)}
                      placeholder="分类"
                      className="w-16 px-2 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                    <div className="flex flex-col gap-0.5">
                      <button
                        onClick={() => moveQuestion(idx, -1)}
                        disabled={idx === 0}
                        className="text-gray-400 hover:text-gray-600 disabled:opacity-30 text-xs"
                      >
                        ▲
                      </button>
                      <button
                        onClick={() => moveQuestion(idx, 1)}
                        disabled={idx === formQuestions.length - 1}
                        className="text-gray-400 hover:text-gray-600 disabled:opacity-30 text-xs"
                      >
                        ▼
                      </button>
                    </div>
                    <button
                      onClick={() => removeQuestion(idx)}
                      disabled={formQuestions.length <= 1}
                      className="text-red-400 hover:text-red-600 disabled:opacity-30 mt-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
              <button
                onClick={addQuestion}
                className="mt-2 text-xs text-primary-600 hover:text-primary-700"
              >
                + 添加问题
              </button>
            </div>

            {/* Active toggle + dates */}
            <div className="flex gap-4 mb-4 items-center flex-wrap">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={formActive}
                  onChange={e => setFormActive(e.target.checked)}
                  className="rounded"
                />
                立即启用
              </label>
              <div className="flex items-center gap-1">
                <label className="text-xs text-gray-500">从</label>
                <input
                  type="date"
                  value={formFrom}
                  onChange={e => setFormFrom(e.target.value)}
                  className="text-xs border border-gray-200 rounded px-2 py-1"
                />
              </div>
              <div className="flex items-center gap-1">
                <label className="text-xs text-gray-500">到</label>
                <input
                  type="date"
                  value={formTo}
                  onChange={e => setFormTo(e.target.value)}
                  className="text-xs border border-gray-200 rounded px-2 py-1"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 justify-end">
              <button
                onClick={closeForm}
                className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !formName.trim() || formQuestions.every(q => !q.text.trim())}
                className="px-4 py-2 text-sm text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50"
              >
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
