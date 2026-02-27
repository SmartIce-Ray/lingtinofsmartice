// Action Items Controller - API endpoints for AI action suggestions
// v1.1 - Added: response_note support for resolve/dismiss actions

import { Controller, Get, Post, Patch, Query, Param, Body, BadRequestException } from '@nestjs/common';
import { ActionItemsService } from './action-items.service';
import { getChinaDateString } from '../../common/utils/date';

@Controller('action-items')
export class ActionItemsController {
  constructor(private readonly actionItemsService: ActionItemsService) {}

  // GET /api/action-items/pending — all pending/acknowledged items across dates
  @Get('pending')
  async getPendingActionItems(
    @Query('restaurant_id') restaurantId: string,
    @Query('limit') limit?: string,
  ) {
    return this.actionItemsService.getPendingActionItems(
      restaurantId,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  // GET /api/action-items — list action items for a date
  @Get()
  async getActionItems(
    @Query('restaurant_id') restaurantId: string,
    @Query('date') date?: string,
  ) {
    return this.actionItemsService.getActionItems(
      restaurantId,
      date || getChinaDateString(),
    );
  }

  // POST /api/action-items/generate — trigger AI generation
  @Post('generate')
  async generateActionItems(
    @Query('restaurant_id') restaurantId: string,
    @Query('date') date?: string,
  ) {
    return this.actionItemsService.generateActionItems(
      restaurantId,
      date || getChinaDateString(),
    );
  }

  // PATCH /api/action-items/:id — update status
  // body: { status, note?, response_note? }
  // When status='resolved', response_note is required
  @Patch(':id')
  async updateActionItem(
    @Param('id') id: string,
    @Body() body: { status: string; note?: string; response_note?: string },
  ) {
    if (body.status === 'resolved' && !body.response_note?.trim()) {
      throw new BadRequestException('response_note is required when resolving an action item');
    }
    if (body.status === 'dismissed' && !body.response_note?.trim()) {
      throw new BadRequestException('response_note is required when dismissing an action item');
    }
    return this.actionItemsService.updateActionItem(id, body.status, body.note, body.response_note);
  }
}
