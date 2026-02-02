// Recording Store - Database as single source of truth
// v2.7 - Added: Support date parameter for viewing historical recordings

import { useState, useEffect, useCallback, useRef } from 'react';
import { getAuthHeaders } from '@/contexts/AuthContext';
import { getApiUrl } from '@/lib/api';
import { cancelProcessing } from '@/lib/backgroundProcessor';
import { createClient } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

export type RecordingStatus =
  | 'saved'        // Saved to localStorage (not yet uploaded)
  | 'uploading'    // Uploading to cloud storage
  | 'pending'      // Uploaded, waiting for AI processing
  | 'processing'   // AI pipeline running
  | 'processed'    // Fully processed (database status)
  | 'completed'    // Alias for processed (frontend display)
  | 'error';       // Processing failed

export interface Recording {
  id: string;
  tableId: string;
  duration: number;
  timestamp: number;
  status: RecordingStatus;
  audioData?: string;        // Base64 encoded audio (localStorage only)
  audioUrl?: string;         // Cloud storage URL (after upload)
  transcript?: string;       // Raw STT result
  correctedTranscript?: string;
  aiSummary?: string;
  sentiment?: 'positive' | 'neutral' | 'negative';
  sentimentScore?: number;
  errorMessage?: string;
}

const LOCAL_STORAGE_KEY = 'lingtin_recordings_local';
const MAX_LOCAL_RECORDINGS = 20;

// Generate UUID v4 format ID for database compatibility
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Helper: Get local-only recordings (not yet uploaded)
// Automatically resets stuck 'uploading' status to 'saved' for retry on page refresh
function getLocalRecordings(): Recording[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!stored) return [];

    const recordings: Recording[] = JSON.parse(stored);

    // Reset stuck 'uploading' status to 'saved' so they can be retried
    // This handles the case where page was refreshed during upload
    let hasStuckUploads = false;
    const fixed = recordings.map(r => {
      if (r.status === 'uploading' && r.audioData) {
        hasStuckUploads = true;
        console.log(`[RecordingStore] Resetting stuck upload: ${r.id} (${r.tableId})`);
        return { ...r, status: 'saved' as RecordingStatus };
      }
      return r;
    });

    // Save the fixed recordings back to localStorage
    if (hasStuckUploads) {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(fixed));
    }

    return fixed;
  } catch {
    return [];
  }
}

// Helper: Save local-only recordings with quota error handling
function saveLocalRecordings(recordings: Recording[]): void {
  if (typeof window === 'undefined') return;
  try {
    const trimmed = recordings.slice(0, MAX_LOCAL_RECORDINGS);
    // Remove audioData from completed recordings to save space
    const toSave = trimmed.map(r => {
      if (r.status === 'completed' || r.status === 'processed') {
        const { audioData, ...rest } = r;
        return rest;
      }
      return r;
    });
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(toSave));
  } catch (error) {
    // Handle QuotaExceededError by clearing old data
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      console.warn('[RecordingStore] localStorage quota exceeded, clearing old data');
      try {
        // Keep only the most recent 5 recordings without audioData
        const minimal = recordings.slice(0, 5).map(r => {
          const { audioData, ...rest } = r;
          return rest;
        });
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(minimal));
      } catch {
        // Last resort: clear all recordings
        localStorage.removeItem(LOCAL_STORAGE_KEY);
      }
    } else {
      console.error('[RecordingStore] Failed to save local recordings:', error);
    }
  }
}

// Helper: Convert Blob to Base64
async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Convert database record to Recording format
function dbRecordToRecording(dbRecord: {
  id: string;
  table_id: string;
  status: string;
  ai_summary?: string;
  sentiment_score?: number;
  audio_url?: string;
  corrected_transcript?: string;
  created_at: string;
}): Recording {
  return {
    id: dbRecord.id,
    tableId: dbRecord.table_id,
    duration: 0,
    timestamp: new Date(dbRecord.created_at).getTime(),
    status: dbRecord.status === 'processed' ? 'completed' : dbRecord.status as RecordingStatus,
    aiSummary: dbRecord.ai_summary,
    sentimentScore: dbRecord.sentiment_score,
    audioUrl: dbRecord.audio_url,
    correctedTranscript: dbRecord.corrected_transcript,
  };
}

export function useRecordingStore(restaurantId?: string, date?: string) {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Supabase client ref for Realtime subscription
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Fetch recordings from database on mount or when date changes
  useEffect(() => {
    const fetchFromDatabase = async () => {
      if (!restaurantId) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const dateParam = date ? `&date=${date}` : '';
        const response = await fetch(getApiUrl(`api/audio/today?restaurant_id=${restaurantId}${dateParam}`), {
          headers: getAuthHeaders(),
        });

        if (response.ok) {
          const { records } = await response.json();
          const dbRecordings = records.map(dbRecordToRecording);

          // Only merge local recordings for today (not historical views)
          if (!date) {
            const localRecs = getLocalRecordings();
            const localNotUploaded = localRecs.filter(
              r => r.status === 'saved' || r.status === 'uploading'
            );
            setRecordings([...localNotUploaded, ...dbRecordings]);
          } else {
            setRecordings(dbRecordings);
          }
        }
      } catch (error) {
        console.error('[RecordingStore] Failed to fetch from database:', error);
        if (!date) {
          setRecordings(getLocalRecordings());
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchFromDatabase();
  }, [restaurantId, date]);

  // Subscribe to Supabase Realtime for live updates when records change
  useEffect(() => {
    if (!restaurantId) return;

    // Check if Supabase environment variables are configured
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey || !supabaseUrl.startsWith('http')) {
      console.warn('[Realtime] Supabase not configured, skipping realtime subscription');
      return;
    }

    const supabase = createClient();

    // Subscribe to UPDATE events on lingtin_visit_records table
    const channel = supabase
      .channel('visit-records-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'lingtin_visit_records',
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        (payload) => {
          console.log('[Realtime] Record updated:', payload.new);
          const updatedRecord = payload.new as {
            id: string;
            table_id: string;
            status: string;
            ai_summary?: string;
            sentiment_score?: number;
            audio_url?: string;
            created_at: string;
          };

          // Update the recording in state
          setRecordings(prev =>
            prev.map(rec =>
              rec.id === updatedRecord.id
                ? dbRecordToRecording(updatedRecord)
                : rec
            )
          );
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'lingtin_visit_records',
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        (payload) => {
          console.log('[Realtime] New record inserted:', payload.new);
          const newRecord = payload.new as {
            id: string;
            table_id: string;
            status: string;
            ai_summary?: string;
            sentiment_score?: number;
            audio_url?: string;
            created_at: string;
          };

          // Add new record if not already in state (avoid duplicates)
          setRecordings(prev => {
            const exists = prev.some(rec => rec.id === newRecord.id);
            if (exists) {
              // Update existing record instead
              return prev.map(rec =>
                rec.id === newRecord.id
                  ? dbRecordToRecording(newRecord)
                  : rec
              );
            }
            // Add new record at the beginning
            return [dbRecordToRecording(newRecord), ...prev];
          });
        }
      )
      .subscribe((status) => {
        console.log('[Realtime] Subscription status:', status);
      });

    channelRef.current = channel;

    // Cleanup on unmount
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [restaurantId]);

  // Save a new recording (local first, before upload)
  const saveRecording = useCallback(async (
    tableId: string,
    duration: number,
    audioBlob: Blob
  ): Promise<Recording> => {
    const audioData = await blobToBase64(audioBlob);

    const newRecording: Recording = {
      id: generateUUID(),
      tableId,
      duration,
      timestamp: Date.now(),
      status: 'saved',
      audioData,
    };

    setRecordings(prev => {
      const updated = [newRecording, ...prev];
      // Save to local storage (only local recordings)
      const localRecs = updated.filter(r => r.status === 'saved' || r.status === 'uploading');
      saveLocalRecordings(localRecs);
      return updated;
    });

    return newRecording;
  }, []);

  // Update recording status (called during processing)
  const updateRecording = useCallback((
    id: string,
    updates: Partial<Recording>
  ) => {
    setRecordings(prev => {
      const updated = prev.map(rec =>
        rec.id === id ? { ...rec, ...updates } : rec
      );
      // Update local storage for local recordings
      const localRecs = updated.filter(r => r.status === 'saved' || r.status === 'uploading');
      saveLocalRecordings(localRecs);
      return updated;
    });
  }, []);

  // Get today's recordings
  const getTodayRecordings = useCallback(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return recordings.filter(rec => rec.timestamp >= today.getTime());
  }, [recordings]);

  // Delete a recording (cancels processing, calls API to delete from database)
  const deleteRecording = useCallback(async (id: string) => {
    // Cancel any ongoing processing for this recording
    cancelProcessing(id);

    // Optimistically remove from UI
    setRecordings(prev => {
      const updated = prev.filter(rec => rec.id !== id);
      const localRecs = updated.filter(r => r.status === 'saved' || r.status === 'uploading');
      saveLocalRecordings(localRecs);
      return updated;
    });

    // Call API to delete from database (if it's a database record)
    try {
      await fetch(getApiUrl(`api/audio/${id}`), {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
    } catch (error) {
      console.error('[RecordingStore] Failed to delete from database:', error);
    }
  }, []);

  // Get recordings that need retry (saved or uploading with audioData)
  const getRecordingsNeedingRetry = useCallback(() => {
    return recordings.filter(rec =>
      (rec.status === 'saved' || rec.status === 'uploading') && rec.audioData
    );
  }, [recordings]);

  return {
    recordings,
    isLoading,
    saveRecording,
    updateRecording,
    getTodayRecordings,
    deleteRecording,
    getRecordingsNeedingRetry,
  };
}
