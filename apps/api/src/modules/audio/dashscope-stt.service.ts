// DashScope Paraformer-v2 STT Service
// Uses Alibaba DashScope batch transcription API with speaker diarization

import { Injectable, Logger } from '@nestjs/common';

// Submit endpoint for transcription tasks
const DASHSCOPE_SUBMIT_URL =
  'https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription';
// Task query endpoint (different path from submit)
const DASHSCOPE_TASK_URL =
  'https://dashscope.aliyuncs.com/api/v1/tasks';

// Polling config: exponential backoff 1s → 2s → 4s → ... → 10s cap
const POLL_BASE_DELAY_MS = 1000;
const POLL_MAX_DELAY_MS = 10000;
const POLL_DEFAULT_TIMEOUT_MS = 120000;

interface TranscriptionWord {
  text: string;
  speaker_id?: number;
}

interface TranscriptionResult {
  transcription_url?: string;
  file_url?: string;
}

interface TaskResponse {
  request_id: string;
  output: {
    task_id: string;
    task_status: string;
    results?: TranscriptionResult[];
  };
}

@Injectable()
export class DashScopeSttService {
  private readonly logger = new Logger(DashScopeSttService.name);

  /**
   * Check if DashScope is configured
   */
  isConfigured(): boolean {
    return !!process.env.DASHSCOPE_API_KEY;
  }

  /**
   * Transcribe audio using DashScope Paraformer-v2
   * @param audioUrl Public URL of the audio file (Supabase Storage)
   * @param speakerCount Expected number of speakers (2 for table visit, 4 for meeting)
   * @param timeoutMs Polling timeout in ms (default 120s, use longer for meetings)
   * @returns Transcript with speaker labels (e.g. "说话人1: xxx\n说话人2: yyy")
   */
  async transcribe(
    audioUrl: string,
    speakerCount = 2,
    timeoutMs = POLL_DEFAULT_TIMEOUT_MS,
  ): Promise<string> {
    const apiKey = process.env.DASHSCOPE_API_KEY;
    if (!apiKey) {
      throw new Error('DASHSCOPE_NOT_CONFIGURED: DashScope API Key 未配置');
    }

    this.logger.log(`Using DashScope Paraformer-v2 for STT (speakers: ${speakerCount})`);

    // Step 1: Submit transcription task
    const taskId = await this.submitTask(apiKey, audioUrl, speakerCount);
    this.logger.log(`Task submitted: ${taskId}`);

    // Step 2: Poll for result
    const result = await this.pollResult(apiKey, taskId, timeoutMs);
    this.logger.log(`Task ${taskId} completed`);

    return result;
  }

  /**
   * Submit a transcription task to DashScope
   */
  private async submitTask(
    apiKey: string,
    audioUrl: string,
    speakerCount: number,
  ): Promise<string> {
    const body = {
      model: 'paraformer-v2',
      input: {
        file_urls: [audioUrl],
      },
      parameters: {
        language_hints: ['zh'],
        diarization_enabled: true,
        speaker_count: speakerCount,
      },
    };

    const response = await fetch(DASHSCOPE_SUBMIT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'X-DashScope-Async': 'enable',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error(`DashScope submit error: ${response.status} - ${errorText}`);
      throw new Error(`DASHSCOPE_SUBMIT_ERROR: ${response.status} - ${errorText}`);
    }

    const data: TaskResponse = await response.json();
    const taskId = data.output?.task_id;

    if (!taskId) {
      throw new Error('DASHSCOPE_NO_TASK_ID: 提交任务未返回 task_id');
    }

    return taskId;
  }

  /**
   * Poll task status until completion or timeout
   */
  private async pollResult(apiKey: string, taskId: string, timeoutMs: number): Promise<string> {
    const startTime = Date.now();
    let delay = POLL_BASE_DELAY_MS;

    while (Date.now() - startTime < timeoutMs) {
      await this.sleep(delay);

      const response = await fetch(
        `${DASHSCOPE_TASK_URL}/${taskId}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.warn(`DashScope poll error: ${response.status} - ${errorText}`);
        // Non-transient errors (4xx except 429): fail immediately
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          throw new Error(`DASHSCOPE_POLL_ERROR: ${response.status} - ${errorText}`);
        }
        // Transient errors (5xx, 429): continue polling with backoff
        delay = Math.min(delay * 2, POLL_MAX_DELAY_MS);
        continue;
      }

      const data: TaskResponse = await response.json();
      const status = data.output?.task_status;

      if (status === 'SUCCEEDED') {
        return this.extractTranscript(data);
      }

      if (status === 'FAILED') {
        this.logger.error(`DashScope task ${taskId} failed`);
        throw new Error('DASHSCOPE_TASK_FAILED: 转写任务失败');
      }

      // PENDING or RUNNING — keep polling with exponential backoff
      delay = Math.min(delay * 2, POLL_MAX_DELAY_MS);
    }

    throw new Error(`DASHSCOPE_TIMEOUT: 转写任务超时 (${Math.round(timeoutMs / 1000)}s)`);
  }

  /**
   * Extract transcript text from completed task result
   * Downloads the transcription_url JSON and formats with speaker labels
   */
  private async extractTranscript(taskData: TaskResponse): Promise<string> {
    const results = taskData.output?.results;
    if (!results || results.length === 0) {
      throw new Error('DASHSCOPE_NO_RESULTS: 转写成功但无结果');
    }

    const transcriptionUrl = results[0].transcription_url;
    if (!transcriptionUrl) {
      throw new Error('DASHSCOPE_NO_TRANSCRIPTION_URL: 转写成功但无 transcription_url');
    }

    // Download the detailed transcription result
    // transcription_url is a pre-signed OSS URL, no auth header needed
    const response = await fetch(transcriptionUrl);

    if (!response.ok) {
      throw new Error(`DASHSCOPE_FETCH_ERROR: 获取转写结果失败 ${response.status}`);
    }

    const detail = await response.json();

    // Extract words/sentences with speaker info
    // DashScope returns: { transcripts: [{ sentences: [{ text, speaker_id }] }] }
    // or: { transcripts: [{ text, words: [{ text, speaker_id }] }] }
    const transcripts = detail.transcripts || [];
    if (transcripts.length === 0) {
      throw new Error('DASHSCOPE_EMPTY_TRANSCRIPT: 转写成功但 transcripts 为空');
    }

    const transcript = transcripts[0];

    // Try sentence-level speaker diarization first
    const sentences = transcript.sentences || [];
    if (sentences.length > 0 && sentences[0].speaker_id !== undefined) {
      return this.formatWithSpeakers(sentences);
    }

    // Try word-level speaker diarization
    const words: TranscriptionWord[] = transcript.words || [];
    if (words.length > 0 && words[0].speaker_id !== undefined) {
      return this.formatWordsWithSpeakers(words);
    }

    // Fallback: plain text without speaker labels
    const text = transcript.text || '';
    if (!text.trim()) {
      throw new Error('DASHSCOPE_EMPTY_TRANSCRIPT: 转写成功但文本为空');
    }
    return text;
  }

  /**
   * Format sentences with speaker labels
   * Input: [{ text: "你好", speaker_id: 0 }, { text: "请坐", speaker_id: 1 }]
   * Output: "说话人1: 你好\n说话人2: 请坐"
   */
  private formatWithSpeakers(
    sentences: Array<{ text: string; speaker_id?: number }>,
  ): string {
    const lines: string[] = [];
    let currentSpeaker: number | undefined;

    for (const sentence of sentences) {
      const speakerId = sentence.speaker_id;
      if (speakerId !== undefined && speakerId !== currentSpeaker) {
        currentSpeaker = speakerId;
        lines.push(`说话人${speakerId + 1}: ${sentence.text}`);
      } else {
        // Same speaker continues — append to last line
        if (lines.length > 0) {
          lines[lines.length - 1] += sentence.text;
        } else {
          lines.push(sentence.text);
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * Format word-level results grouped by speaker
   */
  private formatWordsWithSpeakers(words: TranscriptionWord[]): string {
    const lines: string[] = [];
    let currentSpeaker: number | undefined;
    let currentText = '';

    for (const word of words) {
      if (word.speaker_id !== undefined && word.speaker_id !== currentSpeaker) {
        // Flush previous speaker's text
        if (currentText) {
          const label = currentSpeaker !== undefined ? `说话人${currentSpeaker + 1}: ` : '';
          lines.push(`${label}${currentText}`);
        }
        currentSpeaker = word.speaker_id;
        currentText = word.text;
      } else {
        currentText += word.text;
      }
    }

    // Flush last segment
    if (currentText) {
      const label = currentSpeaker !== undefined ? `说话人${currentSpeaker + 1}: ` : '';
      lines.push(`${label}${currentText}`);
    }

    return lines.join('\n');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
