// Action Items Service - AI-generated improvement suggestions
// v1.0 - Generate action items from negative visit feedbacks using OpenRouter

import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

interface EvidenceItem {
  visitId: string;
  tableId: string;
  feedback: string;
  sentiment: string;
}

interface GeneratedAction {
  category: string;
  suggestion_text: string;
  priority: string;
  evidence: EvidenceItem[];
}

@Injectable()
export class ActionItemsService {
  private readonly logger = new Logger(ActionItemsService.name);

  constructor(private readonly supabase: SupabaseService) {}

  // Get action items for a restaurant on a given date
  async getActionItems(restaurantId: string, date: string) {
    if (this.supabase.isMockMode()) {
      return {
        actions: [
          {
            id: 'mock-action-1', restaurant_id: restaurantId, action_date: date,
            category: 'dish_quality', priority: 'high', status: 'pending',
            suggestion_text: '3桌顾客反映清蒸鲈鱼偏咸，建议与厨师长沟通减少盐量',
            evidence: [{ visitId: 'mock-v1', tableId: 'A3', feedback: '偏咸', sentiment: 'negative' }],
          },
          {
            id: 'mock-action-2', restaurant_id: restaurantId, action_date: date,
            category: 'service_speed', priority: 'medium', status: 'pending',
            suggestion_text: 'A5桌顾客反映上菜速度慢，建议优化午市高峰期出菜流程',
            evidence: [{ visitId: 'mock-v2', tableId: 'A5', feedback: '上菜慢', sentiment: 'negative' }],
          },
          {
            id: 'mock-action-3', restaurant_id: restaurantId, action_date: date,
            category: 'environment', priority: 'low', status: 'pending',
            suggestion_text: 'B2桌顾客提到空调温度偏高，建议调低1-2度',
            evidence: [{ visitId: 'mock-v3', tableId: 'B2', feedback: '太热了', sentiment: 'negative' }],
          },
        ],
      };
    }
    const client = this.supabase.getClient();

    const { data, error } = await client
      .from('lingtin_action_items')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .eq('action_date', date)
      .neq('status', 'dismissed')
      .order('priority', { ascending: true }) // high first (alphabetical: h < l < m)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Re-sort by priority weight: high > medium > low
    const priorityWeight: Record<string, number> = { high: 0, medium: 1, low: 2 };
    const sorted = (data || []).sort(
      (a, b) => (priorityWeight[a.priority] ?? 3) - (priorityWeight[b.priority] ?? 3),
    );

    return { actions: sorted };
  }

  // Generate action items from today's negative feedbacks
  async generateActionItems(restaurantId: string, date: string) {
    if (this.supabase.isMockMode()) {
      return {
        actions: [
          {
            id: 'mock-action-1', restaurant_id: restaurantId, action_date: date,
            category: 'dish_quality', priority: 'high', status: 'pending',
            suggestion_text: '3桌顾客反映清蒸鲈鱼偏咸，建议与厨师长沟通减少盐量',
            evidence: [{ visitId: 'mock-v1', tableId: 'A3', feedback: '偏咸', sentiment: 'negative' }],
          },
          {
            id: 'mock-action-2', restaurant_id: restaurantId, action_date: date,
            category: 'service_speed', priority: 'medium', status: 'pending',
            suggestion_text: 'A5桌顾客反映上菜速度慢，建议优化午市高峰期出菜流程',
            evidence: [{ visitId: 'mock-v2', tableId: 'A5', feedback: '上菜慢', sentiment: 'negative' }],
          },
          {
            id: 'mock-action-3', restaurant_id: restaurantId, action_date: date,
            category: 'environment', priority: 'low', status: 'pending',
            suggestion_text: 'B2桌顾客提到空调温度偏高，建议调低1-2度',
            evidence: [{ visitId: 'mock-v3', tableId: 'B2', feedback: '太热了', sentiment: 'negative' }],
          },
        ],
      };
    }
    const client = this.supabase.getClient();

    // Step 1: Query visit records for the date
    const { data: visits, error: visitsError } = await client
      .from('lingtin_visit_records')
      .select('id, table_id, feedbacks, corrected_transcript')
      .eq('restaurant_id', restaurantId)
      .eq('visit_date', date)
      .eq('status', 'processed');

    if (visitsError) throw visitsError;

    // Step 2: Extract negative feedbacks
    const negativeFeedbacks: EvidenceItem[] = [];

    (visits || []).forEach((visit) => {
      const feedbacks = visit.feedbacks || [];
      feedbacks.forEach((fb: { text: string; sentiment: string }) => {
        if (typeof fb === 'object' && fb.sentiment === 'negative') {
          negativeFeedbacks.push({
            visitId: visit.id,
            tableId: visit.table_id,
            feedback: fb.text,
            sentiment: fb.sentiment,
          });
        }
      });
    });

    // Step 3: If no negative feedbacks, return empty
    if (negativeFeedbacks.length === 0) {
      this.logger.log(`No negative feedbacks for ${restaurantId} on ${date}`);
      return { actions: [], message: '今日暂无负面反馈' };
    }

    // Step 4: Call AI to analyze and group
    const actions = await this.callAI(negativeFeedbacks);

    // Step 5: Delete existing pending items for this date (preserve acknowledged/resolved)
    const { error: deleteError } = await client
      .from('lingtin_action_items')
      .delete()
      .eq('restaurant_id', restaurantId)
      .eq('action_date', date)
      .eq('status', 'pending');

    if (deleteError) {
      this.logger.warn(`Failed to delete old pending items: ${deleteError.message}`);
    }

    // Step 6: Insert new action items
    const insertRows = actions.map((action) => ({
      restaurant_id: restaurantId,
      action_date: date,
      source_type: 'daily_aggregation',
      visit_ids: [...new Set(action.evidence.map((e) => e.visitId))],
      category: action.category,
      suggestion_text: action.suggestion_text,
      priority: action.priority,
      evidence: action.evidence,
      status: 'pending',
    }));

    if (insertRows.length > 0) {
      const { data: inserted, error: insertError } = await client
        .from('lingtin_action_items')
        .insert(insertRows)
        .select();

      if (insertError) throw insertError;

      this.logger.log(`Generated ${inserted?.length} action items for ${restaurantId} on ${date}`);
      return { actions: inserted || [] };
    }

    return { actions: [] };
  }

  // Update action item status
  async updateActionItem(id: string, status: string, note?: string) {
    if (this.supabase.isMockMode()) {
      return { action: { id, status, updated_at: new Date().toISOString() } };
    }
    const client = this.supabase.getClient();

    const updateData: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (status === 'acknowledged') {
      updateData.acknowledged_at = new Date().toISOString();
    } else if (status === 'resolved') {
      updateData.resolved_at = new Date().toISOString();
      if (note) updateData.resolved_note = note;
    } else if (status === 'dismissed') {
      updateData.dismissed_at = new Date().toISOString();
      if (note) updateData.dismiss_reason = note;
    }

    const { data, error } = await client
      .from('lingtin_action_items')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return { action: data };
  }

  // Call OpenRouter AI to analyze negative feedbacks and generate suggestions
  private async callAI(feedbacks: EvidenceItem[]): Promise<GeneratedAction[]> {
    const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

    if (!OPENROUTER_API_KEY) {
      this.logger.error('OpenRouter API key not configured');
      throw new Error('AI_NOT_CONFIGURED: OpenRouter AI key missing');
    }

    const feedbackText = feedbacks
      .map((f) => `${f.tableId}桌: "${f.feedback}"`)
      .join('\n');

    const systemPrompt = `你是餐饮管理专家。分析以下顾客负面反馈，生成3-5条可执行的改善建议。

输出JSON格式（只输出JSON，无其他内容）：
{
  "actions": [
    {
      "category": "dish_quality",
      "suggestion_text": "X桌顾客反映[问题]，建议[行动]",
      "priority": "high",
      "evidence_indices": [0, 1]
    }
  ]
}

规则：
1. category 只能是: dish_quality / service_speed / environment / staff_attitude / other
2. 合并相似问题（"太咸"和"偏咸"算同一问题）
3. priority: high = 3桌以上提到, medium = 2桌提到, low = 1桌提到
4. suggestion_text 格式："X桌顾客反映[问题]，建议[具体行动]"
5. 最多5条，优先高频问题
6. evidence_indices 是反馈列表中的索引号（从0开始）`;

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
          { role: 'user', content: `顾客负面反馈列表：\n${feedbackText}` },
        ],
        temperature: 0.3,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error(`OpenRouter API error: ${response.status} - ${errorText}`);
      throw new Error(`AI_API_ERROR: OpenRouter API error ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('AI_EMPTY_RESPONSE: OpenRouter returned empty result');
    }

    // Strip markdown code block markers if present
    let cleanContent = content.trim();
    if (cleanContent.startsWith('```json')) {
      cleanContent = cleanContent.replace(/^```json\s*/, '').replace(/```\s*$/, '');
    } else if (cleanContent.startsWith('```')) {
      cleanContent = cleanContent.replace(/^```\s*/, '').replace(/```\s*$/, '');
    }

    // Parse JSON
    const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      this.logger.error(`AI returned invalid JSON: ${cleanContent.substring(0, 200)}`);
      throw new Error('AI_PARSE_ERROR: Cannot parse AI response');
    }

    const result = JSON.parse(jsonMatch[0]);
    const rawActions = result.actions || [];

    // Map evidence_indices back to actual evidence items
    return rawActions.map((action: { category: string; suggestion_text: string; priority: string; evidence_indices?: number[] }) => ({
      category: action.category || 'other',
      suggestion_text: action.suggestion_text || '',
      priority: action.priority || 'medium',
      evidence: (action.evidence_indices || [])
        .filter((idx: number) => idx >= 0 && idx < feedbacks.length)
        .map((idx: number) => feedbacks[idx]),
    }));
  }
}
