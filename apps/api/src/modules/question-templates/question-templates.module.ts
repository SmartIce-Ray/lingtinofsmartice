// Question Templates Module - Configurable questionnaire prompts for store visits
// v1.0

import { Module } from '@nestjs/common';
import { QuestionTemplatesController } from './question-templates.controller';
import { QuestionTemplatesService } from './question-templates.service';

@Module({
  controllers: [QuestionTemplatesController],
  providers: [QuestionTemplatesService],
})
export class QuestionTemplatesModule {}
