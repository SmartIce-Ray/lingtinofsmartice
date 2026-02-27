// AI Processing Service - Handles STT and AI tagging pipeline
// v7.0 - Satisfaction scoring: per-item score 0-100, system-calculated overall satisfaction

import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { XunfeiSttService } from './xunfei-stt.service';
import { DashScopeSttService } from './dashscope-stt.service';

// OpenRouter API Configuration
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Feedback item with sentiment label and satisfaction score
export interface FeedbackItem {
  text: string;
  sentiment: 'positive' | 'negative' | 'neutral' | 'suggestion';
  score: number; // 0-100 per-item satisfaction score
}

// Simplified MVP result structure (5 dimensions)
interface ProcessingResult {
  transcript: string;
  correctedTranscript: string;
  aiSummary: string;           // 20字摘要
  sentimentScore: number;       // 0-100 满意度（系统计算）
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
          sentimentScore: 60,
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
          sentimentScore: 60,
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
   * Re-analyze a single processed record: skip STT, re-run clean + AI + save.
   * Returns result object instead of throwing, so batch caller can continue on failure.
   * Does NOT set status to 'error' on failure (record stays 'processed').
   */
  async reanalyzeRecord(
    recordingId: string,
  ): Promise<{ success: boolean; aiSummary?: string; error?: string }> {
    if (this.processingLocks.has(recordingId)) {
      return { success: false, error: 'Already being processed (locked)' };
    }

    this.processingLocks.add(recordingId);
    try {
      const client = this.supabase.getClient();
      const { data, error } = await client
        .from('lingtin_visit_records')
        .select('raw_transcript')
        .eq('id', recordingId)
        .single();

      if (error || !data?.raw_transcript) {
        return { success: false, error: `No raw_transcript: ${error?.message || 'empty'}` };
      }

      const rawTranscript: string = data.raw_transcript;

      // Empty transcript — skip AI, just update processed_at
      if (!rawTranscript.trim()) {
        await this.saveResults(recordingId, {
          rawTranscript,
          correctedTranscript: '',
          aiSummary: '无法识别语音内容',
          sentimentScore: 60,
          feedbacks: [],
          managerQuestions: [],
          customerAnswers: [],
        });
        return { success: true, aiSummary: '无法识别语音内容' };
      }

      const cleanedTranscript = this.cleanTranscript(rawTranscript);

      if (!cleanedTranscript.trim()) {
        await this.saveResults(recordingId, {
          rawTranscript,
          correctedTranscript: rawTranscript,
          aiSummary: '语音内容无有效信息',
          sentimentScore: 60,
          feedbacks: [],
          managerQuestions: [],
          customerAnswers: [],
        });
        return { success: true, aiSummary: '语音内容无有效信息' };
      }

      const aiResult = await this.processWithGemini(cleanedTranscript);
      aiResult.correctedTranscript = rawTranscript;

      await this.saveResults(recordingId, { rawTranscript, ...aiResult });
      this.logger.log(`Reanalyzed ${recordingId}: ${aiResult.aiSummary}`);
      return { success: true, aiSummary: aiResult.aiSummary };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Reanalyze failed ${recordingId}: ${msg}`);
      return { success: false, error: msg };
    } finally {
      this.processingLocks.delete(recordingId);
    }
  }

  /**
   * Batch re-analyze processed records whose processed_at < cutoffDate.
   * Processes sequentially with 500ms delay between records to avoid rate limits.
   */
  async reanalyzeBatch(
    limit: number,
    cutoffDate: string,
  ): Promise<{
    total: number;
    processed: number;
    failed: number;
    errors: { id: string; error: string }[];
  }> {
    const client = this.supabase.getClient();
    const { data: records, error } = await client
      .from('lingtin_visit_records')
      .select('id')
      .eq('status', 'processed')
      .not('raw_transcript', 'is', null)
      .lt('processed_at', cutoffDate)
      .order('processed_at', { ascending: true })
      .limit(limit);

    if (error) {
      this.logger.error(`Batch query failed: ${error.message}`);
      return { total: 0, processed: 0, failed: 0, errors: [{ id: 'query', error: error.message }] };
    }

    const total = records?.length || 0;
    if (total === 0) {
      return { total: 0, processed: 0, failed: 0, errors: [] };
    }

    this.logger.log(`Reanalyze batch: ${total} records (cutoff: ${cutoffDate})`);

    let processed = 0;
    let failed = 0;
    const errors: { id: string; error: string }[] = [];

    for (let i = 0; i < records.length; i++) {
      const result = await this.reanalyzeRecord(records[i].id);
      if (result.success) {
        processed++;
      } else {
        failed++;
        errors.push({ id: records[i].id, error: result.error || 'Unknown' });
      }
      // Rate limit: 500ms between records
      if (i < records.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    this.logger.log(`Reanalyze batch done: ${processed} ok, ${failed} failed out of ${total}`);
    return { total, processed, failed, errors };
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
   * - Remove incremental repetitions (STT artifact: "你好"→"你好想"→"你好想请")
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

    // Step 0: Remove incremental repetition patterns (STT artifact)
    // Pattern: "哎你好" "哎你好像" "哎你好像请" ... each line adds 1-2 chars
    // Detection: if a substring appears as prefix of the next, it's incremental repetition
    let cleaned = this.removeIncrementalRepetitions(raw);

    // Split into segments by common delimiters (，。！？、；,.)
    let segments = cleaned.split(/(?<=[，。！？、；,.?!])\s*/);

    // If no delimiter was found, treat the whole text as one segment
    if (segments.length <= 1 && cleaned.length > 0) {
      segments = [cleaned];
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
   * Remove incremental repetition artifacts from STT output.
   * Pattern: same prefix grows by 1-3 chars each repetition, e.g.:
   * "哎你好哎你好像哎你好像请哎你好像请了" → keep only the longest version
   */
  private removeIncrementalRepetitions(text: string): string {
    // Split by common delimiters to work on segments
    const parts = text.split(/(?<=[，。！？,.?!])\s*/);
    if (parts.length <= 1) {
      // For text without delimiters, try to detect pattern in raw text
      return this.deduplicateIncrementalRaw(text);
    }
    return parts.map((p) => this.deduplicateIncrementalRaw(p)).join('');
  }

  /**
   * Core incremental dedup: if the same prefix is repeated with 1-3 extra chars each time,
   * keep only the final (longest) version.
   * Verifies the incremental growth pattern (each occurrence adds 1-3 chars) to avoid
   * false positives on text that legitimately repeats a phrase.
   */
  private deduplicateIncrementalRaw(text: string): string {
    if (text.length < 20) return text;

    // Try to find a repeated seed (4-10 chars) that starts multiple "incremental" copies
    for (let seedLen = 4; seedLen <= Math.min(10, Math.floor(text.length / 3)); seedLen++) {
      const seed = text.substring(0, seedLen);
      // Find all non-overlapping positions of the seed
      const positions: number[] = [];
      let idx = 0;
      while ((idx = text.indexOf(seed, idx)) !== -1) {
        positions.push(idx);
        idx += seedLen; // non-overlapping
      }
      // Need at least 5 occurrences
      if (positions.length < 5) continue;

      // Verify incremental growth pattern: each gap between positions should be
      // seedLen + 0-3 chars (the "growing" part of the repetition)
      let incrementalCount = 1;
      for (let i = 1; i < positions.length; i++) {
        const gap = positions[i] - positions[i - 1];
        if (gap >= seedLen && gap <= seedLen + 3) {
          incrementalCount++;
        } else {
          // Non-incremental gap — the block ends here
          break;
        }
      }

      // Only treat as incremental if a significant consecutive run was found
      if (incrementalCount >= 5) {
        // The last occurrence in the incremental block is the longest version
        const blockEnd = positions[incrementalCount - 1];
        // Return from the last seed occurrence onward (the final, longest version + any trailing content)
        return text.substring(blockEnd);
      }
    }

    return text;
  }

  /**
   * Calculate overall satisfaction score from per-item feedback scores.
   * Weights: negative=1.5, positive=1.0, suggestion=1.0, neutral=0.8
   * Returns 60 (baseline) when no feedbacks.
   */
  private calculateSatisfaction(feedbacks: FeedbackItem[]): number {
    if (!feedbacks || feedbacks.length === 0) return 60;

    const weights: Record<string, number> = {
      positive: 1.0,
      negative: 1.5,
      neutral: 0.8,
      suggestion: 1.0,
    };

    let weightedSum = 0;
    let totalWeight = 0;

    for (const fb of feedbacks) {
      const w = weights[fb.sentiment] ?? 1.0;
      const score = typeof fb.score === 'number' ? fb.score : 60;
      weightedSum += score * w;
      totalWeight += w;
    }

    return totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 100) / 100 : 60;
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

    const systemPrompt = `你是餐饮桌访对话分析专家。分析店长与顾客的对话，提取结构化信息。

## 角色识别（重要）
对话是店长/服务员与顾客之间的桌访交流。根据语义模式判断角色：
- **店长/服务员**特征：打招呼("你好/打扰一下")、提问("菜品怎么样/第几次来")、推介("大众点评打卡送饮料")、致谢("祝你们用餐愉快")
- **顾客**特征：回答提问("还可以/第1次")、评价菜品("好吃/有点咸")、表达来源("美团/朋友介绍")
- feedbacks 只能包含**顾客**说的评价，不要把店长的话当作顾客反馈

输出JSON（只输出JSON，无其他内容）：
{
  "aiSummary": "20字以内摘要",
  "feedbacks": [
    {"text": "五花趾还挺好吃的", "sentiment": "positive", "score": 78},
    {"text": "上菜速度有点慢", "sentiment": "negative", "score": 30},
    {"text": "分量再多点就好了", "sentiment": "suggestion", "score": 50}
  ],
  "managerQuestions": ["菜品口感怎么样", "是第几次来"],
  "customerAnswers": ["还不错", "第1次，朋友介绍来的"]
}

## 规则

### 1. feedbacks — 宁多勿漏，每条带 score（0-100）
提取顾客对菜品、服务、环境的所有评价，每条独立打分。

**score 锚点（0-100）**：
- 90-100: 极其满意——"太好吃了！"、"必须再来！"、"主动要求打好评"
- 75-89: 明确满意——"好吃"、"味道不错"、"服务很好"、"挺好的"
- 60-74: 温和满意——"还不错"、"可以"、"没问题"
- 40-59: 中性/模糊——"还行"、"一般"、"还可以吧"
- 25-39: 具体不满——"有点咸"、"等太久"、"有点辣"
- 10-24: 明显不满——"太咸了"、"退菜"、"不新鲜"
- 0-9: 强烈不满——"投诉"、"要求赔偿"、"再也不来"

**一致性规则（强制）**：
- positive → score 必须 ≥ 60
- negative → score 必须 ≤ 45
- neutral → score 在 40-65 之间
- suggestion → score 在 35-65 之间

**兜底规则**：如果对话中顾客有实质性回应（不只是"嗯"/"好"），必须至少提取1条feedback。
- 顾客说"还行"/"还可以" → {"text": "整体还可以", "sentiment": "neutral", "score": 52}
- 顾客被问感受后说"好的/没问题" → {"text": "用餐体验满意", "sentiment": "positive", "score": 68}
- 店长问"有什么建议"顾客说"没有" → {"text": "没有意见", "sentiment": "neutral", "score": 55}

**格式要求**：
- 每条包含评价对象+评价词（如"五花趾还挺好吃的"而非单独的"好吃"）
- 没提到具体菜名时用原文表述如"菜品口感还可以"
- 多个评价拆分成多条
- 不要编造原文中没有的内容
- 不要把同一个评价重复提取多次

**sentiment 分类**：
- positive: 满意、赞赏 — "好吃"、"味道不错"、"服务很好"、"挺好的"、"没有不合口味"
- negative: 不满、批评 — "太咸了"、"上菜慢"、"有点辣"、"菜有点白"、"品种太少"
- neutral: 模糊、无倾向 — "还行"、"还可以"、"一般"、"跟上次差不多"
- suggestion: 建议新增或改变（不是对现有的抱怨）
  口语化识别模式："X能不能大一点"、"要是有X就好了"、"下次可以加个X"、"分量再多点就好了"、"你们可以出个X"
  区分：
  - "分量再多点就好了" → suggestion（建议改进）
  - "分量太少了" → negative（抱怨现状）
  - "要是能快一点就好了" → negative（抱怨速度）
  - "桌子能不能大一点" → suggestion（建议改善设施）

**否定句判断**：
- 回答店长提问"辣不辣"→"不辣，挺好的" → positive
- 主动说"不辣，没味道" → negative

### 2. managerQuestions — 店长/服务员的话
提取问候和询问（不含推销、解释性语句）

### 3. customerAnswers — 顾客的回复
提取顾客的所有实质性回应

### 4. 空数据处理
某项为空返回空数组[]

## 参考案例

案例1 — 简短正面：
输入："你好打扰一下，菜品口感怎么样？还不错啊，有什么建议吗？没有，挺好的，祝你们用餐愉快。"
输出：{"aiSummary":"顾客对菜品满意，无建议","feedbacks":[{"text":"菜品口感还不错","sentiment":"positive","score":72},{"text":"整体挺好的","sentiment":"positive","score":70}],"managerQuestions":["菜品口感怎么样","有什么建议吗"],"customerAnswers":["还不错","没有，挺好的"]}

案例2 — 有具体不满：
输入："两位打扰一下，今天菜品怎么样？嗯，那个酸菜鱼有点太辣了不太习惯，还有上菜速度有点慢等了差不多半个小时，其他的都还行，好的我跟厨房反映一下。"
输出：{"aiSummary":"顾客反馈酸菜鱼太辣、上菜慢","feedbacks":[{"text":"酸菜鱼有点太辣了","sentiment":"negative","score":28},{"text":"上菜速度有点慢","sentiment":"negative","score":25},{"text":"其他菜品还行","sentiment":"neutral","score":52}],"managerQuestions":["今天菜品怎么样"],"customerAnswers":["酸菜鱼有点太辣了不太习惯","上菜速度有点慢等了差不多半个小时","其他的都还行"]}

案例3 — 纯寒暄无反馈：
输入："你好两位新年快乐，菜品有什么意见吗？噢好谢谢你们的肯定，祝用餐愉快。"
输出：{"aiSummary":"店长问候，顾客未给具体反馈","feedbacks":[],"managerQuestions":["菜品有什么意见吗"],"customerAnswers":[]}`;

    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek/deepseek-chat-v3-0324',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `对话文本：\n${transcript}` },
        ],
        temperature: 0,
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

    // Parse feedbacks with per-item scores
    const feedbacks: FeedbackItem[] = (result.feedbacks || []).map((fb: { text?: string; sentiment?: string; score?: number }) => ({
      text: fb.text || '',
      sentiment: fb.sentiment || 'neutral',
      score: typeof fb.score === 'number' ? fb.score : 60,
    }));

    // Calculate overall satisfaction from per-item scores (system-calculated, not AI)
    const sentimentScore = this.calculateSatisfaction(feedbacks);

    return {
      correctedTranscript: '', // 由调用方设置为rawTranscript
      aiSummary: result.aiSummary || '无摘要',
      sentimentScore,
      feedbacks,
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

    // Extract keywords from feedbacks for keyword cloud display
    const keywords = (result.feedbacks || [])
      .map(fb => fb.text)
      .filter(Boolean);

    // Update visit record with simplified MVP fields
    const { error: updateError } = await client
      .from('lingtin_visit_records')
      .update({
        raw_transcript: result.rawTranscript,
        corrected_transcript: result.correctedTranscript,
        ai_summary: result.aiSummary,
        sentiment_score: result.sentimentScore,
        feedbacks: result.feedbacks,
        keywords,
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
