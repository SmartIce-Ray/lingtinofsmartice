// Background Processor - Handles async upload and AI pipeline
// v1.8 - Changed: Direct backend API calls (removed Next.js proxy layer)

import { Recording, RecordingStatus } from '@/hooks/useRecordingStore';
import { getAuthHeaders } from '@/contexts/AuthContext';
import { getApiUrl } from '@/lib/api';

interface ProcessingCallbacks {
  onStatusChange: (id: string, status: RecordingStatus, data?: Partial<Recording>) => void;
  onError: (id: string, error: string) => void;
}

// Timeout constants
const UPLOAD_TIMEOUT_MS = 30000;   // 30 seconds for upload
const PROCESS_TIMEOUT_MS = 120000; // 2 minutes for AI processing
const MAX_RETRY_ATTEMPTS = 3;      // Maximum retry attempts
const RETRY_DELAY_MS = 2000;       // Delay between retries

// Logger prefix for easy filtering
const LOG_PREFIX = '[Lingtin Pipeline]';

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
  const { id, tableId, audioData } = recording;
  const startTime = Date.now();
  const authHeaders = getAuthHeaders();

  // Create AbortController for this processing session
  const abortController = new AbortController();
  activeProcessing.set(id, abortController);

  log(`Starting pipeline for recording ${id} (table: ${tableId})`);

  if (!audioData) {
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

    // Step 1: Upload to cloud storage
    log(`[Step 1/3] Uploading audio to cloud storage...`);
    callbacks.onStatusChange(id, 'uploading');

    const audioBlob = base64ToBlob(audioData);
    log(`Audio blob created: ${(audioBlob.size / 1024).toFixed(1)} KB`);

    const formData = new FormData();
    formData.append('file', audioBlob, `${tableId}_${Date.now()}.webm`);
    formData.append('table_id', tableId);
    formData.append('recording_id', id);
    if (restaurantId) {
      formData.append('restaurant_id', restaurantId);
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
      throw new Error(`上传失败: ${uploadResponse.status}`);
    }

    const uploadResult = await uploadResponse.json();
    log(`[Step 1/3] Upload complete in ${Date.now() - uploadStartTime}ms`, uploadResult);

    // Check if cancelled after upload
    if (abortController.signal.aborted) {
      log(`Processing cancelled after upload: ${id}`);
      return;
    }

    // Step 2: Trigger AI pipeline processing with retry logic
    log(`[Step 2/3] Starting AI processing (STT + Gemini)...`);
    callbacks.onStatusChange(id, 'processing', {
      audioUrl: uploadResult.audioUrl,
    });

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
            recording_id: uploadResult.visit_id,
            audio_url: uploadResult.audioUrl,
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
