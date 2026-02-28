// Feedback Service - DB operations for employee product feedback

import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { randomUUID } from 'crypto';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_RESTAURANT_ID = '0b9e9031-4223-4124-b633-e3a853abfb8f';

@Injectable()
export class FeedbackService {
  private readonly logger = new Logger(FeedbackService.name);

  constructor(private readonly supabase: SupabaseService) {}

  private safeRestaurantId(id: string): string {
    return UUID_REGEX.test(id) ? id : DEFAULT_RESTAURANT_ID;
  }

  private validateEmployeeId(id: string): string {
    if (!id || !UUID_REGEX.test(id)) {
      throw new Error('Invalid employee_id format');
    }
    return id;
  }

  async uploadImages(files: Express.Multer.File[], restaurantId: string): Promise<string[]> {
    const client = this.supabase.getClient();
    const safeRid = this.safeRestaurantId(restaurantId);
    const urls: string[] = [];

    for (const file of files) {
      const ext = file.mimetype?.includes('png') ? 'png' : file.mimetype?.includes('webp') ? 'webp' : 'jpg';
      const filePath = `feedback-images/${safeRid}/${Date.now()}_${randomUUID().slice(0, 8)}.${ext}`;

      const { error: uploadError } = await client.storage
        .from('lingtin')
        .upload(filePath, file.buffer, { contentType: file.mimetype });

      if (uploadError) {
        this.logger.error(`Failed to upload image: ${uploadError.message}`);
        continue;
      }

      const { data: urlData } = client.storage.from('lingtin').getPublicUrl(filePath);
      urls.push(urlData.publicUrl);
    }

    return urls;
  }

  async createTextFeedback(
    restaurantId: string,
    employeeId: string,
    contentText: string,
    imageUrls: string[],
    classification: { category: string; ai_summary: string; priority: string; tags: string[] },
  ) {
    const client = this.supabase.getClient();
    const id = randomUUID();

    const record = {
      id,
      restaurant_id: this.safeRestaurantId(restaurantId),
      employee_id: this.validateEmployeeId(employeeId),
      input_type: 'text',
      content_text: contentText,
      image_urls: imageUrls,
      category: classification.category,
      ai_summary: classification.ai_summary,
      priority: classification.priority,
      tags: classification.tags,
      status: 'pending',
    };

    const { data, error } = await client
      .from('lingtin_product_feedback')
      .insert(record)
      .select()
      .single();

    if (error) {
      this.logger.error(`Failed to create feedback: ${error.message}`);
      throw error;
    }

    return data;
  }

  async createVoiceFeedback(
    file: Express.Multer.File,
    restaurantId: string,
    employeeId: string,
    durationSeconds?: number,
    imageUrls?: string[],
  ) {
    const client = this.supabase.getClient();
    const id = randomUUID();
    const safeRid = this.safeRestaurantId(restaurantId);

    // Upload to Supabase Storage
    const ext = file.mimetype?.includes('mp4') ? 'mp4' : 'webm';
    const filePath = `recordings/feedback/${safeRid}/${Date.now()}_feedback.${ext}`;

    const { error: uploadError } = await client.storage
      .from('lingtin')
      .upload(filePath, file.buffer, { contentType: file.mimetype });

    if (uploadError) throw uploadError;

    const { data: urlData } = client.storage
      .from('lingtin')
      .getPublicUrl(filePath);

    const record = {
      id,
      restaurant_id: safeRid,
      employee_id: this.validateEmployeeId(employeeId),
      input_type: 'voice',
      content_text: '',
      audio_url: urlData.publicUrl,
      duration_seconds: durationSeconds,
      image_urls: imageUrls || [],
      stt_status: 'pending',
      status: 'pending',
    };

    const { data, error } = await client
      .from('lingtin_product_feedback')
      .insert(record)
      .select()
      .single();

    if (error) {
      this.logger.error(`Failed to create voice feedback: ${error.message}`);
      throw error;
    }

    return data;
  }

  async processFeedback(
    feedbackId: string,
    transcript: string,
    classification: { category: string; ai_summary: string; priority: string; tags: string[] },
  ) {
    const client = this.supabase.getClient();

    const { data, error } = await client
      .from('lingtin_product_feedback')
      .update({
        content_text: transcript,
        raw_transcript: transcript,
        stt_status: 'completed',
        category: classification.category,
        ai_summary: classification.ai_summary,
        priority: classification.priority,
        tags: classification.tags,
      })
      .eq('id', feedbackId)
      .select()
      .single();

    if (error) {
      this.logger.error(`Failed to update feedback: ${error.message}`);
      throw error;
    }

    return data;
  }

  async updateSttStatus(feedbackId: string, status: string, errorMessage?: string) {
    const client = this.supabase.getClient();
    const update: Record<string, unknown> = { stt_status: status };
    if (errorMessage) update.error_message = errorMessage;

    const { error } = await client
      .from('lingtin_product_feedback')
      .update(update)
      .eq('id', feedbackId);

    if (error) {
      this.logger.error(`Failed to update stt_status: ${error.message}`);
    }
  }

  async getMyFeedback(employeeId: string) {
    const client = this.supabase.getClient();

    const { data, error } = await client
      .from('lingtin_product_feedback')
      .select('*')
      .eq('employee_id', this.validateEmployeeId(employeeId))
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      this.logger.error(`Failed to fetch feedback: ${error.message}`);
      throw error;
    }

    return data || [];
  }

  async getAllFeedback(filters?: { status?: string; category?: string }) {
    const client = this.supabase.getClient();

    let query = client
      .from('lingtin_product_feedback')
      .select('*, master_employee!lingtin_product_feedback_employee_id_fkey(employee_name, restaurant_id), master_restaurant!lingtin_product_feedback_restaurant_id_fkey(restaurant_name)')
      .order('created_at', { ascending: false })
      .limit(100);

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.category) {
      query = query.eq('category', filters.category);
    }

    const { data, error } = await query;

    if (error) {
      // Fallback without join if FK doesn't exist
      this.logger.warn(`Join query failed, falling back: ${error.message}`);
      let fallbackQuery = client
        .from('lingtin_product_feedback')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (filters?.status) {
        fallbackQuery = fallbackQuery.eq('status', filters.status);
      }
      if (filters?.category) {
        fallbackQuery = fallbackQuery.eq('category', filters.category);
      }

      const { data: fbData, error: fbError } = await fallbackQuery;
      if (fbError) throw fbError;
      return fbData || [];
    }

    return data || [];
  }

  async updateStatus(feedbackId: string, status: string, changedBy: string) {
    const client = this.supabase.getClient();

    const VALID_STATUSES = ['pending', 'read', 'in_progress', 'resolved', 'dismissed'];
    if (!VALID_STATUSES.includes(status)) {
      throw new Error(`Invalid status: ${status}`);
    }

    const { data, error } = await client
      .from('lingtin_product_feedback')
      .update({
        status,
        status_changed_at: new Date().toISOString(),
        status_changed_by: changedBy,
      })
      .eq('id', feedbackId)
      .select()
      .single();

    if (error) {
      this.logger.error(`Failed to update status: ${error.message}`);
      throw error;
    }

    return data;
  }

  async replyToFeedback(feedbackId: string, reply: string, replyBy: string) {
    const client = this.supabase.getClient();

    const { data, error } = await client
      .from('lingtin_product_feedback')
      .update({
        admin_reply: reply,
        admin_reply_by: replyBy,
        admin_reply_at: new Date().toISOString(),
      })
      .eq('id', feedbackId)
      .select()
      .single();

    if (error) {
      this.logger.error(`Failed to reply: ${error.message}`);
      throw error;
    }

    return data;
  }
}
