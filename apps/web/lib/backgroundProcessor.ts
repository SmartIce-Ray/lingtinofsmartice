// Background Processor - Handles async upload and AI pipeline
// v2.4 - Send duration_seconds in upload FormData for database persistence
//
// NOTE: Current architecture uploads via backend proxy (frontend → backend → Supabase).
// If upload reliability becomes a problem, consider switching to frontend direct upload
// with TUS resumable protocol:
//
// 1. Supabase Storage natively supports TUS: https://supabase.com/docs/guides/storage/uploads/resumable-uploads
// 2. Use tus-js-client for resumable uploads with automatic retry
// 3. Endpoint: https://{projectId}.storage.supabase.co/storage/v1/upload/resumable
// 4. Chunk size must be 6MB, supports findPreviousUploads() for resume after refresh
// 5. After upload, call backend /api/audio/process to trigger AI pipeline
//
// Example:
//   const upload = new tus.Upload(audioBlob, {
//     endpoint: `https://${projectId}.storage.supabase.co/storage/v1/upload/resumable`,
//     retryDelays: [0, 3000, 5000, 10000, 20000],
//     headers: { authorization: `Bearer ${token}` },
//     metadata: { bucketName: 'lingtin', objectName: `recordings/${path}` },
//   });
//   upload.findPreviousUploads().then(prev => { if (prev.length) upload.resumeFromPreviousUpload(prev[0]); upload.start(); });

import { Recording, RecordingStatus } from '@/hooks/useRecordingStore';
import { getAuthHeaders } from '@/contexts/AuthContext';
import { getApiUrl } from '@/lib/api';

interface ProcessingCallbacks {
  onStatusChange: (id: string, status: RecordingStatus, data?: Partial<Recording>) => void;
  onError: (id: string, error: string) => void;
}

// Timeout constants
const UPLOAD_TIMEOUT_MS = 60000;   // 60 seconds for upload (mobile files are larger)
const PROCESS_TIMEOUT_MS = 120000; // 2 minutes for AI processing
const MAX_RETRY_ATTEMPTS = 3;      // Maximum retry attempts
const RETRY_DELAY_MS = 2000;       // Delay between retries

// Logger prefix for easy filtering
const LOG_PREFIX = '[Lingtin Pipeline]';

// Handle 401 auth expired: clear stored credentials and redirect to login
function handleAuthExpired() {
  log('Auth expired (401), clearing credentials and redirecting to login');
  localStorage.removeItem('lingtin_auth_token');
  localStorage.removeItem('lingtin_auth_user');
  if (typeof window !== 'undefined') {
    window.location.href = '/login';
  }
}

// Track active processing requests for cancellation
const activeProcessing = new Map<string, AbortController>();

function log(message: string, data?: unknown) {
  console.log(`${LOG_PREFIX} ${message}`, data || '');
}

function logError(message: string, error?: unknown) {
  console.error(`${LOG_PREFIX} ERROR: ${message}`, error || '');
}

// Cancel processing for a specific recording
export function cancelProcessing(recordingId: string): boolean {
  const controller = activeProcessing.get(recordingId);
  if (controller) {
    log(`Cancelling processing for ${recordingId}`);
    controller.abort();
    activeProcessing.delete(recordingId);
    return true;
  }
  return false;
}

// Fetch with timeout and cancellation support
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
  abortController?: AbortController
): Promise<Response> {
  const controller = abortController || new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Convert base64 to Blob
function base64ToBlob(base64: string): Blob {
  const parts = base64.split(';base64,');
  const contentType = parts[0].split(':')[1];
  const raw = window.atob(parts[1]);
  const rawLength = raw.length;
  const uInt8Array = new Uint8Array(rawLength);

  for (let i = 0; i < rawLength; ++i) {
    uInt8Array[i] = raw.charCodeAt(i);
  }

  return new Blob([uInt8Array], { type: contentType });
}

export async function processRecordingInBackground(
  recording: Recording,
  callbacks: ProcessingCallbacks,
  restaurantId?: string
) {
  const { id, tableId, duration, audioData, audioUrl: existingAudioUrl } = recording;
  const startTime = Date.now();
  const authHeaders = getAuthHeaders();

  // Create AbortController for this processing session
  const abortController = new AbortController();
  activeProcessing.set(id, abortController);

  log(`Starting pipeline for recording ${id} (table: ${tableId})`);

  // Check if we have either audioData (for upload) or audioUrl (already uploaded)
  if (!audioData && !existingAudioUrl) {
    logError(`Recording ${id} has no audio data`);
    callbacks.onError(id, '录音数据丢失');
    activeProcessing.delete(id);
    return;
  }

  try {
    // Check if already cancelled
    if (abortController.signal.aborted) {
      log(`Processing cancelled before start: ${id}`);
      return;
    }

    let audioUrl: string;
    let visitId: string = id;

    // If we already have audioUrl, skip upload and go directly to AI processing
    if (existingAudioUrl) {
      log(`[Step 1/3] Audio already uploaded, skipping upload step`);
      audioUrl = existingAudioUrl;
      callbacks.onStatusChange(id, 'processing', { audioUrl });
    } else {
      // Step 1: Upload to cloud storage
      log(`[Step 1/3] Uploading audio to cloud storage...`);
      callbacks.onStatusChange(id, 'uploading');

      const audioBlob = base64ToBlob(audioData!);
      log(`Audio blob created: ${(audioBlob.size / 1024).toFixed(1)} KB, type: ${audioBlob.type}`);

      // Use correct file extension based on actual MIME type (mobile Safari uses mp4)
      const ext = audioBlob.type.includes('mp4') ? 'mp4' : 'webm';
      const formData = new FormData();
      formData.append('file', audioBlob, `${tableId}_${Date.now()}.${ext}`);
      formData.append('table_id', tableId);
      formData.append('recording_id', id);
      if (restaurantId) {
        formData.append('restaurant_id', restaurantId);
      }
      if (duration > 0) {
        formData.append('duration_seconds', String(Math.round(duration)));
      }

      const uploadStartTime = Date.now();
      const uploadResponse = await fetchWithTimeout(getApiUrl('api/audio/upload'), {
        method: 'POST',
        headers: authHeaders,
        body: formData,
      }, UPLOAD_TIMEOUT_MS, abortController);

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        logError(`Upload failed: ${uploadResponse.status}`, errorText);
        // 401 = token expired/invalid, redirect to login
        if (uploadResponse.status === 401) {
          handleAuthExpired();
          throw new Error('登录已过期，请重新登录');
        }
        throw new Error(`上传失败: ${uploadResponse.status}`);
      }

      const uploadResult = await uploadResponse.json();
      log(`[Step 1/3] Upload complete in ${Date.now() - uploadStartTime}ms`, uploadResult);
      audioUrl = uploadResult.audioUrl;
      visitId = uploadResult.visit_id;

      // Check if cancelled after upload
      if (abortController.signal.aborted) {
        log(`Processing cancelled after upload: ${id}`);
        return;
      }

      // Update status to processing with audioUrl
      callbacks.onStatusChange(id, 'processing', { audioUrl });
    }

    // Step 2: Trigger AI pipeline processing with retry logic
    log(`[Step 2/3] Starting AI processing (STT + Gemini)...`);

    let processResult = null;
    let lastError: Error | null = null;

    // Retry loop for AI processing
    for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
      // Check if cancelled before each attempt
      if (abortController.signal.aborted) {
        log(`Processing cancelled during retry: ${id}`);
        return;
      }

      try {
        log(`[Step 2/3] AI processing attempt ${attempt}/${MAX_RETRY_ATTEMPTS}...`);
        const processStartTime = Date.now();

        const processResponse = await fetchWithTimeout(getApiUrl('api/audio/process'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({
            recording_id: visitId,
            audio_url: audioUrl,
            table_id: tableId,
            restaurant_id: restaurantId,
          }),
        }, PROCESS_TIMEOUT_MS, abortController);

        if (!processResponse.ok) {
          const errorText = await processResponse.text();
          logError(`AI processing failed (attempt ${attempt}): ${processResponse.status}`, errorText);
          // Try to parse error message from response
          let errorMsg = `处理失败: ${processResponse.status}`;
          try {
            const errorJson = JSON.parse(errorText);
            if (errorJson.message) {
              errorMsg = errorJson.message;
            }
          } catch {
            // Use default error message
          }
          throw new Error(errorMsg);
        }

        processResult = await processResponse.json();
        log(`[Step 2/3] AI processing complete in ${Date.now() - processStartTime}ms`, processResult);
        break; // Success, exit retry loop

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on cancellation
        if (lastError.name === 'AbortError') {
          throw lastError;
        }

        if (attempt < MAX_RETRY_ATTEMPTS) {
          log(`[Step 2/3] Attempt ${attempt} failed, retrying in ${RETRY_DELAY_MS}ms...`);
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
        } else {
          log(`[Step 2/3] All ${MAX_RETRY_ATTEMPTS} attempts failed`);
        }
      }
    }

    // If all retries failed, throw the last error
    if (!processResult && lastError) {
      throw lastError;
    }

    // Step 3: Update with results
    log(`[Step 3/3] Updating UI with results...`);
    callbacks.onStatusChange(id, 'completed', {
      transcript: processResult.transcript,
      correctedTranscript: processResult.correctedTranscript,
      aiSummary: processResult.aiSummary,
      sentiment: processResult.sentiment,
      sentimentScore: processResult.sentimentScore,
    });

    const totalTime = Date.now() - startTime;
    log(`Pipeline complete! Total time: ${totalTime}ms`, {
      id,
      tableId,
      sentiment: processResult.sentiment,
      summary: processResult.aiSummary,
    });

  } catch (error) {
    // Check if this was a cancellation
    if (error instanceof Error && error.name === 'AbortError') {
      log(`Processing cancelled for ${id}`);
      return;
    }

    let message = '处理失败';
    if (error instanceof Error) {
      message = error.message;
    }
    logError(`Pipeline failed for ${id}`, error);

    // Check if the error indicates the recording was already processed
    // In this case, treat it as success, not error
    const isAlreadyProcessed = message.includes('already processed') ||
                                message.includes('already processing') ||
                                message.includes('Recording already');

    if (isAlreadyProcessed) {
      log(`Recording ${id} was already processed, treating as success`);
      callbacks.onStatusChange(id, 'completed', {});
      return;
    }

    // Update database status to 'error' for recovery after page refresh
    try {
      await fetchWithTimeout(getApiUrl(`api/audio/${id}/status`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          status: 'error',
          error_message: message,
        }),
      }, 5000);
      log(`Database status updated to error for ${id}`);
    } catch (updateError) {
      logError(`Failed to update error status in database for ${id}`, updateError);
    }

    callbacks.onError(id, message);
    callbacks.onStatusChange(id, 'error', { errorMessage: message });
  } finally {
    // Clean up the tracking
    activeProcessing.delete(id);
  }
}

// Batch processor for retrying failed recordings
export async function retryFailedRecordings(
  recordings: Recording[],
  callbacks: ProcessingCallbacks
) {
  const failed = recordings.filter(r => r.status === 'error');
  log(`Retrying ${failed.length} failed recordings`);

  for (const recording of failed) {
    await processRecordingInBackground(recording, callbacks);
  }
}

// Retry pending records from database (for recovery after page refresh)
// This fetches records that have audio_url but are still in 'pending' status
export async function retryPendingFromDatabase(
  onProgress?: (message: string) => void
): Promise<{ processed: number; failed: number }> {
  log('Checking for pending records in database...');

  let processed = 0;
  let failed = 0;
  const authHeaders = getAuthHeaders();

  try {
    // Fetch pending records from API
    const response = await fetchWithTimeout(getApiUrl('api/audio/pending'), {
      headers: authHeaders,
    }, UPLOAD_TIMEOUT_MS);

    if (!response.ok) {
      logError(`Failed to fetch pending records: ${response.status}`);
      return { processed: 0, failed: 0 };
    }

    const { records } = await response.json();

    if (!records || records.length === 0) {
      log('No pending records found');
      return { processed: 0, failed: 0 };
    }

    log(`Found ${records.length} pending records to process`);
    onProgress?.(`发现 ${records.length} 条待处理录音`);

    // Process each pending record
    for (const record of records) {
      try {
        log(`Processing pending record: ${record.id} (table: ${record.table_id})`);
        onProgress?.(`正在处理 ${record.table_id} 桌录音...`);

        const processResponse = await fetchWithTimeout(getApiUrl('api/audio/process'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({
            recording_id: record.id,
            audio_url: record.audio_url,
            table_id: record.table_id,
            restaurant_id: record.restaurant_id,
          }),
        }, PROCESS_TIMEOUT_MS);

        if (processResponse.ok) {
          log(`Successfully processed: ${record.id}`);
          processed++;
        } else {
          const errorText = await processResponse.text();
          logError(`Failed to process ${record.id}`, errorText);
          failed++;
        }
      } catch (error) {
        logError(`Error processing ${record.id}`, error);
        failed++;
      }
    }

    log(`Pending recovery complete: ${processed} processed, ${failed} failed`);
    if (processed > 0) {
      onProgress?.(`已完成 ${processed} 条录音处理`);
    }

    return { processed, failed };
  } catch (error) {
    logError('Failed to retry pending records', error);
    return { processed: 0, failed: 0 };
  }
}
