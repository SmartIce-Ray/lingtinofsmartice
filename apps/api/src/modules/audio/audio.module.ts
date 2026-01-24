// Audio Module - Handle recording uploads and AI processing
// v2.1 - Added 讯飞 STT service

import { Module } from '@nestjs/common';
import { AudioController } from './audio.controller';
import { AudioService } from './audio.service';
import { AiProcessingService } from './ai-processing.service';
import { XunfeiSttService } from './xunfei-stt.service';

@Module({
  controllers: [AudioController],
  providers: [AudioService, AiProcessingService, XunfeiSttService],
  exports: [AudioService, AiProcessingService, XunfeiSttService],
})
export class AudioModule {}
