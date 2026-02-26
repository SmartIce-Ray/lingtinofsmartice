// Feedback Controller - API endpoints for employee product feedback
// Supports: submit text/voice, process (STT + AI classify), query, status update, reply

import {
  Controller,
  Post,
  Get,
  Patch,
  Param,
  Query,
  Body,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { FeedbackService } from './feedback.service';
import { FeedbackAiService } from './feedback-ai.service';
import { XunfeiSttService } from '../audio/xunfei-stt.service';
import { DashScopeSttService } from '../audio/dashscope-stt.service';

const multerOptions = {
  storage: memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB max for feedback recordings
};

const imageMulterOptions = {
  storage: memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB per image
};

@Controller('feedback')
export class FeedbackController {
  private readonly logger = new Logger(FeedbackController.name);

  constructor(
    private readonly feedbackService: FeedbackService,
    private readonly feedbackAi: FeedbackAiService,
    private readonly xunfeiStt: XunfeiSttService,
    private readonly dashScopeStt: DashScopeSttService,
  ) {}

  // POST /api/feedback/upload-images - Upload up to 3 images, returns URLs
  @Post('upload-images')
  @UseInterceptors(FilesInterceptor('files', 3, imageMulterOptions))
  async uploadImages(
    @UploadedFiles() files: Express.Multer.File[],
    @Body('restaurant_id') restaurantId: string,
  ) {
    this.logger.log(`▶ POST /feedback/upload-images (${files?.length || 0} files)`);

    if (!files || files.length === 0) {
      throw new BadRequestException('No files provided');
    }
    if (!restaurantId) {
      throw new BadRequestException('restaurant_id is required');
    }

    const urls = await this.feedbackService.uploadImages(files, restaurantId);
    this.logger.log(`◀ Uploaded ${urls.length} images`);
    return { data: urls };
  }

  // POST /api/feedback/submit - Submit text feedback with AI classification
  @Post('submit')
  async submitText(
    @Body('restaurant_id') restaurantId: string,
    @Body('employee_id') employeeId: string,
    @Body('content_text') contentText: string,
    @Body('image_urls') imageUrls?: string[],
  ) {
    this.logger.log(`▶ POST /feedback/submit`);

    if (!restaurantId || !employeeId) {
      throw new BadRequestException('restaurant_id and employee_id are required');
    }
    if (!contentText || contentText.trim().length === 0) {
      throw new BadRequestException('content_text is required');
    }

    // AI classification
    let classification = { category: 'other', ai_summary: '', priority: 'medium', tags: [] as string[] };
    try {
      classification = await this.feedbackAi.classify(contentText);
      this.logger.log(`  AI分类: ${classification.category} | ${classification.priority}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`AI classification failed (non-fatal): ${msg}`);
    }

    const data = await this.feedbackService.createTextFeedback(
      restaurantId,
      employeeId,
      contentText.trim(),
      imageUrls || [],
      classification,
    );

    this.logger.log(`◀ Feedback created: ${data.id}`);
    return { data, message: '反馈已提交' };
  }

  // POST /api/feedback/submit-voice - Upload voice feedback
  @Post('submit-voice')
  @UseInterceptors(FileInterceptor('file', multerOptions))
  async submitVoice(
    @UploadedFile() file: Express.Multer.File,
    @Body('restaurant_id') restaurantId: string,
    @Body('employee_id') employeeId: string,
    @Body('duration_seconds') durationSeconds?: string,
    @Body('image_urls') imageUrlsStr?: string,
  ) {
    this.logger.log(`▶ POST /feedback/submit-voice`);

    if (!file) {
      throw new BadRequestException('No file provided');
    }
    if (!restaurantId || !employeeId) {
      throw new BadRequestException('restaurant_id and employee_id are required');
    }

    let imageUrls: string[] = [];
    if (imageUrlsStr) {
      try {
        imageUrls = JSON.parse(imageUrlsStr);
      } catch {
        // ignore
      }
    }

    const data = await this.feedbackService.createVoiceFeedback(
      file,
      restaurantId,
      employeeId,
      durationSeconds ? parseInt(durationSeconds, 10) : undefined,
      imageUrls,
    );

    this.logger.log(`◀ Voice feedback uploaded: ${data.id}`);
    return { data, message: '语音反馈已上传' };
  }

  // POST /api/feedback/:id/process - Trigger STT + AI classification for voice feedback
  @Post(':id/process')
  async processFeedback(
    @Param('id') id: string,
    @Body('audio_url') audioUrl: string,
  ) {
    this.logger.log(`▶ POST /feedback/${id}/process`);

    if (!audioUrl) {
      throw new BadRequestException('audio_url is required');
    }

    await this.feedbackService.updateSttStatus(id, 'processing');

    try {
      // STT: DashScope first, fallback to 讯飞
      let transcript: string;
      if (this.dashScopeStt.isConfigured()) {
        try {
          transcript = await this.dashScopeStt.transcribe(audioUrl, 1, 120000);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.warn(`DashScope STT failed, falling back to 讯飞: ${msg}`);
          transcript = await this.xunfeiStt.transcribe(audioUrl, 120000);
        }
      } else {
        transcript = await this.xunfeiStt.transcribe(audioUrl, 120000);
      }

      this.logger.log(`  STT完成: ${transcript.length}字`);

      if (!transcript || transcript.trim().length === 0) {
        await this.feedbackService.updateSttStatus(id, 'completed');
        return { data: { id, transcript: '', category: 'other' }, message: '无法识别语音内容' };
      }

      // AI classification
      let classification = { category: 'other', ai_summary: '', priority: 'medium', tags: [] as string[] };
      try {
        classification = await this.feedbackAi.classify(transcript);
        this.logger.log(`  AI分类: ${classification.category} | ${classification.priority}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`AI classification failed (non-fatal): ${msg}`);
      }

      const data = await this.feedbackService.processFeedback(id, transcript, classification);
      this.logger.log(`◀ Process complete: ${data.id}`);
      return { data, message: '处理完成' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Process failed: ${msg}`);
      await this.feedbackService.updateSttStatus(id, 'error', msg);
      throw err;
    }
  }

  // GET /api/feedback/mine - Get my feedback
  @Get('mine')
  async getMyFeedback(@Query('employee_id') employeeId: string) {
    this.logger.log(`▶ GET /feedback/mine?employee_id=${employeeId}`);

    if (!employeeId) {
      throw new BadRequestException('employee_id is required');
    }

    const data = await this.feedbackService.getMyFeedback(employeeId);
    this.logger.log(`◀ Found ${data.length} feedbacks`);
    return { data };
  }

  // GET /api/feedback/all - Get all feedback (admin)
  @Get('all')
  async getAllFeedback(
    @Query('status') status?: string,
    @Query('category') category?: string,
  ) {
    this.logger.log(`▶ GET /feedback/all?status=${status || 'all'}&category=${category || 'all'}`);

    const data = await this.feedbackService.getAllFeedback({ status, category });
    this.logger.log(`◀ Found ${data.length} feedbacks`);
    return { data };
  }

  // PATCH /api/feedback/:id/status - Update status (admin)
  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body('status') status: string,
    @Body('changed_by') changedBy: string,
  ) {
    this.logger.log(`▶ PATCH /feedback/${id}/status → ${status}`);

    if (!status) {
      throw new BadRequestException('status is required');
    }
    if (!changedBy) {
      throw new BadRequestException('changed_by is required');
    }

    const data = await this.feedbackService.updateStatus(id, status, changedBy);
    this.logger.log(`◀ Status updated to ${status}`);
    return { data, message: '状态已更新' };
  }

  // POST /api/feedback/:id/reply - Reply to feedback (admin)
  @Post(':id/reply')
  async replyToFeedback(
    @Param('id') id: string,
    @Body('reply') reply: string,
    @Body('reply_by') replyBy: string,
  ) {
    this.logger.log(`▶ POST /feedback/${id}/reply`);

    if (!reply || reply.trim().length === 0) {
      throw new BadRequestException('reply is required');
    }
    if (!replyBy) {
      throw new BadRequestException('reply_by is required');
    }

    const data = await this.feedbackService.replyToFeedback(id, reply.trim(), replyBy);
    this.logger.log(`◀ Reply saved`);
    return { data, message: '回复已发送' };
  }
}
