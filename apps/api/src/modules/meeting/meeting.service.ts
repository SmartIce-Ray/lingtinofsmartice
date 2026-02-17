// Meeting Service - Upload, DB operations for meeting recordings

import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { getChinaDateString, getChinaHour } from '../../common/utils/date';
import { randomUUID } from 'crypto';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_RESTAURANT_ID = '0b9e9031-4223-4124-b633-e3a853abfb8f';

@Injectable()
export class MeetingService {
  private readonly logger = new Logger(MeetingService.name);

  constructor(private readonly supabase: SupabaseService) {}

  async uploadMeeting(
    file: Express.Multer.File,
    meetingType: string,
    restaurantId: string,
    employeeId?: string,
    recordingId?: string,
    durationSeconds?: number,
  ) {
    const client = this.supabase.getClient();

    const meetingId = recordingId && UUID_REGEX.test(recordingId) ? recordingId : randomUUID();
    const safeRestaurantId = UUID_REGEX.test(restaurantId) ? restaurantId : DEFAULT_RESTAURANT_ID;

    // Upload to Supabase Storage under recordings/meetings/
    const ext = file.mimetype?.includes('mp4') ? 'mp4' : 'webm';
    const filePath = `recordings/meetings/${safeRestaurantId}/${Date.now()}_${meetingType}.${ext}`;
    this.logger.log(`Uploading to path: ${filePath}`);

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
    let meetingPeriod: string;
    if (hour < 12) meetingPeriod = 'morning';
    else if (hour < 17) meetingPeriod = 'afternoon';
    else meetingPeriod = 'evening';

    const insertRecord = {
      id: meetingId,
      restaurant_id: safeRestaurantId,
      employee_id: employeeId && UUID_REGEX.test(employeeId) ? employeeId : null,
      meeting_type: meetingType,
      audio_url: urlData.publicUrl,
      duration_seconds: durationSeconds,
      meeting_date: getChinaDateString(),
      meeting_period: meetingPeriod,
      status: 'pending',
    };

    const { data, error } = await client
      .from('lingtin_meeting_records')
      .upsert(insertRecord, { onConflict: 'id' })
      .select()
      .single();

    if (error) {
      this.logger.error(`Failed to create meeting record: ${error.message}`);
      throw error;
    }

    return {
      meeting_id: data.id,
      recording_id: recordingId,
      status: 'uploaded',
      audioUrl: urlData.publicUrl,
    };
  }

  async getTodayMeetings(restaurantId: string, date?: string) {
    const client = this.supabase.getClient();
    const targetDate = date || getChinaDateString();
    const safeRestaurantId = UUID_REGEX.test(restaurantId) ? restaurantId : DEFAULT_RESTAURANT_ID;

    const { data, error } = await client
      .from('lingtin_meeting_records')
      .select('id, meeting_type, status, ai_summary, action_items, key_decisions, audio_url, duration_seconds, error_message, created_at')
      .eq('restaurant_id', safeRestaurantId)
      .eq('meeting_date', targetDate)
      .order('created_at', { ascending: false });

    if (error) {
      this.logger.error(`Failed to fetch today meetings: ${error.message}`);
      throw error;
    }

    return data || [];
  }

  async getPendingMeetings(restaurantId?: string) {
    const client = this.supabase.getClient();

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    let query = client
      .from('lingtin_meeting_records')
      .select('id, meeting_type, audio_url, restaurant_id, created_at')
      .eq('status', 'pending')
      .not('audio_url', 'is', null)
      .gte('created_at', sevenDaysAgo.toISOString())
      .order('created_at', { ascending: false })
      .limit(20);

    if (restaurantId) {
      query = query.eq('restaurant_id', restaurantId);
    }

    const { data, error } = await query;

    if (error) {
      this.logger.error(`Failed to fetch pending meetings: ${error.message}`);
      throw error;
    }

    return data || [];
  }

  async deleteMeeting(id: string) {
    const client = this.supabase.getClient();

    const { error } = await client
      .from('lingtin_meeting_records')
      .delete()
      .eq('id', id);

    if (error) {
      this.logger.error(`Failed to delete meeting: ${error.message}`);
      throw error;
    }
  }

  async updateMeetingStatus(id: string, status: string, errorMessage?: string) {
    const client = this.supabase.getClient();

    const updateData: Record<string, unknown> = { status };
    if (errorMessage) {
      updateData.error_message = errorMessage;
    }
    if (status === 'error' || status === 'processed') {
      updateData.processed_at = new Date().toISOString();
    }

    const { error } = await client
      .from('lingtin_meeting_records')
      .update(updateData)
      .eq('id', id);

    if (error) {
      this.logger.error(`Failed to update meeting status: ${error.message}`);
      throw error;
    }
  }
}
