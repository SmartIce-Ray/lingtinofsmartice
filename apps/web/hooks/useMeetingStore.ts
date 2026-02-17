// Meeting Store - Database as single source of truth
// Follows same pattern as useRecordingStore for meeting recordings

import { useState, useEffect, useCallback, useRef } from 'react';
import { getAuthHeaders } from '@/contexts/AuthContext';
import { getApiUrl } from '@/lib/api';
import { cancelProcessing } from '@/lib/backgroundProcessor';
import { createClient } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

export type MeetingType = 'pre_meal' | 'daily_review' | 'weekly';

export type MeetingStatus =
  | 'saved'
  | 'uploading'
  | 'pending'
  | 'processing'
  | 'processed'
  | 'completed'
  | 'error';

export interface MeetingRecord {
  id: string;
  meetingType: MeetingType;
  duration: number;
  timestamp: number;
  status: MeetingStatus;
  audioData?: string;
  audioUrl?: string;
  aiSummary?: string;
  actionItems?: Array<{ who: string; what: string; deadline: string }>;
  keyDecisions?: Array<{ decision: string; context: string }>;
  errorMessage?: string;
}

const LOCAL_STORAGE_KEY = 'lingtin_meetings_local';
const MAX_LOCAL_MEETINGS = 20;

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function getLocalMeetings(): MeetingRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!stored) return [];

    const meetings: MeetingRecord[] = JSON.parse(stored);

    let hasStuckUploads = false;
    const fixed = meetings.map(m => {
      if (m.status === 'uploading' && m.audioData) {
        hasStuckUploads = true;
        return { ...m, status: 'saved' as MeetingStatus };
      }
      return m;
    });

    if (hasStuckUploads) {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(fixed));
    }

    return fixed;
  } catch {
    return [];
  }
}

function saveLocalMeetings(meetings: MeetingRecord[]): void {
  if (typeof window === 'undefined') return;
  try {
    const trimmed = meetings.slice(0, MAX_LOCAL_MEETINGS);
    const toSave = trimmed.map(m => {
      if (m.status === 'completed' || m.status === 'processed') {
        const { audioData, ...rest } = m;
        return rest;
      }
      return m;
    });
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(toSave));
  } catch (error) {
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      try {
        const minimal = meetings.slice(0, 5).map(m => {
          const { audioData, ...rest } = m;
          return rest;
        });
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(minimal));
      } catch {
        localStorage.removeItem(LOCAL_STORAGE_KEY);
      }
    }
  }
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function dbRecordToMeeting(dbRecord: {
  id: string;
  meeting_type: string;
  status: string;
  ai_summary?: string;
  action_items?: Array<{ who: string; what: string; deadline: string }>;
  key_decisions?: Array<{ decision: string; context: string }>;
  audio_url?: string;
  duration_seconds?: number;
  error_message?: string;
  created_at: string;
}): MeetingRecord {
  return {
    id: dbRecord.id,
    meetingType: dbRecord.meeting_type as MeetingType,
    duration: dbRecord.duration_seconds || 0,
    timestamp: new Date(dbRecord.created_at).getTime(),
    status: dbRecord.status === 'processed' ? 'completed' : dbRecord.status as MeetingStatus,
    aiSummary: dbRecord.ai_summary,
    actionItems: dbRecord.action_items,
    keyDecisions: dbRecord.key_decisions,
    audioUrl: dbRecord.audio_url,
    errorMessage: dbRecord.error_message,
  };
}

export function useMeetingStore(restaurantId?: string, date?: string) {
  const [meetings, setMeetings] = useState<MeetingRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Fetch meetings from database
  useEffect(() => {
    const fetchFromDatabase = async () => {
      if (!restaurantId) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const dateParam = date ? `&date=${date}` : '';
        const response = await fetch(getApiUrl(`api/meeting/today?restaurant_id=${restaurantId}${dateParam}`), {
          headers: getAuthHeaders(),
        });

        if (response.ok) {
          const { records } = await response.json();
          const dbMeetings = records.map(dbRecordToMeeting);

          if (!date) {
            const localMeetings = getLocalMeetings();
            const localNotUploaded = localMeetings.filter(
              m => m.status === 'saved' || m.status === 'uploading'
            );
            setMeetings([...localNotUploaded, ...dbMeetings]);
          } else {
            setMeetings(dbMeetings);
          }
        } else if (!date) {
          setMeetings(getLocalMeetings());
        }
      } catch (error) {
        console.error('[MeetingStore] Failed to fetch from database:', error);
        if (!date) {
          setMeetings(getLocalMeetings());
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchFromDatabase();
  }, [restaurantId, date]);

  // Subscribe to Supabase Realtime for live updates
  useEffect(() => {
    if (!restaurantId) return;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey || !supabaseUrl.startsWith('http')) {
      return;
    }

    const supabase = createClient();

    const channel = supabase
      .channel(`meeting-records-changes-${restaurantId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'lingtin_meeting_records',
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        (payload) => {
          const updated = payload.new as {
            id: string;
            meeting_type: string;
            status: string;
            ai_summary?: string;
            action_items?: Array<{ who: string; what: string; deadline: string }>;
            key_decisions?: Array<{ decision: string; context: string }>;
            audio_url?: string;
            duration_seconds?: number;
            error_message?: string;
            created_at: string;
          };

          setMeetings(prev =>
            prev.map(m => m.id === updated.id ? dbRecordToMeeting(updated) : m)
          );
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'lingtin_meeting_records',
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        (payload) => {
          const newRecord = payload.new as {
            id: string;
            meeting_type: string;
            status: string;
            ai_summary?: string;
            action_items?: Array<{ who: string; what: string; deadline: string }>;
            key_decisions?: Array<{ decision: string; context: string }>;
            audio_url?: string;
            duration_seconds?: number;
            error_message?: string;
            created_at: string;
          };

          setMeetings(prev => {
            const exists = prev.some(m => m.id === newRecord.id);
            if (exists) {
              return prev.map(m => m.id === newRecord.id ? dbRecordToMeeting(newRecord) : m);
            }
            return [dbRecordToMeeting(newRecord), ...prev];
          });
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [restaurantId]);

  const saveMeeting = useCallback(async (
    meetingType: MeetingType,
    duration: number,
    audioBlob: Blob
  ): Promise<MeetingRecord> => {
    const audioData = await blobToBase64(audioBlob);

    const newMeeting: MeetingRecord = {
      id: generateUUID(),
      meetingType,
      duration,
      timestamp: Date.now(),
      status: 'saved',
      audioData,
    };

    setMeetings(prev => {
      const updated = [newMeeting, ...prev];
      const localMeetings = updated.filter(m => m.status === 'saved' || m.status === 'uploading');
      saveLocalMeetings(localMeetings);
      return updated;
    });

    return newMeeting;
  }, []);

  const updateMeeting = useCallback((id: string, updates: Partial<MeetingRecord>) => {
    setMeetings(prev => {
      const updated = prev.map(m => m.id === id ? { ...m, ...updates } : m);
      const localMeetings = updated.filter(m => m.status === 'saved' || m.status === 'uploading');
      saveLocalMeetings(localMeetings);
      return updated;
    });
  }, []);

  const deleteMeeting = useCallback(async (id: string) => {
    cancelProcessing(id);

    setMeetings(prev => {
      const updated = prev.filter(m => m.id !== id);
      const localMeetings = updated.filter(m => m.status === 'saved' || m.status === 'uploading');
      saveLocalMeetings(localMeetings);
      return updated;
    });

    try {
      await fetch(getApiUrl(`api/meeting/${id}`), {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
    } catch (error) {
      console.error('[MeetingStore] Failed to delete from database:', error);
    }
  }, []);

  const getMeetingsNeedingRetry = useCallback(() => {
    return meetings.filter(m =>
      (m.status === 'saved' || m.status === 'uploading') && m.audioData
    );
  }, [meetings]);

  return {
    meetings,
    isLoading,
    saveMeeting,
    updateMeeting,
    deleteMeeting,
    getMeetingsNeedingRetry,
  };
}
