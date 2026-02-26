// Meeting Service - Upload, DB operations for meeting recordings

import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { getChinaDateString, getChinaHour, resolveRange, getYesterdayChinaDateString } from '../../common/utils/date';
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

  async getAdminOverview(date?: string, startDate?: string, endDate?: string, employeeId?: string, managedIds?: string[] | null) {
    const client = this.supabase.getClient();
    // Resolve date range (backward-compatible with ?date= param)
    const range = resolveRange(date, startDate, endDate, getYesterdayChinaDateString);

    // 1. Get visible restaurants (scoped or all)
    let restQuery = client
      .from('master_restaurant')
      .select('id, restaurant_name')
      .order('restaurant_name');
    if (managedIds && managedIds.length > 0) {
      restQuery = restQuery.in('id', managedIds);
    }
    const { data: restaurants, error: restErr } = await restQuery;

    if (restErr) {
      this.logger.error(`Failed to fetch restaurants: ${restErr.message}`);
      throw restErr;
    }

    // 2. Get meetings for the date range (scoped to visible restaurants)
    const restIds = (restaurants || []).map(r => r.id);
    let meetQuery = client
      .from('lingtin_meeting_records')
      .select('id, restaurant_id, employee_id, meeting_type, status, ai_summary, action_items, key_decisions, audio_url, duration_seconds, created_at')
      .gte('meeting_date', range.start)
      .lte('meeting_date', range.end)
      .order('created_at', { ascending: false });
    if (managedIds && managedIds.length > 0) {
      meetQuery = meetQuery.in('restaurant_id', restIds);
    }
    const { data: meetings, error: meetErr } = await meetQuery;

    if (meetErr) {
      this.logger.error(`Failed to fetch meetings: ${meetErr.message}`);
      throw meetErr;
    }

    const allMeetings = meetings || [];

    // 3. Group meetings by restaurant_id
    const meetingsByStore = new Map<string, typeof allMeetings>();
    for (const m of allMeetings) {
      const list = meetingsByStore.get(m.restaurant_id) || [];
      list.push(m);
      meetingsByStore.set(m.restaurant_id, list);
    }

    // 4. For stores without meetings, find their last meeting date
    const storesWithoutMeetings = (restaurants || []).filter(r => !meetingsByStore.has(r.id));
    const lastMeetingDates = new Map<string, string | null>();

    if (storesWithoutMeetings.length > 0) {
      for (const store of storesWithoutMeetings) {
        const { data: lastMeeting } = await client
          .from('lingtin_meeting_records')
          .select('meeting_date')
          .eq('restaurant_id', store.id)
          .order('meeting_date', { ascending: false })
          .limit(1)
          .maybeSingle();

        lastMeetingDates.set(store.id, lastMeeting?.meeting_date || null);
      }
    }

    // 5. Build store list
    const stores = (restaurants || []).map(r => {
      const storeMeetings = meetingsByStore.get(r.id) || [];
      return {
        id: r.id,
        name: r.restaurant_name,
        meetings: storeMeetings.map(m => ({
          id: m.id,
          meeting_type: m.meeting_type,
          duration_seconds: m.duration_seconds,
          ai_summary: m.ai_summary,
          action_items: m.action_items,
          key_decisions: m.key_decisions,
          status: m.status,
          audio_url: m.audio_url,
          created_at: m.created_at,
        })),
        last_meeting_date: storeMeetings.length > 0
          ? (storeMeetings[0].created_at?.split('T')[0] || range.end)
          : (lastMeetingDates.get(r.id) || null),
      };
    });

    // 6. Separate "my meetings" if employeeId provided
    const myMeetings = employeeId
      ? allMeetings
          .filter(m => m.employee_id === employeeId)
          .map(m => ({
            id: m.id,
            meeting_type: m.meeting_type,
            duration_seconds: m.duration_seconds,
            ai_summary: m.ai_summary,
            action_items: m.action_items,
            key_decisions: m.key_decisions,
            status: m.status,
            audio_url: m.audio_url,
            created_at: m.created_at,
          }))
      : [];

    const storesWithMeetings = stores.filter(s => s.meetings.length > 0).length;

    return {
      date: range.start,
      summary: {
        total_meetings: allMeetings.length,
        stores_with_meetings: storesWithMeetings,
        stores_without: stores.length - storesWithMeetings,
      },
      stores,
      my_meetings: myMeetings,
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
