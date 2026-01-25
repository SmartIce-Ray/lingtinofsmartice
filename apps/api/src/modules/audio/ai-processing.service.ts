// AI Processing Service - Handles STT and AI tagging pipeline
// v2.0 - New structured label system: dishes (with keywords), service (keywords), other (keywords)

import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { XunfeiSttService } from './xunfei-stt.service';

// Gemini via PackyAPI Configuration
const PACKY_API_URL = 'https://www.packyapi.com/v1/chat/completions';

// New structured label types
export interface DishMention {
  name: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  keywords: string[] | null;
}

interface ProcessingResult {
  transcript: string;
  correctedTranscript: string;
  aiSummary: string;
  sentimentScore: number;
  visitType: 'routine' | 'complaint' | 'praise';
  // New structured labels
  dishes: DishMention[];
  service: string[] | null;
  other: string[] | null;
}

@Injectable()
export class AiProcessingService {
  private readonly logger = new Logger(AiProcessingService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly xunfeiStt: XunfeiSttService,
  ) {}

  /**
   * Main processing pipeline
   */
  async processAudio(
    recordingId: string,
    audioUrl: string,
    tableId: string,
    restaurantId: string,
  ): Promise<ProcessingResult> {
    const startTime = Date.now();
    this.logger.log(`========== PIPELINE START ==========`);
    this.logger.log(`Recording: ${recordingId} | Table: ${tableId}`);
    this.logger.log(`Audio URL: ${audioUrl}`);

    // Step 1: Get dish names for correction reference
    this.logger.log(`[Step 1/4] Loading dish names...`);
    const dishNames = await this.getDishNames(restaurantId);
    this.logger.log(`[Step 1/4] Loaded ${dishNames.length} dish names`);

    // Step 2: Speech-to-Text (讯飞)
    this.logger.log(`[Step 2/4] Starting STT (讯飞)...`);
    const sttStart = Date.now();
    const rawTranscript = await this.transcribeAudio(audioUrl);
    this.logger.log(`[Step 2/4] STT complete in ${Date.now() - sttStart}ms`);
    this.logger.log(`[Step 2/4] Transcript: "${rawTranscript}"`);

    // Step 3: Correction + Tagging (Gemini)
    this.logger.log(`[Step 3/4] Starting Gemini AI processing...`);
    const aiStart = Date.now();
    const aiResult = await this.processWithGemini(rawTranscript, dishNames);
    this.logger.log(`[Step 3/4] Gemini complete in ${Date.now() - aiStart}ms`);
    this.logger.log(`[Step 3/4] Summary: "${aiResult.aiSummary}"`);
    this.logger.log(`[Step 3/4] Score: ${aiResult.sentimentScore}, Dishes: ${aiResult.dishes.length}`);

    // Step 4: Save results to database
    this.logger.log(`[Step 4/4] Saving to database...`);
    await this.saveResults(recordingId, {
      rawTranscript,
      ...aiResult,
    });
    this.logger.log(`[Step 4/4] Saved successfully`);

    const totalTime = Date.now() - startTime;
    this.logger.log(`========== PIPELINE COMPLETE ==========`);
    this.logger.log(`Total time: ${totalTime}ms`);

    return {
      transcript: rawTranscript,
      ...aiResult,
    };
  }

  /**
   * Get dish names from database for correction reference
   */
  private async getDishNames(restaurantId: string): Promise<string[]> {
    // Use the mock-aware helper from SupabaseService
    return this.supabase.getDishNames();
  }

  /**
   * Transcribe audio using 讯飞 STT (WebSocket-based, non-streaming)
   * Falls back to mock transcript if credentials not configured
   */
  private async transcribeAudio(audioUrl: string): Promise<string> {
    const XUNFEI_APP_ID = process.env.XUNFEI_APP_ID;
    const XUNFEI_API_KEY = process.env.XUNFEI_API_KEY;
    const XUNFEI_API_SECRET = process.env.XUNFEI_API_SECRET;

    // Check if 讯飞 credentials are configured
    if (!XUNFEI_APP_ID || !XUNFEI_API_KEY || !XUNFEI_API_SECRET) {
      this.logger.warn('讯飞 credentials not configured, using mock transcript');
      return this.getMockTranscript();
    }

    try {
      // Use 讯飞 STT service to transcribe audio
      const transcript = await this.xunfeiStt.transcribe(audioUrl);
      return transcript;
    } catch (error) {
      this.logger.error(`讯飞 STT failed: ${error.message}, using mock transcript`);
      return this.getMockTranscript();
    }
  }

  /**
   * Process transcript with Gemini for correction and tagging
   */
  private async processWithGemini(
    transcript: string,
    dishNames: string[],
  ): Promise<Omit<ProcessingResult, 'transcript'>> {
    // Read API key at runtime
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

    if (!GEMINI_API_KEY) {
      this.logger.warn('Gemini API key not configured, using mock result');
      return this.getMockAiResult();
    }

    this.logger.log(`Using Gemini API key: ${GEMINI_API_KEY.substring(0, 10)}...`);

    const systemPrompt = `分析餐饮桌访对话，提取结构化标签。

菜单参考：${dishNames.slice(0, 30).join('、')}

输出JSON格式（只输出JSON，无其他内容）：
{
  "correctedTranscript": "纠偏后的完整文本",
  "aiSummary": "20字以内摘要",
  "sentimentScore": 0.5,
  "visitType": "routine/complaint/praise",
  "dishes": [
    {"name": "菜名", "sentiment": "positive/negative/neutral", "keywords": ["关键词1", "关键词2"]}
  ],
  "service": ["服务相关关键词"],
  "other": ["其他关键词"]
}

规则：
1. dishes: 提到的每道菜，keywords提取口味/质量描述词（如：咸、量少、新鲜、好吃）
2. service: 服务相关词（如：态度好、上菜慢、热情、主动加水）
3. other: 品牌忠诚度相关词（如：老顾客、下次还来、推荐朋友）
4. 如果某类没有提及，设为null
5. visitType: routine=普通点餐, complaint=有投诉, praise=明确好评`;

    try {
      const response = await fetch(PACKY_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${GEMINI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gemini-3-flash-preview',
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
        throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      this.logger.log(`Gemini raw response length: ${content?.length || 0}`);
      this.logger.log(`Gemini raw response (first 300 chars): ${content?.substring(0, 300)}`);

      if (!content) {
        throw new Error('Empty response from Gemini');
      }

      // Strip markdown code block markers if present
      let cleanContent = content.trim();
      if (cleanContent.startsWith('```json')) {
        cleanContent = cleanContent.replace(/^```json\s*/, '').replace(/```\s*$/, '');
      } else if (cleanContent.startsWith('```')) {
        cleanContent = cleanContent.replace(/^```\s*/, '').replace(/```\s*$/, '');
      }

      this.logger.log(`Cleaned content (first 200 chars): ${cleanContent.substring(0, 200)}`);

      // Parse JSON response - try to find JSON object in the content
      const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        this.logger.error(`No JSON found in cleaned content. Full content: ${cleanContent.substring(0, 500)}`);
        throw new Error('Invalid JSON response from Gemini');
      }

      this.logger.log(`Extracted JSON (first 100 chars): ${jsonMatch[0].substring(0, 100)}`);
      const result = JSON.parse(jsonMatch[0]);

      return {
        correctedTranscript: result.correctedTranscript || transcript,
        aiSummary: result.aiSummary || '无摘要',
        sentimentScore: parseFloat(result.sentimentScore) || 0.5,
        visitType: result.visitType || 'routine',
        dishes: result.dishes || [],
        service: result.service || null,
        other: result.other || null,
      };
    } catch (error) {
      this.logger.error(`Gemini processing failed: ${error.message}`);
      return this.getMockAiResult();
    }
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
      visitType: string;
      dishes: DishMention[];
      service: string[] | null;
      other: string[] | null;
    },
  ): Promise<void> {
    // Check if running in mock mode
    if (this.supabase.isMockMode()) {
      this.logger.log(`[MOCK] Would save results for ${recordingId}:`);
      this.logger.log(`  - Summary: ${result.aiSummary}`);
      this.logger.log(`  - Score: ${result.sentimentScore}`);
      this.logger.log(`  - Dishes: ${result.dishes.map(d => d.name).join(', ')}`);
      this.logger.log(`  - Service: ${result.service?.join(', ') || 'null'}`);
      this.logger.log(`  - Other: ${result.other?.join(', ') || 'null'}`);
      return;
    }

    const client = this.supabase.getClient();

    // Update visit record with new structured labels
    const { error: updateError } = await client
      .from('lingtin_visit_records')
      .update({
        raw_transcript: result.rawTranscript,
        corrected_transcript: result.correctedTranscript,
        ai_summary: result.aiSummary,
        sentiment_score: result.sentimentScore,
        visit_type: result.visitType,
        dishes: result.dishes,
        service: result.service,
        other: result.other,
        status: 'processed',
        processed_at: new Date().toISOString(),
      })
      .eq('id', recordingId);

    if (updateError) {
      this.logger.error(`Failed to update visit record: ${updateError.message}`);
    }

    // Also insert into dish_mentions table for backward compatibility
    if (result.dishes.length > 0) {
      const dishMentionRecords = result.dishes.map((d) => ({
        visit_id: recordingId,
        dish_name: d.name,
        sentiment: d.sentiment,
        feedback_text: d.keywords?.join('、') || '',
      }));

      const { error: insertError } = await client
        .from('lingtin_dish_mentions')
        .insert(dishMentionRecords);

      if (insertError) {
        this.logger.error(`Failed to insert dish mentions: ${insertError.message}`);
      }
    }
  }

  /**
   * Mock transcript for demo
   */
  private getMockTranscript(): string {
    const samples = [
      '今天的清蒸路鱼很新鲜，油门大虾也不错，就是等的时间有点长',
      '招牌红烧肉味道很好，肥而不腻，下次还会来',
      '宫保鸡丁有点咸了，不过服务态度很好',
      '蒜蓉粉丝虾很入味，鲜嫩可口，五星好评',
    ];
    return samples[Math.floor(Math.random() * samples.length)];
  }

  /**
   * Mock AI result for demo
   */
  private getMockAiResult(): Omit<ProcessingResult, 'transcript'> {
    return {
      correctedTranscript: '今天的清蒸鲈鱼很新鲜，油焖大虾也不错，就是等的时间有点长',
      aiSummary: '清蒸鲈鱼新鲜，油焖大虾好，上菜稍慢',
      sentimentScore: 0.72,
      visitType: 'routine',
      dishes: [
        { name: '清蒸鲈鱼', sentiment: 'positive', keywords: ['新鲜'] },
        { name: '油焖大虾', sentiment: 'positive', keywords: ['不错'] },
      ],
      service: ['等待时间长'],
      other: null,
    };
  }
}
