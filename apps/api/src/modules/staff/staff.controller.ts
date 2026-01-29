// Staff Controller - API endpoints for boss to view employee data
// v1.0 - Initial version with chat history and visit records endpoints

import { Controller, Get, Query } from '@nestjs/common';
import { StaffService } from './staff.service';

@Controller('staff')
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  // GET /api/staff/chat-history - Get employee chat history
  @Get('chat-history')
  async getChatHistory(@Query('restaurant_id') restaurantId: string) {
    console.log('[StaffController] GET /api/staff/chat-history');
    console.log('[StaffController] restaurantId:', restaurantId);
    return this.staffService.getChatHistory(restaurantId);
  }

  // GET /api/staff/visit-records - Get visit records with manager questions
  @Get('visit-records')
  async getVisitRecords(@Query('restaurant_id') restaurantId: string) {
    console.log('[StaffController] GET /api/staff/visit-records');
    console.log('[StaffController] restaurantId:', restaurantId);
    return this.staffService.getVisitRecords(restaurantId);
  }
}
