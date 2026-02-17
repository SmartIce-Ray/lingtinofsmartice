// Question Templates Service - Supabase CRUD for questionnaire prompts
// v1.0

import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';

interface QuestionItem {
  id: string;
  text: string;
  category: string;
}

@Injectable()
export class QuestionTemplatesService {
  private readonly logger = new Logger(QuestionTemplatesService.name);

  constructor(private readonly supabase: SupabaseService) {}

  // Get currently active template for a restaurant (recorder page)
  async getActiveTemplate(restaurantId: string) {
    if (this.supabase.isMockMode()) {
      return {
        template: {
          id: 'mock-tpl-1',
          restaurant_id: restaurantId,
          template_name: '标准桌访问卷',
          questions: [
            { id: 'q1', text: '您是怎么知道我们店的？', category: '来源' },
            { id: 'q2', text: '这是第几次来用餐？', category: '频次' },
            { id: 'q3', text: '今天点的菜口味还满意吗？', category: '菜品' },
            { id: 'q4', text: '上菜速度和服务还可以吗？', category: '服务' },
            { id: 'q5', text: '有什么建议可以让我们做得更好？', category: '建议' },
          ],
          is_active: true,
        },
      };
    }

    const client = this.supabase.getClient();
    const today = new Date().toISOString().split('T')[0];

    const { data, error } = await client
      .from('lingtin_question_templates')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .eq('is_active', true)
      .or(`effective_from.is.null,effective_from.lte.${today}`)
      .or(`effective_to.is.null,effective_to.gte.${today}`)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      this.logger.error(`Failed to fetch active template: ${error.message}`);
      throw error;
    }

    return { template: data || null };
  }

  // List all templates for a restaurant (admin page)
  async listTemplates(restaurantId: string) {
    if (this.supabase.isMockMode()) {
      return {
        templates: [
          {
            id: 'mock-tpl-1',
            restaurant_id: restaurantId,
            template_name: '标准桌访问卷',
            questions: [
              { id: 'q1', text: '您是怎么知道我们店的？', category: '来源' },
              { id: 'q2', text: '这是第几次来用餐？', category: '频次' },
              { id: 'q3', text: '今天点的菜口味还满意吗？', category: '菜品' },
              { id: 'q4', text: '上菜速度和服务还可以吗？', category: '服务' },
              { id: 'q5', text: '有什么建议可以让我们做得更好？', category: '建议' },
            ],
            is_active: true,
            effective_from: null,
            effective_to: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      };
    }

    const client = this.supabase.getClient();

    const { data, error } = await client
      .from('lingtin_question_templates')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('updated_at', { ascending: false });

    if (error) throw error;

    return { templates: data || [] };
  }

  // Create a new template
  async createTemplate(body: {
    restaurant_id: string;
    template_name: string;
    questions: QuestionItem[];
    is_active?: boolean;
    effective_from?: string;
    effective_to?: string;
  }) {
    if (this.supabase.isMockMode()) {
      return {
        template: {
          id: 'mock-tpl-new',
          ...body,
          is_active: body.is_active ?? true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      };
    }

    const client = this.supabase.getClient();

    // If activating this template, deactivate others for the same restaurant
    if (body.is_active !== false) {
      await client
        .from('lingtin_question_templates')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('restaurant_id', body.restaurant_id)
        .eq('is_active', true);
    }

    const { data, error } = await client
      .from('lingtin_question_templates')
      .insert({
        restaurant_id: body.restaurant_id,
        template_name: body.template_name,
        questions: body.questions,
        is_active: body.is_active ?? true,
        effective_from: body.effective_from || null,
        effective_to: body.effective_to || null,
      })
      .select()
      .single();

    if (error) throw error;

    this.logger.log(`Created template "${body.template_name}" for ${body.restaurant_id}`);
    return { template: data };
  }

  // Update an existing template
  async updateTemplate(
    id: string,
    body: {
      template_name?: string;
      questions?: QuestionItem[];
      is_active?: boolean;
      effective_from?: string | null;
      effective_to?: string | null;
    },
  ) {
    if (this.supabase.isMockMode()) {
      return { template: { id, ...body, updated_at: new Date().toISOString() } };
    }

    const client = this.supabase.getClient();

    // If activating this template, deactivate others first
    if (body.is_active === true) {
      // Get the restaurant_id for this template
      const { data: existing } = await client
        .from('lingtin_question_templates')
        .select('restaurant_id')
        .eq('id', id)
        .single();

      if (existing) {
        await client
          .from('lingtin_question_templates')
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq('restaurant_id', existing.restaurant_id)
          .eq('is_active', true)
          .neq('id', id);
      }
    }

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (body.template_name !== undefined) updateData.template_name = body.template_name;
    if (body.questions !== undefined) updateData.questions = body.questions;
    if (body.is_active !== undefined) updateData.is_active = body.is_active;
    if (body.effective_from !== undefined) updateData.effective_from = body.effective_from;
    if (body.effective_to !== undefined) updateData.effective_to = body.effective_to;

    const { data, error } = await client
      .from('lingtin_question_templates')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return { template: data };
  }

  // Delete a template
  async deleteTemplate(id: string) {
    if (this.supabase.isMockMode()) {
      return { message: '已删除' };
    }

    const client = this.supabase.getClient();

    const { error } = await client
      .from('lingtin_question_templates')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return { message: '已删除' };
  }
}
