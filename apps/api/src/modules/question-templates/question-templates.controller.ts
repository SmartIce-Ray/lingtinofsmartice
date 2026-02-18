// Question Templates Controller - CRUD endpoints for questionnaire prompts
// v1.0 - GET active, GET list, POST create, PATCH update, DELETE

import { Controller, Get, Post, Patch, Delete, Query, Param, Body, BadRequestException } from '@nestjs/common';
import { QuestionTemplatesService } from './question-templates.service';

@Controller('question-templates')
export class QuestionTemplatesController {
  constructor(private readonly service: QuestionTemplatesService) {}

  // GET /api/question-templates/active — get currently active template for recorder page
  @Get('active')
  async getActiveTemplate(
    @Query('restaurant_id') restaurantId: string,
  ) {
    if (!restaurantId) throw new BadRequestException('restaurant_id is required');
    return this.service.getActiveTemplate(restaurantId);
  }

  // GET /api/question-templates — list all templates for admin
  @Get()
  async listTemplates(
    @Query('restaurant_id') restaurantId: string,
  ) {
    if (!restaurantId) throw new BadRequestException('restaurant_id is required');
    return this.service.listTemplates(restaurantId);
  }

  // POST /api/question-templates — create new template
  @Post()
  async createTemplate(
    @Body() body: {
      restaurant_id: string;
      template_name: string;
      questions: Array<{ id: string; text: string; category: string }>;
      is_active?: boolean;
      effective_from?: string;
      effective_to?: string;
    },
  ) {
    return this.service.createTemplate(body);
  }

  // PATCH /api/question-templates/:id — update template
  @Patch(':id')
  async updateTemplate(
    @Param('id') id: string,
    @Body() body: {
      template_name?: string;
      questions?: Array<{ id: string; text: string; category: string }>;
      is_active?: boolean;
      effective_from?: string | null;
      effective_to?: string | null;
    },
  ) {
    return this.service.updateTemplate(id, body);
  }

  // DELETE /api/question-templates/:id — delete template
  @Delete(':id')
  async deleteTemplate(
    @Param('id') id: string,
  ) {
    return this.service.deleteTemplate(id);
  }
}
