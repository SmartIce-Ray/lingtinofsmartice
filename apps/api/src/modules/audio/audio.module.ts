// Audio Module - Handle recording uploads and AI processing
// v2.2 - Added DashScope STT service (Paraformer-v2)

import { Module } from '@nestjs/common';
import { AudioController } from './audio.controller';
import { AudioService } from './audio.service';
import { AiProcessingService } from './ai-processing.service';
import { XunfeiSttService } from './xunfei-stt.service';
import { DashScopeSttService } from './dashscope-stt.service';

@Module({
  controllers: [AudioController],
  providers: [AudioService, AiProcessingService, XunfeiSttService, DashScopeSttService],
  exports: [AudioService, AiProcessingService, XunfeiSttService, DashScopeSttService],
})
export class AudioModule {}
