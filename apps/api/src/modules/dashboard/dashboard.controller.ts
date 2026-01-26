// Dashboard Controller - API endpoints for analytics
// v1.2 - Fixed: Use China timezone for default date

import { Controller, Get, Query } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { getChinaDateString } from '../../common/utils/date';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  // GET /api/dashboard/coverage
  @Get('coverage')
  async getCoverage(
    @Query('restaurant_id') restaurantId: string,
    @Query('date') date?: string,
  ) {
    return this.dashboardService.getCoverageStats(
      restaurantId,
      date || getChinaDateString(),
    );
  }

  // GET /api/dashboard/dish-ranking
  @Get('dish-ranking')
  async getDishRanking(
    @Query('restaurant_id') restaurantId: string,
    @Query('date') date?: string,
    @Query('limit') limit?: string,
  ) {
    return this.dashboardService.getDishRanking(
      restaurantId,
      date || getChinaDateString(),
      parseInt(limit || '5', 10),
    );
  }

  // GET /api/dashboard/sentiment-trend
  @Get('sentiment-trend')
  async getSentimentTrend(
    @Query('restaurant_id') restaurantId: string,
    @Query('days') days?: string,
  ) {
    return this.dashboardService.getSentimentTrend(
      restaurantId,
      parseInt(days || '7', 10),
    );
  }

  // GET /api/dashboard/sentiment-summary
  @Get('sentiment-summary')
  async getSentimentSummary(
    @Query('restaurant_id') restaurantId: string,
    @Query('date') date?: string,
  ) {
    return this.dashboardService.getSentimentSummary(
      restaurantId,
      date || getChinaDateString(),
    );
  }

  // GET /api/dashboard/speech-highlights
  @Get('speech-highlights')
  async getSpeechHighlights(
    @Query('restaurant_id') restaurantId: string,
    @Query('date') date?: string,
  ) {
    return this.dashboardService.getSpeechHighlights(
      restaurantId,
      date || getChinaDateString(),
    );
  }
}
