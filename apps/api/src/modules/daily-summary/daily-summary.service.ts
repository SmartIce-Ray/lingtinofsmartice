// Daily Summary Service - Aggregate daily visit data + AI agenda generation
// v1.0 - Cron at 21:00 (UTC+8) + manual trigger

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { getChinaDateString } from '../../common/utils/date';
import { ActionItemsService } from '../action-items/action-items.service';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_RESTAURANT_ID = '0b9e9031-4223-4124-b633-e3a853abfb8f';

interface AgendaItem {
  category: string;
  title: string;
  detail: string;
  severity: 'high' | 'medium' | 'low';
  evidenceCount: number;
  suggestedAction: string;
  feedbacks: Array<{ tableId: string; text: string }>;
}

interface DailySummaryResult {
  overview: string;
  agendaItems: AgendaItem[];
}

@Injectable()
export class DailySummaryService {
  private readonly logger = new Logger(DailySummaryService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly actionItemsService: ActionItemsService,
  ) {}

  // Cron: UTC 13:00 = Beijing 21:00
  @Cron('0 0 13 * * *', { name: 'daily-summary-cron' })
  async handleDailySummaryCron() {
    this.logger.log('Cron: 每日总结定时任务触发 (21:00 UTC+8)');

    if (this.supabase.isMockMode()) {
      this.logger.log('Cron: Mock mode, skipping');
      return;
    }

    const today = getChinaDateString();

    // Get all restaurants that had visits today
    const client = this.supabase.getClient();
    const { data: restaurants, error } = await client
      .from('lingtin_visit_records')
      .select('restaurant_id')
      .eq('visit_date', today)
      .eq('status', 'processed');

    if (error) {
      this.logger.error(`Cron: Failed to query restaurants: ${error.message}`);
      return;
    }

    const uniqueIds = [...new Set((restaurants || []).map(r => r.restaurant_id))];
    this.logger.log(`Cron: Found ${uniqueIds.length} restaurants with visits today`);

    for (const restaurantId of uniqueIds) {
      try {
        await this.generateDailySummary(restaurantId, today);
        this.logger.log(`Cron: Generated summary for ${restaurantId}`);
        // 保底：自动生成 action items（复盘会已生成的不受影响）
        await this.actionItemsService.generateActionItems(restaurantId, today);
        this.logger.log(`Cron: Generated action items for ${restaurantId}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`Cron: Failed for ${restaurantId}: ${msg}`);
      }
    }
  }

  async getDailySummary(restaurantId: string, date: string) {
    if (this.supabase.isMockMode()) {
      return { summary: null };
    }

    const safeRestaurantId = UUID_REGEX.test(restaurantId)
      ? restaurantId
      : DEFAULT_RESTAURANT_ID;

    const client = this.supabase.getClient();
    const { data, error } = await client
      .from('lingtin_daily_summaries')
      .select('*')
      .eq('restaurant_id', safeRestaurantId)
      .eq('summary_date', date)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows found, that's fine
      throw error;
    }

    return { summary: data || null };
  }

  async generateDailySummary(restaurantId: string, date: string) {
    if (this.supabase.isMockMode()) {
      return {
        summary: {
          id: 'mock-summary',
          restaurant_id: restaurantId,
          summary_date: date,
          total_visits: 5,
          avg_sentiment: 0.72,
          positive_count: 3,
          negative_count: 1,
          neutral_count: 1,
          agenda_items: [
            {
              category: 'dish_quality',
              title: '鲈鱼偏咸',
              detail: '3桌顾客反映清蒸鲈鱼偏咸',
              severity: 'high',
              evidenceCount: 3,
              suggestedAction: '建议与厨师长沟通调整盐量',
              feedbacks: [{ tableId: 'A3', text: '鲈鱼太咸了' }],
            },
          ],
          ai_overview: '今日共完成5次桌访，整体满意度良好。主要问题集中在菜品口味。',
          status: 'generated',
        },
      };
    }

    const safeRestaurantId = UUID_REGEX.test(restaurantId)
      ? restaurantId
      : DEFAULT_RESTAURANT_ID;

    const client = this.supabase.getClient();

    // Step 1: Fetch today's processed visit records
    const { data: visits, error: visitsError } = await client
      .from('lingtin_visit_records')
      .select('id, table_id, sentiment_score, ai_summary, keywords, feedbacks, corrected_transcript, customer_answers')
      .eq('restaurant_id', safeRestaurantId)
      .eq('visit_date', date)
      .eq('status', 'processed');

    if (visitsError) throw visitsError;

    if (!visits || visits.length === 0) {
      this.logger.log(`No visits for ${safeRestaurantId} on ${date}`);
      return { summary: null, message: '今日暂无桌访记录' };
    }

    // Step 2: Compute stats
    const totalVisits = visits.length;
    let sentimentSum = 0;
    let sentimentCount = 0;
    let positiveCount = 0;
    let negativeCount = 0;
    let neutralCount = 0;

    visits.forEach(v => {
      if (v.sentiment_score !== null && v.sentiment_score !== undefined) {
        sentimentSum += Number(v.sentiment_score);
        sentimentCount++;
        if (v.sentiment_score >= 0.6) positiveCount++;
        else if (v.sentiment_score <= 0.4) negativeCount++;
        else neutralCount++;
      }
    });

    const avgSentiment = sentimentCount > 0
      ? Math.round((sentimentSum / sentimentCount) * 100) / 100
      : null;

    // Step 3: Build feedback text for AI
    const feedbackLines: string[] = [];
    visits.forEach(v => {
      const tableId = v.table_id || '?';
      const sentiment = v.sentiment_score;
      const summary = v.ai_summary || '';
      const feedbacks = v.feedbacks || [];

      let line = `${tableId}桌 (情绪:${sentiment ?? '未知'})`;
      if (summary) line += ` — ${summary}`;
      if (feedbacks.length > 0) {
        const fbTexts = feedbacks
          .map((fb: { text?: string; sentiment?: string }) => {
            const s = fb.sentiment === 'negative' ? '[-]' : fb.sentiment === 'positive' ? '[+]' : '[=]';
            return `${s}${fb.text || ''}`;
          })
          .join('; ');
        line += ` | 反馈: ${fbTexts}`;
      }
      feedbackLines.push(line);
    });

    // Step 4: Call AI to generate agenda
    const aiResult = await this.callAI(feedbackLines, totalVisits, avgSentiment);

    // Step 5: Upsert into daily_summaries
    const record = {
      restaurant_id: safeRestaurantId,
      summary_date: date,
      total_visits: totalVisits,
      avg_sentiment: avgSentiment,
      positive_count: positiveCount,
      negative_count: negativeCount,
      neutral_count: neutralCount,
      agenda_items: aiResult.agendaItems,
      ai_overview: aiResult.overview,
      status: 'generated',
    };

    const { data: upserted, error: upsertError } = await client
      .from('lingtin_daily_summaries')
      .upsert(record, { onConflict: 'restaurant_id,summary_date' })
      .select()
      .single();

    if (upsertError) throw upsertError;

    this.logger.log(`Generated daily summary for ${safeRestaurantId} on ${date}: ${aiResult.agendaItems.length} agenda items`);

    return { summary: upserted };
  }

  private async callAI(
    feedbackLines: string[],
    totalVisits: number,
    avgSentiment: number | null,
  ): Promise<DailySummaryResult> {
    const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
    if (!OPENROUTER_API_KEY) {
      throw new Error('AI_NOT_CONFIGURED: OpenRouter API key missing');
    }

    const systemPrompt = `你是餐饮门店运营分析专家。根据今日桌访反馈数据，生成每日复盘会议的议题卡片。

输出JSON格式（只输出JSON，无其他内容）：
{
  "overview": "200字以内的当日概述，包括亮点和问题",
  "agendaItems": [
    {
      "category": "dish_quality",
      "title": "简短议题标题（10字以内）",
      "detail": "具体问题描述",
      "severity": "high",
      "evidenceCount": 3,
      "suggestedAction": "建议的改善措施",
      "feedbacks": [{"tableId": "A3", "text": "原始反馈摘要"}]
    }
  ]
}

规则：
1. category: dish_quality / service_speed / environment / staff_attitude / other
2. severity: high = 3+桌反映 / medium = 2桌 / low = 1桌
3. agendaItems 按 severity 从高到低排序
4. 合并相似反馈（如"太咸"和"偏咸"归为同一议题）
5. overview 应包含正面亮点和需改进的问题，客观概述
6. feedbacks 保留原始桌号和摘要文本
7. 最多8个议题，聚焦核心问题
8. 不要编造原文中没有的内容`;

    const userContent = `今日桌访数据：
- 总桌访数: ${totalVisits}
- 平均情绪分: ${avgSentiment ?? '无数据'}

各桌反馈详情:
${feedbackLines.join('\n')}`;

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
          { role: 'user', content: userContent },
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

    // Strip markdown fences
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

    let result: { overview?: string; agendaItems?: AgendaItem[] };
    try {
      result = JSON.parse(jsonMatch[0]);
    } catch {
      this.logger.error(`AI返回无效JSON: ${jsonMatch[0].substring(0, 200)}`);
      throw new Error('AI_PARSE_ERROR: 无法解析 AI 返回的JSON');
    }

    return {
      overview: result.overview || '',
      agendaItems: result.agendaItems || [],
    };
  }
}
