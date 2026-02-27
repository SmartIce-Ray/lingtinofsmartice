// Audio Controller - API endpoints for recording
// v3.7 - Accept duration_seconds from upload FormData

import {
  Controller,
  Post,
  Get,
  Delete,
  Patch,
  Param,
  Query,
  Body,
  UploadedFile,
  UseInterceptors,
  Logger,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AudioService } from './audio.service';
import { AiProcessingService } from './ai-processing.service';

// Multer config: 10MB max file size, memory storage
const multerOptions = {
  storage: memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
};

@Controller('audio')
export class AudioController {
  private readonly logger = new Logger(AudioController.name);

  constructor(
    private readonly audioService: AudioService,
    private readonly aiProcessingService: AiProcessingService,
  ) {}

  // POST /api/audio/upload
  @Post('upload')
  @UseInterceptors(FileInterceptor('file', multerOptions))
  async uploadAudio(
    @UploadedFile() file: Express.Multer.File,
    @Body('table_id') tableId: string,
    @Body('restaurant_id') restaurantId: string,
    @Body('recording_id') recordingId?: string,
    @Body('employee_id') employeeId?: string,
    @Body('duration_seconds') durationSeconds?: string,
  ) {
    this.logger.log(`▶ POST /audio/upload`);
    this.logger.log(`  Table: ${tableId} | Recording: ${recordingId}`);
    this.logger.log(`  Restaurant: ${restaurantId}`);

    // Validate required fields
    if (!file) {
      this.logger.error('Upload failed: No file provided');
      throw new BadRequestException('No file provided');
    }

    if (!tableId) {
      this.logger.error('Upload failed: No table_id provided');
      throw new BadRequestException('table_id is required');
    }

    if (!restaurantId) {
      this.logger.error('Upload failed: No restaurant_id provided');
      throw new BadRequestException('restaurant_id is required');
    }

    this.logger.log(`  File: ${file.originalname} (${file.size} bytes, ${file.mimetype})`);

    const result = await this.audioService.uploadAndProcess(
      file,
      tableId,
      restaurantId,
      employeeId,
      recordingId,
      durationSeconds ? parseInt(durationSeconds, 10) : undefined,
    );

    this.logger.log(`◀ Upload complete: ${result.audioUrl}`);
    return result;
  }

  // POST /api/audio/process - Trigger AI pipeline
  @Post('process')
  async processAudio(
    @Body('recording_id') recordingId: string,
    @Body('audio_url') audioUrl: string,
    @Body('table_id') tableId: string,
    @Body('restaurant_id') restaurantId: string,
  ) {
    this.logger.log(`▶ POST /audio/process`);
    this.logger.log(`  Recording: ${recordingId} | Table: ${tableId}`);
    this.logger.log(`  Audio URL: ${audioUrl}`);

    try {
      const result = await this.aiProcessingService.processAudio(
        recordingId,
        audioUrl,
        tableId,
        restaurantId,
      );

      this.logger.log(`◀ Process complete: score=${result.sentimentScore}, feedbacks=${result.feedbacks.length}`);

      return {
        success: true,
        transcript: result.transcript,
        correctedTranscript: result.correctedTranscript,
        aiSummary: result.aiSummary,
        sentimentScore: result.sentimentScore,
        feedbacks: result.feedbacks,
        managerQuestions: result.managerQuestions,
        customerAnswers: result.customerAnswers,
      };
    } catch (error) {
      // Handle duplicate processing as warning (409 Conflict), not error
      if (error instanceof Error && error.message.includes('already')) {
        this.logger.warn(`◀ Duplicate request: ${error.message}`);
        throw new ConflictException(error.message);
      }
      throw error;
    }
  }

  // GET /api/audio/status/:visit_id
  @Get('status/:visitId')
  async getStatus(@Param('visitId') visitId: string) {
    this.logger.log(`▶ GET /audio/status/${visitId}`);
    return this.audioService.getProcessingStatus(visitId);
  }

  // GET /api/audio/pending - Get pending records for recovery
  @Get('pending')
  async getPendingRecords() {
    this.logger.log(`▶ GET /audio/pending`);
    const records = await this.audioService.getPendingRecords();
    this.logger.log(`◀ Found ${records.length} pending records`);
    return { records };
  }

  // GET /api/audio/today - Get recordings for a restaurant (supports date param)
  @Get('today')
  async getTodayRecordings(
    @Query('restaurant_id') restaurantId: string,
    @Query('date') date?: string,
  ) {
    this.logger.log(`▶ GET /audio/today?restaurant_id=${restaurantId}&date=${date || 'today'}`);
    const records = await this.audioService.getTodayRecordings(restaurantId, date);
    this.logger.log(`◀ Found ${records.length} recordings`);
    return { records };
  }

  // DELETE /api/audio/:visitId - Delete a recording
  @Delete(':visitId')
  async deleteRecording(@Param('visitId') visitId: string) {
    this.logger.log(`▶ DELETE /audio/${visitId}`);
    await this.audioService.deleteRecording(visitId);
    this.logger.log(`◀ Deleted recording ${visitId}`);
    return { success: true };
  }

  // PATCH /api/audio/:visitId/status - Update recording status (for error recovery)
  @Patch(':visitId/status')
  async updateStatus(
    @Param('visitId') visitId: string,
    @Body('status') status: string,
    @Body('error_message') errorMessage?: string,
  ) {
    this.logger.log(`▶ PATCH /audio/${visitId}/status → ${status}`);
    await this.audioService.updateRecordingStatus(visitId, status, errorMessage);
    this.logger.log(`◀ Status updated to ${status}`);
    return { success: true };
  }

  // POST /api/audio/reanalyze-batch - Re-run AI analysis on historical records (skip STT)
  // Note: with large limits, this can run for several minutes. Keep limit ≤ 20 for production use.
  @Post('reanalyze-batch')
  async reanalyzeBatch(
    @Body('limit') limit?: number,
    @Body('cutoff_date') cutoffDate?: string,
  ) {
    if (cutoffDate && !/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?Z?)?$/.test(cutoffDate)) {
      throw new BadRequestException('cutoff_date must be a valid ISO date string');
    }
    const batchLimit = Math.min(Math.max(limit || 20, 1), 100);
    const cutoff = cutoffDate || new Date().toISOString();

    this.logger.log(`▶ POST /audio/reanalyze-batch (limit=${batchLimit}, cutoff=${cutoff})`);

    const result = await this.aiProcessingService.reanalyzeBatch(batchLimit, cutoff);

    this.logger.log(`◀ Reanalyze batch: ${result.processed}/${result.total} ok, ${result.failed} failed`);

    return {
      data: result,
      message: `Reanalyzed ${result.processed}/${result.total} records (${result.failed} failed)`,
    };
  }
}
