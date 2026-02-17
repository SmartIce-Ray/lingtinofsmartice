// Supabase Service - Database and Storage Client
// v1.7 - Added retry fetch for network resilience (China → overseas)

import { Injectable, Logger } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { getChinaDateString } from '../utils/date';
import { createRetryFetch } from '../utils/fetch-with-retry';

// Default restaurant ID for demo/testing
const DEFAULT_RESTAURANT_ID = '0b9e9031-4223-4124-b633-e3a853abfb8f';

// UUID regex pattern
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(str: string): boolean {
  return UUID_REGEX.test(str);
}

@Injectable()
export class SupabaseService {
  private client: SupabaseClient | null = null;
  private readonly logger = new Logger(SupabaseService.name);
  private mockMode = false;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (process.env.MOCK_MODE === 'true' || !supabaseUrl || !supabaseKey || supabaseUrl.includes('your-')) {
      this.logger.warn('Supabase not configured - running in MOCK MODE');
      this.mockMode = true;
    } else {
      this.client = createClient(supabaseUrl, supabaseKey, {
        global: {
          fetch: createRetryFetch({ maxRetries: 3, baseDelayMs: 1000 }),
        },
      });
      this.logger.log('Supabase client initialized with retry fetch');
    }
  }

  getClient(): SupabaseClient {
    if (this.mockMode || !this.client) {
      throw new Error('Supabase not configured - running in mock mode');
    }
    return this.client;
  }

  isMockMode(): boolean {
    return this.mockMode;
  }

  // Helper: Get dish names for STT correction
  async getDishNames(): Promise<string[]> {
    if (this.mockMode) {
      this.logger.log('[MOCK] Returning sample dish names');
      return [
        '清蒸鲈鱼', '油焖大虾', '红烧肉', '宫保鸡丁', '蒜蓉粉丝虾',
        '麻婆豆腐', '糖醋排骨', '回锅肉', '水煮鱼', '鱼香肉丝',
      ];
    }

    const { data, error } = await this.client!
      .from('lingtin_dishname_view')
      .select('dish_name');

    if (error) {
      this.logger.warn(`Failed to get dish names: ${error.message}`);
      return [];
    }
    return data?.map((d) => d.dish_name) || [];
  }

  // Helper: Create visit record with proper UUID handling
  async createVisitRecord(record: {
    id?: string;
    restaurant_id: string;
    employee_id?: string;
    table_id: string;
    audio_url: string;
    duration_seconds?: number;
    visit_date?: string;
    visit_period?: string;
  }) {
    // Generate UUID if not provided or invalid
    const visitId = record.id && isValidUUID(record.id) ? record.id : randomUUID();

    // Use default restaurant ID if invalid
    const restaurantId = isValidUUID(record.restaurant_id)
      ? record.restaurant_id
      : DEFAULT_RESTAURANT_ID;

    // Set visit_date to today in China timezone if not provided
    const visitDate = record.visit_date || getChinaDateString();

    const insertRecord = {
      id: visitId,
      restaurant_id: restaurantId,
      employee_id: record.employee_id && isValidUUID(record.employee_id) ? record.employee_id : null,
      table_id: record.table_id,
      audio_url: record.audio_url,
      duration_seconds: record.duration_seconds,
      visit_date: visitDate,
      visit_period: record.visit_period,
      status: 'pending',
    };

    this.logger.log(`Creating visit record: ${visitId} for restaurant ${restaurantId}`);

    if (this.mockMode) {
      this.logger.log(`[MOCK] Visit record created`);
      return {
        ...insertRecord,
        created_at: new Date().toISOString(),
      };
    }

    // Use upsert to prevent duplicate records when the same recording is uploaded multiple times
    const { data, error } = await this.client!
      .from('lingtin_visit_records')
      .upsert(insertRecord, { onConflict: 'id' })
      .select()
      .single();

    if (error) {
      this.logger.error(`Failed to create visit record: ${error.message}`);
      throw error;
    }

    this.logger.log(`Visit record created successfully: ${data.id}`);
    return data;
  }

  // Helper: Update visit record with AI results
  async updateVisitWithAIResults(
    visitId: string,
    results: {
      raw_transcript?: string;
      corrected_transcript?: string;
      visit_type?: string;
      sentiment_score?: number;
      service_stage?: string;
      ai_summary?: string;
      status?: string;
      processed_at?: string;
    },
  ) {
    if (this.mockMode) {
      this.logger.log(`[MOCK] Updating visit ${visitId} with AI results`);
      return { id: visitId, ...results };
    }

    const { data, error } = await this.client!
      .from('lingtin_visit_records')
      .update(results)
      .eq('id', visitId)
      .select()
      .single();

    if (error) {
      this.logger.error(`Failed to update visit record: ${error.message}`);
      throw error;
    }
    return data;
  }

  // Helper: Insert dish mentions
  async insertDishMentions(
    mentions: Array<{
      visit_id: string;
      dish_name: string;
      sentiment: string;
      feedback_text?: string;
    }>,
  ) {
    if (this.mockMode) {
      this.logger.log(`[MOCK] Inserting ${mentions.length} dish mentions`);
      return mentions.map((m, i) => ({ id: `mock-dm-${i}`, ...m }));
    }

    const { data, error } = await this.client!
      .from('lingtin_dish_mentions')
      .insert(mentions)
      .select();

    if (error) {
      this.logger.error(`Failed to insert dish mentions: ${error.message}`);
      throw error;
    }
    return data;
  }
}
