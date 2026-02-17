// Meeting Module - Handle meeting recordings and AI minutes generation

import { Module } from '@nestjs/common';
import { AudioModule } from '../audio/audio.module';
import { MeetingController } from './meeting.controller';
import { MeetingService } from './meeting.service';
import { MeetingAiProcessingService } from './meeting-ai-processing.service';

@Module({
  imports: [AudioModule],
  controllers: [MeetingController],
  providers: [MeetingService, MeetingAiProcessingService],
})
export class MeetingModule {}
