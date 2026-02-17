// Action Items Controller - API endpoints for AI action suggestions
// v1.0 - GET list, POST generate, PATCH update status

import { Controller, Get, Post, Patch, Query, Param, Body } from '@nestjs/common';
import { ActionItemsService } from './action-items.service';
import { getChinaDateString } from '../../common/utils/date';

@Controller('action-items')
export class ActionItemsController {
  constructor(private readonly actionItemsService: ActionItemsService) {}

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
  @Patch(':id')
  async updateActionItem(
    @Param('id') id: string,
    @Body() body: { status: string; note?: string },
  ) {
    return this.actionItemsService.updateActionItem(id, body.status, body.note);
  }
}
