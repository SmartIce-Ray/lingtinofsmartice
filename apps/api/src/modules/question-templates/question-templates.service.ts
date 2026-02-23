// Question Templates Service - Supabase CRUD for questionnaire prompts
// v1.1 - Added default template fallback + UUID validation

import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_RESTAURANT_ID = '0b9e9031-4223-4124-b633-e3a853abfb8f';
// Placeholder restaurant_id used for seed/default templates (matches migration data)
const DEFAULT_TEMPLATE_RESTAURANT_ID = '00000000-0000-0000-0000-000000000000';

interface QuestionItem {
  id: string;
  text: string;
  category: string;
}

@Injectable()
export class QuestionTemplatesService {
  private readonly logger = new Logger(QuestionTemplatesService.name);

  constructor(private readonly supabase: SupabaseService) {}

  // Query active template for a given restaurant_id (shared helper)
  private async queryActiveTemplate(client: ReturnType<SupabaseService['getClient']>, restaurantId: string) {
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
      this.logger.error(`Failed to fetch active template for ${restaurantId}: ${error.message}`);
      throw error;
    }

    return data;
  }

  // Get currently active template for a restaurant (recorder page)
  // Falls back to default template if no restaurant-specific template exists
  async getActiveTemplate(restaurantId: string) {
    const safeRestaurantId = UUID_REGEX.test(restaurantId) ? restaurantId : DEFAULT_RESTAURANT_ID;

    if (this.supabase.isMockMode()) {
      return {
        template: {
          id: 'mock-tpl-1',
          restaurant_id: safeRestaurantId,
          template_name: '标准桌访问卷 v2',
          questions: [
            { id: 'q1', text: '菜都上齐了吧？今天点的这几道，有没有哪道让您印象特别深的？', category: '菜品' },
            { id: 'q2', text: '今天有没有什么小遗憾？哪怕很小的细节也想听听。', category: '体验' },
            { id: 'q3', text: '对了，您是老朋友还是第一次来呀？', category: '画像' },
            { id: 'q4', text: '今天服务上有没有让您觉得特别贴心的？或者哪里还可以做得更好？', category: '服务' },
          ],
          is_active: true,
        },
      };
    }

    const client = this.supabase.getClient();

    // 1. Try restaurant-specific template
    let template = await this.queryActiveTemplate(client, safeRestaurantId);

    // 2. Fallback to default template if none found for this restaurant
    if (!template && safeRestaurantId !== DEFAULT_TEMPLATE_RESTAURANT_ID) {
      this.logger.log(`No template for ${safeRestaurantId}, falling back to default`);
      template = await this.queryActiveTemplate(client, DEFAULT_TEMPLATE_RESTAURANT_ID);
    }

    return { template: template || null };
  }

  // List all templates for a restaurant (admin page)
  async listTemplates(restaurantId: string) {
    if (this.supabase.isMockMode()) {
      return {
        templates: [
          {
            id: 'mock-tpl-1',
            restaurant_id: restaurantId,
            template_name: '标准桌访问卷 v2',
            questions: [
              { id: 'q1', text: '菜都上齐了吧？今天点的这几道，有没有哪道让您印象特别深的？', category: '菜品' },
              { id: 'q2', text: '今天有没有什么小遗憾？哪怕很小的细节也想听听。', category: '体验' },
              { id: 'q3', text: '对了，您是老朋友还是第一次来呀？', category: '画像' },
              { id: 'q4', text: '今天服务上有没有让您觉得特别贴心的？或者哪里还可以做得更好？', category: '服务' },
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
