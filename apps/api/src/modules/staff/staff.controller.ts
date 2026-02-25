// Staff Controller - API endpoints for boss to view employee data
// v1.1 - Added insights endpoint for cross-store product insights

import { Controller, Get, Query } from '@nestjs/common';
import { StaffService } from './staff.service';

@Controller('staff')
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  // GET /api/staff/chat-history - Get employee chat history
  @Get('chat-history')
  async getChatHistory(@Query('restaurant_id') restaurantId: string) {
    return this.staffService.getChatHistory(restaurantId);
  }

  // GET /api/staff/visit-records - Get visit records with manager questions
  @Get('visit-records')
  async getVisitRecords(@Query('restaurant_id') restaurantId: string) {
    return this.staffService.getVisitRecords(restaurantId);
  }

  // GET /api/staff/insights - Cross-store product insights (topic clustering)
  @Get('insights')
  async getInsights(@Query('days') daysStr?: string) {
    const days = daysStr ? Math.min(Math.max(parseInt(daysStr, 10) || 7, 1), 90) : 7;
    return this.staffService.getInsights(days);
  }
}
