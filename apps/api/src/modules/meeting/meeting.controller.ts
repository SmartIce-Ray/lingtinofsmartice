// Meeting Controller - API endpoints for meeting recordings
// Supports: upload, process (STT + AI minutes), query, delete, status update

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
import { MeetingService } from './meeting.service';
import { MeetingAiProcessingService } from './meeting-ai-processing.service';

// 50MB max for meeting recordings (up to 30 min)
const multerOptions = {
  storage: memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024,
  },
};

@Controller('meeting')
export class MeetingController {
  private readonly logger = new Logger(MeetingController.name);

  constructor(
    private readonly meetingService: MeetingService,
    private readonly meetingAiService: MeetingAiProcessingService,
  ) {}

  // POST /api/meeting/upload
  @Post('upload')
  @UseInterceptors(FileInterceptor('file', multerOptions))
  async uploadMeeting(
    @UploadedFile() file: Express.Multer.File,
    @Body('meeting_type') meetingType: string,
    @Body('restaurant_id') restaurantId: string,
    @Body('recording_id') recordingId?: string,
    @Body('employee_id') employeeId?: string,
    @Body('duration_seconds') durationSeconds?: string,
  ) {
    this.logger.log(`▶ POST /meeting/upload`);
    this.logger.log(`  Type: ${meetingType} | Recording: ${recordingId}`);

    if (!file) {
      throw new BadRequestException('No file provided');
    }
    const VALID_MEETING_TYPES = ['pre_meal', 'daily_review', 'weekly'];
    if (!meetingType || !VALID_MEETING_TYPES.includes(meetingType)) {
      throw new BadRequestException('meeting_type must be one of: pre_meal, daily_review, weekly');
    }
    if (!restaurantId) {
      throw new BadRequestException('restaurant_id is required');
    }

    this.logger.log(`  File: ${file.originalname} (${file.size} bytes, ${file.mimetype})`);

    const result = await this.meetingService.uploadMeeting(
      file,
      meetingType,
      restaurantId,
      employeeId,
      recordingId,
      durationSeconds ? parseInt(durationSeconds, 10) : undefined,
    );

    this.logger.log(`◀ Upload complete: ${result.audioUrl}`);
    return result;
  }

  // POST /api/meeting/process - Trigger STT + AI minutes generation
  @Post('process')
  async processMeeting(
    @Body('recording_id') recordingId: string,
    @Body('audio_url') audioUrl: string,
    @Body('meeting_type') meetingType: string,
    @Body('restaurant_id') restaurantId: string,
  ) {
    this.logger.log(`▶ POST /meeting/process`);
    this.logger.log(`  Recording: ${recordingId} | Type: ${meetingType}`);

    try {
      const result = await this.meetingAiService.processMeeting(
        recordingId,
        audioUrl,
        meetingType,
        restaurantId,
      );

      this.logger.log(`◀ Process complete: actions=${result.actionItems.length}`);

      return {
        success: true,
        transcript: result.transcript,
        aiSummary: result.aiSummary,
        actionItems: result.actionItems,
        keyDecisions: result.keyDecisions,
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('already')) {
        this.logger.warn(`◀ Duplicate request: ${error.message}`);
        throw new ConflictException(error.message);
      }
      throw error;
    }
  }

  // GET /api/meeting/today - Query by restaurant_id + date
  @Get('today')
  async getTodayMeetings(
    @Query('restaurant_id') restaurantId: string,
    @Query('date') date?: string,
  ) {
    this.logger.log(`▶ GET /meeting/today?restaurant_id=${restaurantId}&date=${date || 'today'}`);
    const records = await this.meetingService.getTodayMeetings(restaurantId, date);
    this.logger.log(`◀ Found ${records.length} meetings`);
    return { records };
  }

  // GET /api/meeting/pending - Get pending records for recovery
  @Get('pending')
  async getPendingMeetings(@Query('restaurant_id') restaurantId?: string) {
    this.logger.log(`▶ GET /meeting/pending?restaurant_id=${restaurantId || 'all'}`);
    const records = await this.meetingService.getPendingMeetings(restaurantId);
    this.logger.log(`◀ Found ${records.length} pending meetings`);
    return { records };
  }

  // DELETE /api/meeting/:id
  @Delete(':id')
  async deleteMeeting(@Param('id') id: string) {
    this.logger.log(`▶ DELETE /meeting/${id}`);
    await this.meetingService.deleteMeeting(id);
    this.logger.log(`◀ Deleted meeting ${id}`);
    return { success: true };
  }

  // PATCH /api/meeting/:id/status - Update status (for error recovery)
  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body('status') status: string,
    @Body('error_message') errorMessage?: string,
  ) {
    const VALID_STATUSES = ['pending', 'processing', 'processed', 'error'];
    if (!status || !VALID_STATUSES.includes(status)) {
      throw new BadRequestException('status must be one of: pending, processing, processed, error');
    }
    this.logger.log(`▶ PATCH /meeting/${id}/status → ${status}`);
    await this.meetingService.updateMeetingStatus(id, status, errorMessage);
    this.logger.log(`◀ Status updated to ${status}`);
    return { success: true };
  }
}
