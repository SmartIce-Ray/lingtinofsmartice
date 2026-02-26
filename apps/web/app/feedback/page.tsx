// Feedback Submit Page - All roles can submit text/voice feedback with image attachments
// Voice uses useAudioRecorder hook, text is direct input
// Both modes support up to 3 image attachments

'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, getAuthHeaders } from '@/contexts/AuthContext';
import { getApiUrl } from '@/lib/api';
import { useAudioRecorder } from '@/hooks/useAudioRecorder';
import { UserMenu } from '@/components/layout/UserMenu';

type InputMode = 'text' | 'voice';

const MAX_IMAGES = 3;

const CATEGORY_LABELS: Record<string, string> = {
  bug: '系统故障',
  feature_request: '功能需求',
  usability: '易用性',
  performance: '性能',
  content: '内容质量',
  other: '其他',
};

const PRIORITY_LABELS: Record<string, { label: string; color: string }> = {
  high: { label: '高', color: 'text-red-600 bg-red-50' },
  medium: { label: '中', color: 'text-amber-600 bg-amber-50' },
  low: { label: '低', color: 'text-green-600 bg-green-50' },
};

export default function FeedbackPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<InputMode>('text');
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<{
    id: string;
    category: string;
    ai_summary: string;
    priority: string;
    tags: string[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Image attachments
  const [images, setImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [uploadingImages, setUploadingImages] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [recorderState, recorderActions] = useAudioRecorder();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  if (!user) return null;

  const handleAddImages = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const remaining = MAX_IMAGES - images.length;
    const toAdd = files.slice(0, remaining);

    setImages((prev) => [...prev, ...toAdd]);
    toAdd.forEach((file) => {
      const url = URL.createObjectURL(file);
      setImagePreviews((prev) => [...prev, url]);
    });

    // Reset input so same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveImage = (index: number) => {
    URL.revokeObjectURL(imagePreviews[index]);
    setImages((prev) => prev.filter((_, i) => i !== index));
    setImagePreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const uploadImages = async (): Promise<string[]> => {
    if (images.length === 0) return [];
    setUploadingImages(true);
    try {
      const formData = new FormData();
      images.forEach((file) => formData.append('files', file));
      formData.append('restaurant_id', user.restaurantId);

      const res = await fetch(getApiUrl('api/feedback/upload-images'), {
        method: 'POST',
        headers: getAuthHeaders(),
        body: formData,
      });

      if (!res.ok) throw new Error(`图片上传失败 (${res.status})`);
      const json = await res.json();
      return json.data || [];
    } finally {
      setUploadingImages(false);
    }
  };

  const handleSubmitText = async () => {
    if (!text.trim()) return;
    setSubmitting(true);
    setError(null);

    try {
      // Upload images first if any
      const imageUrls = await uploadImages();

      const res = await fetch(getApiUrl('api/feedback/submit'), {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurant_id: user.restaurantId,
          employee_id: user.id,
          content_text: text.trim(),
          image_urls: imageUrls,
        }),
      });

      if (!res.ok) throw new Error(`提交失败 (${res.status})`);
      const json = await res.json();
      setResult(json.data);
      setText('');
      clearImages();
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitVoice = async () => {
    if (!recorderState.audioBlob) return;
    setSubmitting(true);
    setError(null);

    try {
      // Upload images first if any
      const imageUrls = await uploadImages();

      // Step 1: Upload voice
      const formData = new FormData();
      const ext = recorderState.audioBlob.type.includes('mp4') ? 'mp4' : 'webm';
      formData.append('file', recorderState.audioBlob, `feedback.${ext}`);
      formData.append('restaurant_id', user.restaurantId);
      formData.append('employee_id', user.id);
      formData.append('duration_seconds', String(recorderState.duration));
      if (imageUrls.length > 0) {
        formData.append('image_urls', JSON.stringify(imageUrls));
      }

      const uploadRes = await fetch(getApiUrl('api/feedback/submit-voice'), {
        method: 'POST',
        headers: getAuthHeaders(),
        body: formData,
      });

      if (!uploadRes.ok) throw new Error(`上传失败 (${uploadRes.status})`);
      const uploadJson = await uploadRes.json();
      const feedbackId = uploadJson.data.id;
      const audioUrl = uploadJson.data.audio_url;

      // Step 2: Process (STT + AI)
      setProcessing(true);
      const processRes = await fetch(getApiUrl(`api/feedback/${feedbackId}/process`), {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio_url: audioUrl }),
      });

      if (!processRes.ok) throw new Error(`处理失败 (${processRes.status})`);
      const processJson = await processRes.json();
      setResult(processJson.data);
      recorderActions.resetRecording();
      clearImages();
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交失败');
    } finally {
      setSubmitting(false);
      setProcessing(false);
    }
  };

  const clearImages = () => {
    imagePreviews.forEach((url) => URL.revokeObjectURL(url));
    setImages([]);
    setImagePreviews([]);
  };

  const handleNewFeedback = () => {
    setResult(null);
    setError(null);
    setText('');
    clearImages();
    recorderActions.resetRecording();
  };

  // Format duration as mm:ss
  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  // Camera button overlay (positioned inside textarea wrapper)
  const cameraButton = images.length < MAX_IMAGES ? (
    <button
      type="button"
      onClick={() => fileInputRef.current?.click()}
      className="absolute right-3 bottom-3 w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
    >
      <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
      </svg>
    </button>
  ) : null;

  // Scrollable image preview strip (only shown when images exist)
  const imagePreviewStrip = imagePreviews.length > 0 ? (
    <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
      {imagePreviews.map((url, i) => (
        <div key={i} className="relative flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border border-gray-200">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={`附件 ${i + 1}`} className="w-full h-full object-cover" />
          <button
            onClick={() => handleRemoveImage(i)}
            className="absolute top-0.5 right-0.5 w-4.5 h-4.5 bg-black/50 rounded-full flex items-center justify-center"
          >
            <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  ) : null;

  // Hidden file input (shared)
  const hiddenFileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept="image/*"
      multiple
      onChange={handleAddImages}
      className="hidden"
    />
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-lg font-semibold text-gray-900">提交反馈</h1>
        </div>
        <UserMenu />
      </header>

      <div className="px-4 py-4 space-y-4 max-w-lg mx-auto">
        {/* Result card (shown after submission) */}
        {result && (
          <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <span className="text-base font-medium text-gray-900">提交成功</span>
            </div>

            {result.ai_summary && (
              <p className="text-sm text-gray-700">{result.ai_summary}</p>
            )}

            <div className="flex flex-wrap gap-2">
              {result.category && (
                <span className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded-full">
                  {CATEGORY_LABELS[result.category] || result.category}
                </span>
              )}
              {result.priority && PRIORITY_LABELS[result.priority] && (
                <span className={`text-xs px-2 py-1 rounded-full ${PRIORITY_LABELS[result.priority].color}`}>
                  优先级: {PRIORITY_LABELS[result.priority].label}
                </span>
              )}
              {result.tags?.map((tag, i) => (
                <span key={i} className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded-full">
                  {tag}
                </span>
              ))}
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={handleNewFeedback}
                className="flex-1 py-2.5 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700"
              >
                继续反馈
              </button>
              <button
                onClick={() => router.push('/feedback/history')}
                className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200"
              >
                查看历史
              </button>
            </div>
          </div>
        )}

        {/* Input area (hidden after submission) */}
        {!result && (
          <>
            {/* Mode selector */}
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => setMode('text')}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                  mode === 'text' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                }`}
              >
                文字
              </button>
              <button
                onClick={() => setMode('voice')}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                  mode === 'voice' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                }`}
              >
                语音
              </button>
            </div>

            {/* Shared hidden file input (rendered once) */}
            {hiddenFileInput}

            {/* Text mode */}
            {mode === 'text' && (
              <div className="space-y-3">
                <div className="relative">
                  <textarea
                    ref={textareaRef}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="描述你遇到的问题或想要的功能..."
                    className="w-full h-40 bg-white rounded-xl p-4 pr-14 text-sm text-gray-900 placeholder:text-gray-400 border border-gray-200 focus:border-primary-400 focus:ring-1 focus:ring-primary-400 outline-none resize-none"
                  />
                  {cameraButton}
                </div>
                {imagePreviewStrip}
                <button
                  onClick={handleSubmitText}
                  disabled={!text.trim() || submitting}
                  className="w-full py-3 bg-primary-600 text-white rounded-xl text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary-700 transition-colors"
                >
                  {submitting ? (uploadingImages ? '上传图片...' : '提交中...') : '提交反馈'}
                </button>
              </div>
            )}

            {/* Voice mode */}
            {mode === 'voice' && (
              <div className="space-y-4">
                <div className="bg-white rounded-xl p-6 flex flex-col items-center space-y-4">
                  {/* Recording state */}
                  {recorderState.isRecording && (
                    <>
                      <div className="text-2xl font-mono text-gray-900">
                        {formatDuration(recorderState.duration)}
                      </div>
                      {/* Waveform visualization */}
                      <div className="flex items-center justify-center gap-0.5 h-12 w-full">
                        {recorderState.analyserData &&
                          Array.from(recorderState.analyserData)
                            .filter((_, i) => i % 4 === 0)
                            .slice(0, 32)
                            .map((v, i) => (
                              <div
                                key={i}
                                className="w-1.5 bg-primary-400 rounded-full transition-all duration-75"
                                style={{ height: `${Math.max(4, ((v - 128) / 128) * 48 + 4)}px` }}
                              />
                            ))}
                      </div>
                      <button
                        onClick={recorderActions.stopRecording}
                        className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center shadow-lg hover:bg-red-600 transition-colors"
                      >
                        <div className="w-6 h-6 bg-white rounded-sm" />
                      </button>
                      <p className="text-xs text-gray-400">点击停止录音</p>
                    </>
                  )}

                  {/* Ready to record */}
                  {!recorderState.isRecording && !recorderState.audioBlob && (
                    <>
                      <p className="text-sm text-gray-500">点击开始录音，描述你的反馈</p>
                      <button
                        onClick={recorderActions.startRecording}
                        className="w-16 h-16 bg-primary-600 rounded-full flex items-center justify-center shadow-lg hover:bg-primary-700 transition-colors"
                      >
                        <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                          <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                        </svg>
                      </button>
                    </>
                  )}

                  {/* Recording complete - preview */}
                  {!recorderState.isRecording && recorderState.audioBlob && (
                    <>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        录音完成 ({formatDuration(recorderState.duration)})
                      </div>
                      {recorderState.audioUrl && (
                        <audio src={recorderState.audioUrl} controls className="w-full" />
                      )}
                      <div className="flex gap-2 w-full">
                        <button
                          onClick={recorderActions.resetRecording}
                          className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200"
                        >
                          重录
                        </button>
                        <button
                          onClick={handleSubmitVoice}
                          disabled={submitting}
                          className="flex-1 py-2.5 bg-primary-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-primary-700"
                        >
                          {submitting ? (processing ? 'AI 分析中...' : uploadingImages ? '上传图片...' : '上传中...') : '提交'}
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {/* Image attachments for voice mode */}
                <div className="flex items-center gap-2">
                  {images.length < MAX_IMAGES && (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors py-1"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
                      </svg>
                      添加图片
                    </button>
                  )}
                </div>
                {imagePreviewStrip}

                {recorderState.error && (
                  <p className="text-sm text-red-500 text-center">{recorderState.error}</p>
                )}
              </div>
            )}
          </>
        )}

        {/* Error message */}
        {error && (
          <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3">
            {error}
          </div>
        )}

        {/* Quick link to history */}
        {!result && (
          <button
            onClick={() => router.push('/feedback/history')}
            className="w-full py-2.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            查看我的反馈历史 →
          </button>
        )}
      </div>
    </div>
  );
}
