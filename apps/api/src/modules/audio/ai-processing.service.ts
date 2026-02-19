// AI Processing Service - Handles STT and AI tagging pipeline
// v5.0 - DashScope Paraformer-v2 STT (with Xunfei fallback) + Gemini 2.5 Flash

import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { XunfeiSttService } from './xunfei-stt.service';
import { DashScopeSttService } from './dashscope-stt.service';

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
    private readonly dashScopeStt: DashScopeSttService,
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

      // Step 2.5: Clean transcript before AI processing
      const cleanedTranscript = this.cleanTranscript(rawTranscript);
      this.logger.log(`清洗完成: ${rawTranscript.length}字 → ${cleanedTranscript.length}字`);

      // Step 2.6: Handle cleaned transcript being empty (all filler words)
      if (!cleanedTranscript.trim()) {
        this.logger.warn(`清洗后无有效内容，跳过AI处理`);
        const fillerResult = {
          correctedTranscript: rawTranscript,
          aiSummary: '语音内容无有效信息',
          sentimentScore: 0.5,
          feedbacks: [] as FeedbackItem[],
          managerQuestions: [] as string[],
          customerAnswers: [] as string[],
        };
        await this.saveResults(recordingId, { rawTranscript, ...fillerResult });
        return { transcript: rawTranscript, ...fillerResult };
      }

      // Step 3: AI Tagging (Gemini) - 只做打标，不做纠偏
      const aiResult = await this.processWithGemini(cleanedTranscript);
      // correctedTranscript 保留原始 STT 结果（用于调试对比）
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
   * Transcribe audio: DashScope Paraformer-v2 first, fallback to 讯飞
   */
  private async transcribeAudio(audioUrl: string): Promise<string> {
    // Try DashScope first if configured
    if (this.dashScopeStt.isConfigured()) {
      try {
        const transcript = await this.dashScopeStt.transcribe(audioUrl, 2);
        return transcript;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.warn(`DashScope STT failed, falling back to 讯飞: ${msg}`);
      }
    }

    // Fallback: 讯飞 STT
    const XUNFEI_APP_ID = process.env.XUNFEI_APP_ID;
    const XUNFEI_API_KEY = process.env.XUNFEI_API_KEY;
    const XUNFEI_API_SECRET = process.env.XUNFEI_API_SECRET;

    if (!XUNFEI_APP_ID || !XUNFEI_API_KEY || !XUNFEI_API_SECRET) {
      this.logger.error('讯飞 credentials not configured');
      throw new Error('STT_NOT_CONFIGURED: 语音识别未配置 (DashScope 和讯飞均不可用)');
    }

    this.logger.log('Using 讯飞 STT (fallback)');
    return this.xunfeiStt.transcribe(audioUrl);
  }

  /**
   * Clean raw STT transcript before AI analysis
   * - Deduplicate consecutive repeated phrases
   * - Remove filler-word-only segments
   * - Merge very short fragments into adjacent sentences
   */
  private cleanTranscript(raw: string): string {
    // If DashScope speaker labels are present, only do light dedup per line
    if (/说话人\d+[:：]/.test(raw)) {
      return raw
        .split('\n')
        .map((line) => line.replace(/(.{1,6})\1{2,}/g, '$1'))
        .join('\n');
    }

    // Split into segments by common delimiters (，。！？、；,.)
    let segments = raw.split(/(?<=[，。！？、；,.?!])\s*/);

    // If no delimiter was found, treat the whole text as one segment
    if (segments.length <= 1 && raw.length > 0) {
      segments = [raw];
    }

    // Step 1: Deduplicate consecutive repeated phrases
    // e.g. "好的好的好的" → "好的", "对对对" → "对"
    const deduped = segments.map((seg) => {
      // Match patterns where a short phrase (1-6 chars) repeats 3+ times consecutively
      return seg.replace(/(.{1,6})\1{2,}/g, '$1');
    });

    // Step 2: Filter out segments that are purely filler words
    const FILLER_PATTERN = /^[嗯啊哦额呃嗨哎唉呀哈嘿呢吧啦么吗的了哦噢嗷欸]+$/;
    const filtered = deduped.filter((seg) => {
      const trimmed = seg.replace(/[，。！？、；,.?!\s]/g, '');
      if (trimmed.length === 0) return false;
      return !FILLER_PATTERN.test(trimmed);
    });

    // Step 3: Merge very short fragments (<3 meaningful chars) into adjacent sentences
    const merged: string[] = [];
    for (const seg of filtered) {
      const meaningful = seg.replace(/[，。！？、；,.?!\s]/g, '');
      if (meaningful.length < 3 && merged.length > 0) {
        // Append to previous segment
        merged[merged.length - 1] += seg;
      } else {
        merged.push(seg);
      }
    }

    return merged.join('');
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

## 说话人识别指引
对话文本可能包含"说话人1:"、"说话人2:"等标签（来自语音识别的说话人分离）。
- 说话人1 通常是店长/服务员（主动提问、问候的一方）
- 说话人2 通常是顾客（回答、给出反馈的一方）
- 但你必须根据对话内容语义来判断角色，不要盲目信任标签
- 如果没有说话人标签，则根据上下文推断谁是店长、谁是顾客

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
1. sentimentScore: 反映整桌对话的整体氛围（顾客是否愉快），不是feedbacks的加权平均
   - < 0.4 = 负面氛围（顾客明显不满、抱怨）
   - 0.4 ~ 0.6 = 中性氛围（平淡交流、无明显情绪）
   - > 0.6 = 正面氛围（顾客满意、愉快）
   锚定示例：
   - 0.1~0.2: 顾客投诉、要求退菜、表达强烈不满
   - 0.3~0.4: 顾客有抱怨但语气平和，如"有点咸"、"等了挺久"
   - 0.5: 纯粹寒暄、顾客回答简短无情绪，如"还行"、"嗯可以"
   - 0.6~0.7: 顾客表达满意但不热烈，如"味道不错"、"挺好的"
   - 0.8~0.9: 顾客多次夸赞、明确表示会再来

2. feedbacks: 提取顾客对菜品、服务、环境的所有评价短语（不限数量，但不要编造）
   - 每条必须包含评价对象+评价词（如"清蒸鲈鱼很新鲜"而不是单独的"新鲜"）
   - 如果原文没有提到具体菜品，不要编造菜品名称，可用原文表述如"菜很好吃"
   - 一句话包含多个评价时拆分：如"菜好吃但上菜慢"→ 拆成两条
   - sentiment 判断标准（每条独立判断，不受整体氛围影响）：
     positive: 明确表达满意、喜欢、赞赏
       示例: "很好吃"、"味道不错"、"服务很热情"、"环境很舒服"、"不错"、"不用等"
     negative: 明确表达不满、批评、抱怨
       示例: "太咸了"、"上菜太慢"、"服务态度差"、"不新鲜"、"没什么味道"、"不行"
     neutral: 模糊评价、无法明确判断好坏
       示例: "还行"、"还可以"、"一般"、"马马虎虎"、"跟上次差不多"
   - 否定句式需结合上下文判断：
     "不辣"/"不咸"等：要看顾客是在抱怨还是在回答店长提问
     顾客主动说"不辣，没味道" → negative（在抱怨）
     回答店长"辣不辣"说"不辣，挺好的" → neutral 或 positive（在回应提问）

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
        model: 'google/gemini-2.5-flash',
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let result: any;
    try {
      result = JSON.parse(jsonMatch[0]);
    } catch {
      this.logger.error(`AI返回无效JSON: ${jsonMatch[0].substring(0, 200)}`);
      throw new Error('AI_PARSE_ERROR: 无法解析 AI 返回的JSON');
    }

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
