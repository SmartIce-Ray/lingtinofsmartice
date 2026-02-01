// Audio Service - Business logic for recording processing
// v2.9 - Fixed Chinese tableId causing Supabase Storage 400 error (包1 -> bao1)

import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { getChinaDateString, getChinaHour } from '../../common/utils/date';

@Injectable()
export class AudioService {
  private readonly logger = new Logger(AudioService.name);

  constructor(private readonly supabase: SupabaseService) {}

  async uploadAndProcess(
    file: Express.Multer.File,
    tableId: string,
    restaurantId: string,
    employeeId?: string,
    recordingId?: string,
  ) {
    this.logger.log(`Uploading audio for table ${tableId}, recording ${recordingId}`);

    // Check if running in mock mode
    if (this.supabase.isMockMode()) {
      this.logger.warn('[MOCK] Simulating audio upload');
      const mockUrl = `https://mock-storage.local/${restaurantId}/${Date.now()}_${tableId}.webm`;

      const visitRecord = await this.supabase.createVisitRecord({
        id: recordingId,
        restaurant_id: restaurantId,
        employee_id: employeeId,
        table_id: tableId,
        audio_url: mockUrl,
        visit_period: getChinaHour() < 15 ? 'lunch' : 'dinner',
      });

      return {
        visit_id: visitRecord.id,
        recording_id: recordingId,
        status: 'uploaded',
        audioUrl: mockUrl,
      };
    }

    // Production: Upload to Supabase Storage
    // Bucket: 'lingtin', Path: 'recordings/{restaurantId}/{timestamp}_{safeTableId}.webm'
    const client = this.supabase.getClient();
    // Convert Chinese tableId to ASCII-safe format for Supabase Storage
    // Chinese chars like "包1", "外13" -> "bao1", "wai13" using simple mapping
    const safeTableId = this.toAsciiTableId(tableId);
    const filePath = `recordings/${restaurantId}/${Date.now()}_${safeTableId}.webm`;
    this.logger.log(`Uploading to path: ${filePath} (original tableId: ${tableId})`);

    const { error: uploadError } = await client.storage
      .from('lingtin')
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
      });

    if (uploadError) throw uploadError;

    const { data: urlData } = client.storage
      .from('lingtin')
      .getPublicUrl(filePath);

    const hour = getChinaHour();
    const visitPeriod = hour < 15 ? 'lunch' : 'dinner';

    const visitRecord = await this.supabase.createVisitRecord({
      id: recordingId,
      restaurant_id: restaurantId,
      employee_id: employeeId,
      table_id: tableId,
      audio_url: urlData.publicUrl,
      visit_period: visitPeriod,
    });

    return {
      visit_id: visitRecord.id,
      recording_id: recordingId,
      status: 'uploaded',
      audioUrl: urlData.publicUrl,
    };
  }

  async getProcessingStatus(visitId: string) {
    if (this.supabase.isMockMode()) {
      this.logger.warn('[MOCK] Returning mock status');
      return {
        visit_id: visitId,
        status: 'processed',
        processed_at: new Date().toISOString(),
        error_message: null,
        ai_summary: '顾客对菜品满意',
      };
    }

    const client = this.supabase.getClient();

    const { data, error } = await client
      .from('lingtin_visit_records')
      .select('id, status, processed_at, error_message, ai_summary')
      .eq('id', visitId)
      .single();

    if (error) throw error;

    return {
      visit_id: data.id,
      status: data.status,
      processed_at: data.processed_at,
      error_message: data.error_message,
      ai_summary: data.ai_summary,
    };
  }

  // Get pending records that have audio_url but haven't been processed
  // Used for recovery after page refresh interrupts processing
  async getPendingRecords() {
    if (this.supabase.isMockMode()) {
      this.logger.warn('[MOCK] Returning empty pending records');
      return [];
    }

    const client = this.supabase.getClient();

    // Get records from last 7 days that are pending and have audio_url
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const { data, error } = await client
      .from('lingtin_visit_records')
      .select('id, table_id, audio_url, restaurant_id, created_at')
      .eq('status', 'pending')
      .not('audio_url', 'is', null)
      .gte('created_at', sevenDaysAgo.toISOString())
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      this.logger.error(`Failed to fetch pending records: ${error.message}`);
      throw error;
    }

    this.logger.log(`Found ${data?.length || 0} pending records`);
    return data || [];
  }

  // Get today's recordings for a restaurant (for frontend sync)
  async getTodayRecordings(restaurantId: string) {
    if (this.supabase.isMockMode()) {
      this.logger.warn('[MOCK] Returning empty today recordings');
      return [];
    }

    const client = this.supabase.getClient();
    const today = getChinaDateString();

    const { data, error } = await client
      .from('lingtin_visit_records')
      .select('id, table_id, status, ai_summary, sentiment_score, audio_url, created_at')
      .eq('restaurant_id', restaurantId)
      .eq('visit_date', today)
      .order('created_at', { ascending: false });

    if (error) {
      this.logger.error(`Failed to fetch today recordings: ${error.message}`);
      throw error;
    }

    return data || [];
  }

  // Delete a recording from database
  async deleteRecording(visitId: string) {
    if (this.supabase.isMockMode()) {
      this.logger.warn('[MOCK] Simulating delete');
      return;
    }

    const client = this.supabase.getClient();

    const { error } = await client
      .from('lingtin_visit_records')
      .delete()
      .eq('id', visitId);

    if (error) {
      this.logger.error(`Failed to delete recording: ${error.message}`);
      throw error;
    }
  }

  // Update recording status (for error recovery from frontend)
  async updateRecordingStatus(
    visitId: string,
    status: string,
    errorMessage?: string,
  ) {
    if (this.supabase.isMockMode()) {
      this.logger.warn(`[MOCK] Would update status to ${status}`);
      return;
    }

    const client = this.supabase.getClient();

    const updateData: Record<string, unknown> = { status };
    if (errorMessage) {
      updateData.error_message = errorMessage;
    }
    if (status === 'error' || status === 'processed') {
      updateData.processed_at = new Date().toISOString();
    }

    const { error } = await client
      .from('lingtin_visit_records')
      .update(updateData)
      .eq('id', visitId);

    if (error) {
      this.logger.error(`Failed to update status: ${error.message}`);
      throw error;
    }
  }

  // Convert Chinese table IDs to ASCII-safe format for Supabase Storage
  // Common patterns: 包1 -> bao1, 外13 -> wai13, A1 -> A1
  private toAsciiTableId(tableId: string): string {
    const chineseMap: Record<string, string> = {
      包: 'bao',
      外: 'wai',
      内: 'nei',
      大: 'da',
      小: 'xiao',
      厅: 'ting',
      雅: 'ya',
      间: 'jian',
      桌: 'zhuo',
      台: 'tai',
      号: 'hao',
      楼: 'lou',
      层: 'ceng',
      区: 'qu',
      座: 'zuo',
    };

    let result = tableId;
    for (const [chinese, pinyin] of Object.entries(chineseMap)) {
      result = result.replace(new RegExp(chinese, 'g'), pinyin);
    }

    // If still contains non-ASCII, fallback to hex encoding
    if (!/^[\x00-\x7F]*$/.test(result)) {
      result = Buffer.from(tableId, 'utf8').toString('hex');
    }

    return result;
  }
}
