// Feedback Module - Employee product feedback with AI classification

import { Module } from '@nestjs/common';
import { AudioModule } from '../audio/audio.module';
import { FeedbackController } from './feedback.controller';
import { FeedbackService } from './feedback.service';
import { FeedbackAiService } from './feedback-ai.service';

@Module({
  imports: [AudioModule],
  controllers: [FeedbackController],
  providers: [FeedbackService, FeedbackAiService],
})
export class FeedbackModule {}
