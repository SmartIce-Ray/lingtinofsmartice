// AI Processing Service - Handles STT and AI tagging pipeline
// v3.9 - 去掉Gemini纠偏步骤，方言大模型STT结果直接作为最终文本

import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { XunfeiSttService } from './xunfei-stt.service';

// OpenRouter API Configuration
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Feedback item with sentiment label
export interface FeedbackItem {
  text: string;
  sentiment: 'positive' | 'negative' | 'neutral';
}

// Simplified MVP result structure (5 dimensions)
interface ProcessingResult {
  transcript: string;
  correctedTranscript: string;
  aiSummary: string;           // 20字摘要
  sentimentScore: number;       // 0-1 情绪分
  feedbacks: FeedbackItem[];    // 评价短语列表（带情绪标签）
  managerQuestions: string[];   // 店长问了什么
  customerAnswers: string[];    // 顾客怎么回答
}

@Injectable()
export class AiProcessingService {
  private readonly logger = new Logger(AiProcessingService.name);
  // In-memory lock to prevent concurrent processing of the same recording
  private processingLocks = new Set<string>();

  constructor(
    private readonly supabase: SupabaseService,
    private readonly xunfeiStt: XunfeiSttService,
  ) {}

  /**
   * Main processing pipeline
   * Includes duplicate prevention: checks status and uses in-memory lock
   */
  async processAudio(
    recordingId: string,
    audioUrl: string,
    tableId: string,
    restaurantId: string,
  ): Promise<ProcessingResult> {
    // Check if already being processed (in-memory lock)
    if (this.processingLocks.has(recordingId)) {
      this.logger.warn(`Recording ${recordingId} is already being processed (locked)`);
      throw new Error('Recording is already being processed');
    }

    // Check database status to prevent re-processing completed records
    const currentStatus = await this.getRecordingStatus(recordingId);
    if (currentStatus === 'processed' || currentStatus === 'processing') {
      this.logger.warn(`Recording ${recordingId} already has status: ${currentStatus}`);
      throw new Error(`Recording already ${currentStatus}`);
    }

    // Acquire lock
    this.processingLocks.add(recordingId);

    try {
      // Update status to 'processing' in database
      await this.updateRecordingStatus(recordingId, 'processing');

      const startTime = Date.now();
      this.logger.log(`Pipeline: ${tableId} 开始处理`);

      // Step 1: Speech-to-Text (讯飞)
      const rawTranscript = await this.transcribeAudio(audioUrl);
      this.logger.log(`STT完成: ${rawTranscript.length}字`);

      // Step 2: Handle empty transcript - skip AI processing
      if (!rawTranscript || rawTranscript.trim().length === 0) {
        this.logger.warn(`空音频或无法识别，跳过AI处理`);
        const emptyResult = {
          correctedTranscript: '',
          aiSummary: '无法识别语音内容',
          sentimentScore: 0.5,
          feedbacks: [],
          managerQuestions: [],
          customerAnswers: [],
        };
        await this.saveResults(recordingId, {
          rawTranscript: '',
          ...emptyResult,
        });
        return {
          transcript: '',
          ...emptyResult,
        };
      }

      // Step 3: AI Tagging (Gemini) - 只做打标，不做纠偏
      const aiResult = await this.processWithGemini(rawTranscript);
      // STT结果直接作为correctedTranscript（方言大模型已足够准确）
      aiResult.correctedTranscript = rawTranscript;
      this.logger.log(`AI完成: ${aiResult.aiSummary}`);

      // Step 4: Save results to database
      await this.saveResults(recordingId, {
        rawTranscript,
        ...aiResult,
      });

      const totalTime = Date.now() - startTime;
      this.logger.log(`Pipeline: ${tableId} 完成 (${(totalTime / 1000).toFixed(1)}s)`);

      return {
        transcript: rawTranscript,
        ...aiResult,
      };
    } catch (error) {
      // Update database status to 'error' on any failure
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Pipeline failed for ${recordingId}: ${errorMessage}`);

      await this.saveErrorStatus(recordingId, errorMessage);

      throw error; // Re-throw for caller
    } finally {
      // Always release lock when done
      this.processingLocks.delete(recordingId);
    }
  }

  /**
   * Get current status of a recording from database
   */
  private async getRecordingStatus(recordingId: string): Promise<string | null> {
    if (this.supabase.isMockMode()) {
      return null;
    }

    const client = this.supabase.getClient();
    const { data, error } = await client
      .from('lingtin_visit_records')
      .select('status')
      .eq('id', recordingId)
      .single();

    if (error) {
      this.logger.warn(`Failed to get status for ${recordingId}: ${error.message}`);
      return null;
    }

    return data?.status || null;
  }

  /**
   * Update recording status in database
   */
  private async updateRecordingStatus(recordingId: string, status: string): Promise<void> {
    if (this.supabase.isMockMode()) {
      this.logger.log(`[MOCK] Would update status to ${status} for ${recordingId}`);
      return;
    }

    const client = this.supabase.getClient();
    const { error } = await client
      .from('lingtin_visit_records')
      .update({ status })
      .eq('id', recordingId);

    if (error) {
      this.logger.error(`Failed to update status for ${recordingId}: ${error.message}`);
    }
  }

  /**
   * Save error status to database when processing fails
   */
  private async saveErrorStatus(recordingId: string, errorMessage: string): Promise<void> {
    if (this.supabase.isMockMode()) {
      this.logger.log(`[MOCK] Would save error status for ${recordingId}: ${errorMessage}`);
      return;
    }

    const client = this.supabase.getClient();
    const { error } = await client
      .from('lingtin_visit_records')
      .update({
        status: 'error',
        error_message: errorMessage,
        processed_at: new Date().toISOString(),
      })
      .eq('id', recordingId);

    if (error) {
      this.logger.error(`Failed to save error status for ${recordingId}: ${error.message}`);
    } else {
      this.logger.log(`Error status saved for ${recordingId}`);
    }
  }

  /**
   * Transcribe audio using 讯飞 STT (WebSocket-based, non-streaming)
   * Throws error if credentials not configured or STT fails
   */
  private async transcribeAudio(audioUrl: string): Promise<string> {
    const XUNFEI_APP_ID = process.env.XUNFEI_APP_ID;
    const XUNFEI_API_KEY = process.env.XUNFEI_API_KEY;
    const XUNFEI_API_SECRET = process.env.XUNFEI_API_SECRET;

    // Check if 讯飞 credentials are configured
    if (!XUNFEI_APP_ID || !XUNFEI_API_KEY || !XUNFEI_API_SECRET) {
      this.logger.error('讯飞 credentials not configured');
      throw new Error('STT_NOT_CONFIGURED: 讯飞语音识别未配置');
    }

    // Use 讯飞 STT service to transcribe audio
    const transcript = await this.xunfeiStt.transcribe(audioUrl);
    return transcript;
  }

  /**
   * Process transcript with AI for correction and tagging
   * Throws error if API key not configured or processing fails
   */
  private async processWithGemini(
    transcript: string,
  ): Promise<Omit<ProcessingResult, 'transcript'>> {
    // Read API key at runtime
    const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

    if (!OPENROUTER_API_KEY) {
      this.logger.error('OpenRouter API key not configured');
      throw new Error('AI_NOT_CONFIGURED: OpenRouter AI 未配置');
    }

    const systemPrompt = `分析餐饮桌访对话，提取结构化信息。

输出JSON格式（只输出JSON，无其他内容）：
{
  "aiSummary": "20字以内摘要",
  "sentimentScore": 0.5,
  "feedbacks": [
    {"text": "清蒸鲈鱼很新鲜", "sentiment": "positive"},
    {"text": "上菜太慢", "sentiment": "negative"}
  ],
  "managerQuestions": ["店长问的问题1", "店长问的问题2"],
  "customerAnswers": ["顾客的回答1", "顾客的回答2"]
}

规则：
1. sentimentScore: 0-1分，0=极差，0.5=中性，1=极好
2. feedbacks: 提取顾客的评价短语，每个评价必须包含主语+评价词（如"清蒸鲈鱼很新鲜"而不是单独的"新鲜"）
   - sentiment: positive（正面）/ negative（负面）/ neutral（中性）
   - 只提取有明确情绪倾向的评价，最多5个
   - 如果原文没有提到具体菜品，不要在feedbacks中添加菜品名称
3. managerQuestions: 店长/服务员说的话（通常是问候或询问）
4. customerAnswers: 顾客的回复内容
5. 如果某项为空，返回空数组[]`;

    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'google/gemini-2.0-flash-001',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `对话文本：\n${transcript}` },
        ],
        temperature: 0.3,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error(`OpenRouter API error: ${response.status} - ${errorText}`);
      throw new Error(`AI_API_ERROR: OpenRouter API 错误 ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('AI_EMPTY_RESPONSE: OpenRouter 返回空结果');
    }

    // Strip markdown code block markers if present
    let cleanContent = content.trim();
    if (cleanContent.startsWith('```json')) {
      cleanContent = cleanContent.replace(/^```json\s*/, '').replace(/```\s*$/, '');
    } else if (cleanContent.startsWith('```')) {
      cleanContent = cleanContent.replace(/^```\s*/, '').replace(/```\s*$/, '');
    }

    // Parse JSON response - try to find JSON object in the content
    const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      this.logger.error(`AI返回无效JSON: ${cleanContent.substring(0, 200)}`);
      throw new Error('AI_PARSE_ERROR: 无法解析 AI 返回结果');
    }

    const result = JSON.parse(jsonMatch[0]);

    return {
      correctedTranscript: '', // 由调用方设置为rawTranscript
      aiSummary: result.aiSummary || '无摘要',
      sentimentScore: parseFloat(result.sentimentScore) || 0.5,
      feedbacks: result.feedbacks || [],
      managerQuestions: result.managerQuestions || [],
      customerAnswers: result.customerAnswers || [],
    };
  }

  /**
   * Save processing results to database
   */
  private async saveResults(
    recordingId: string,
    result: {
      rawTranscript: string;
      correctedTranscript: string;
      aiSummary: string;
      sentimentScore: number;
      feedbacks: FeedbackItem[];
      managerQuestions: string[];
      customerAnswers: string[];
    },
  ): Promise<void> {
    // Check if running in mock mode
    if (this.supabase.isMockMode()) {
      this.logger.log(`[MOCK] 保存结果: ${result.aiSummary}`);
      return;
    }

    const client = this.supabase.getClient();

    // Update visit record with simplified MVP fields
    const { error: updateError } = await client
      .from('lingtin_visit_records')
      .update({
        raw_transcript: result.rawTranscript,
        corrected_transcript: result.correctedTranscript,
        ai_summary: result.aiSummary,
        sentiment_score: result.sentimentScore,
        feedbacks: result.feedbacks,
        manager_questions: result.managerQuestions,
        customer_answers: result.customerAnswers,
        status: 'processed',
        processed_at: new Date().toISOString(),
      })
      .eq('id', recordingId);

    if (updateError) {
      this.logger.error(`Failed to update visit record: ${updateError.message}`);
    }
  }
}
