// Dashboard Controller - API endpoints for analytics
// v1.5 - Added: /restaurant/:id endpoint for restaurant detail view
// v1.4 - Added: /restaurants-overview endpoint for admin dashboard with sentiment scores
// v1.3 - Added: /restaurants endpoint for multi-store admin view

import { Controller, Get, Query, Param } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { getChinaDateString } from '../../common/utils/date';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  // GET /api/dashboard/restaurants - Get all restaurants for admin multi-store view
  @Get('restaurants')
  async getRestaurants() {
    return this.dashboardService.getRestaurantList();
  }

  // GET /api/dashboard/restaurants-overview - Get all restaurants with sentiment scores
  @Get('restaurants-overview')
  async getRestaurantsOverview(@Query('date') date?: string) {
    return this.dashboardService.getRestaurantsOverview(date || getChinaDateString());
  }

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

  // GET /api/dashboard/motivation-stats - Cumulative stats for motivation banner
  @Get('motivation-stats')
  async getMotivationStats(@Query('restaurant_id') restaurantId: string) {
    return this.dashboardService.getMotivationStats(restaurantId);
  }

  // GET /api/dashboard/restaurant/:id - Get restaurant detail with visit records
  @Get('restaurant/:id')
  async getRestaurantDetail(
    @Param('id') restaurantId: string,
    @Query('date') date?: string,
  ) {
    return this.dashboardService.getRestaurantDetail(
      restaurantId,
      date || getChinaDateString(),
    );
  }
}
