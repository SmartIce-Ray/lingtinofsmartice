// Meeting AI Processing Service - STT + AI minutes generation
// v2.0 - DashScope Paraformer-v2 (with Xunfei fallback) + Gemini 2.5 Flash

import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { XunfeiSttService } from '../audio/xunfei-stt.service';
import { DashScopeSttService } from '../audio/dashscope-stt.service';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

// 35 minutes timeout for STT (covers 30-min meetings + buffer)
const MEETING_STT_TIMEOUT_MS = 2100000;

interface MeetingProcessingResult {
  transcript: string;
  aiSummary: string;
  actionItems: Array<{ who: string; what: string; deadline: string }>;
  keyDecisions: Array<{ decision: string; context: string }>;
}

@Injectable()
export class MeetingAiProcessingService {
  private readonly logger = new Logger(MeetingAiProcessingService.name);
  private processingLocks = new Set<string>();

  constructor(
    private readonly supabase: SupabaseService,
    private readonly xunfeiStt: XunfeiSttService,
    private readonly dashScopeStt: DashScopeSttService,
  ) {}

  async processMeeting(
    recordingId: string,
    audioUrl: string,
    meetingType: string,
    restaurantId: string,
  ): Promise<MeetingProcessingResult> {
    if (this.processingLocks.has(recordingId)) {
      throw new Error('Meeting is already being processed');
    }

    const currentStatus = await this.getStatus(recordingId);
    if (currentStatus === 'processed' || currentStatus === 'processing') {
      throw new Error(`Meeting already ${currentStatus}`);
    }

    this.processingLocks.add(recordingId);

    try {
      await this.updateStatus(recordingId, 'processing');

      const startTime = Date.now();
      this.logger.log(`Pipeline: ${meetingType} 开始处理`);

      // Step 1: STT — DashScope first (speaker_count=4 for meetings), fallback to 讯飞
      let rawTranscript: string;
      if (this.dashScopeStt.isConfigured()) {
        try {
          rawTranscript = await this.dashScopeStt.transcribe(audioUrl, 4, 600000);
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          this.logger.warn(`DashScope STT failed, falling back to 讯飞: ${msg}`);
          rawTranscript = await this.xunfeiStt.transcribe(audioUrl, MEETING_STT_TIMEOUT_MS);
        }
      } else {
        rawTranscript = await this.xunfeiStt.transcribe(audioUrl, MEETING_STT_TIMEOUT_MS);
      }
      this.logger.log(`STT完成: ${rawTranscript.length}字`);

      if (!rawTranscript || rawTranscript.trim().length === 0) {
        this.logger.warn(`空音频或无法识别，跳过AI处理`);
        const emptyResult: MeetingProcessingResult = {
          transcript: '',
          aiSummary: '无法识别语音内容',
          actionItems: [],
          keyDecisions: [],
        };
        await this.saveResults(recordingId, rawTranscript, emptyResult);
        return emptyResult;
      }

      // Step 1.5: Light cleaning — deduplicate repeated phrases
      const cleanedTranscript = rawTranscript.replace(/(.{1,6})\1{2,}/g, '$1');
      this.logger.log(`清洗完成: ${rawTranscript.length}字 → ${cleanedTranscript.length}字`);

      // Step 2: AI minutes generation
      const aiResult = await this.generateMinutes(cleanedTranscript, meetingType);
      this.logger.log(`AI完成: ${aiResult.actionItems.length} action items`);

      // Step 3: Save results
      await this.saveResults(recordingId, rawTranscript, aiResult);

      const totalTime = Date.now() - startTime;
      this.logger.log(`Pipeline: ${meetingType} 完成 (${(totalTime / 1000).toFixed(1)}s)`);

      return aiResult;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Pipeline failed for ${recordingId}: ${errorMessage}`);
      await this.saveErrorStatus(recordingId, errorMessage);
      throw error;
    } finally {
      this.processingLocks.delete(recordingId);
    }
  }

  private async generateMinutes(
    transcript: string,
    meetingType: string,
  ): Promise<MeetingProcessingResult> {
    const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
    if (!OPENROUTER_API_KEY) {
      throw new Error('AI_NOT_CONFIGURED: OpenRouter AI 未配置');
    }

    const meetingTypeLabel =
      meetingType === 'pre_meal' ? '餐前会' :
      meetingType === 'daily_review' ? '每日复盘总结会' :
      meetingType === 'weekly' ? '周例会' : '会议';

    const systemPrompt = `你是餐饮门店会议记录助手。分析${meetingTypeLabel}的录音转写文本，生成结构化会议纪要。

输出JSON格式（只输出JSON，无其他内容）：
{
  "aiSummary": "150字以内会议摘要，包含主要议题和结论",
  "actionItems": [
    {"who": "负责人姓名", "what": "具体待办事项", "deadline": "截止时间，如本周五、明天午市前"}
  ],
  "keyDecisions": [
    {"decision": "决定的内容", "context": "做出决定的原因或背景"}
  ]
}

规则：
1. aiSummary: 概括会议核心内容，包括讨论的主要议题和最终结论，不超过150字
2. actionItems: 提取会议中明确分配的任务
   - who: 从原文提取负责人姓名，如未明确指定则填"待定"
   - what: 具体、可执行的描述，如"检查冷库温度记录"而非"注意冷库"
   - deadline: 从原文提取截止时间，如未明确则根据会议类型推断（餐前会→当日，复盘→次日，周例会→本周内）
3. keyDecisions: 提取会议中做出的重要决定
   - 只记录明确达成共识的决定，不记录讨论中的提议
4. 如果某项为空，返回空数组[]
5. 不要编造原文中没有的内容`;

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
          { role: 'user', content: `会议转写文本：\n${transcript}` },
        ],
        temperature: 0.3,
        max_tokens: 4000,
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

    let cleanContent = content.trim();
    if (cleanContent.startsWith('```json')) {
      cleanContent = cleanContent.replace(/^```json\s*/, '').replace(/```\s*$/, '');
    } else if (cleanContent.startsWith('```')) {
      cleanContent = cleanContent.replace(/^```\s*/, '').replace(/```\s*$/, '');
    }

    const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      this.logger.error(`AI返回无效JSON: ${cleanContent.substring(0, 200)}`);
      throw new Error('AI_PARSE_ERROR: 无法解析 AI 返回结果');
    }

    let result: { aiSummary?: string; actionItems?: Array<{ who: string; what: string; deadline: string }>; keyDecisions?: Array<{ decision: string; context: string }> };
    try {
      result = JSON.parse(jsonMatch[0]);
    } catch {
      this.logger.error(`AI返回无效JSON: ${jsonMatch[0].substring(0, 200)}`);
      throw new Error('AI_PARSE_ERROR: 无法解析 AI 返回的JSON');
    }

    return {
      transcript,
      aiSummary: result.aiSummary || '无摘要',
      actionItems: result.actionItems || [],
      keyDecisions: result.keyDecisions || [],
    };
  }

  private async getStatus(recordingId: string): Promise<string | null> {
    const client = this.supabase.getClient();
    const { data, error } = await client
      .from('lingtin_meeting_records')
      .select('status')
      .eq('id', recordingId)
      .single();

    if (error) {
      this.logger.warn(`Failed to get status for ${recordingId}: ${error.message}`);
      return null;
    }
    return data?.status || null;
  }

  private async updateStatus(recordingId: string, status: string): Promise<void> {
    const client = this.supabase.getClient();
    const { error } = await client
      .from('lingtin_meeting_records')
      .update({ status })
      .eq('id', recordingId);

    if (error) {
      this.logger.error(`Failed to update status for ${recordingId}: ${error.message}`);
    }
  }

  private async saveResults(
    recordingId: string,
    rawTranscript: string,
    result: MeetingProcessingResult,
  ): Promise<void> {
    const client = this.supabase.getClient();

    const { error } = await client
      .from('lingtin_meeting_records')
      .update({
        raw_transcript: rawTranscript,
        corrected_transcript: rawTranscript,
        ai_summary: result.aiSummary,
        action_items: result.actionItems,
        key_decisions: result.keyDecisions,
        status: 'processed',
        processed_at: new Date().toISOString(),
      })
      .eq('id', recordingId);

    if (error) {
      this.logger.error(`Failed to save meeting results: ${error.message}`);
    }
  }

  private async saveErrorStatus(recordingId: string, errorMessage: string): Promise<void> {
    const client = this.supabase.getClient();
    const { error } = await client
      .from('lingtin_meeting_records')
      .update({
        status: 'error',
        error_message: errorMessage,
        processed_at: new Date().toISOString(),
      })
      .eq('id', recordingId);

    if (error) {
      this.logger.error(`Failed to save error status for ${recordingId}: ${error.message}`);
    }
  }
}
