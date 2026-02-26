// Dashboard Controller - API endpoints for analytics
// v1.8 - Added: start_date/end_date range params (backward-compatible with date=)
// v1.7 - Added: managed_ids query param for regional manager scoping
// v1.6 - Added: /briefing endpoint for admin daily briefing (anomaly detection)
// v1.5 - Added: /restaurant/:id endpoint for restaurant detail view
// v1.4 - Added: /restaurants-overview endpoint for admin dashboard with sentiment scores
// v1.3 - Added: /restaurants endpoint for multi-store admin view

import { Controller, Get, Query, Param, BadRequestException } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { getChinaDateString, getYesterdayChinaDateString, resolveRange } from '../../common/utils/date';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  // GET /api/dashboard/briefing - Admin daily briefing with anomaly detection
  @Get('briefing')
  async getBriefing(
    @Query('date') date?: string,
    @Query('start_date') startDate?: string,
    @Query('end_date') endDate?: string,
    @Query('managed_ids') managedIdsStr?: string,
  ) {
    const managedIds = DashboardService.parseManagedIds(managedIdsStr);
    const range = resolveRange(date, startDate, endDate, getYesterdayChinaDateString);
    return this.dashboardService.getBriefing(range.start, range.end, managedIds);
  }

  // GET /api/dashboard/restaurants - Get all restaurants for admin multi-store view
  @Get('restaurants')
  async getRestaurants(@Query('managed_ids') managedIdsStr?: string) {
    const managedIds = DashboardService.parseManagedIds(managedIdsStr);
    return this.dashboardService.getRestaurantList(managedIds);
  }

  // GET /api/dashboard/restaurants-overview - Get all restaurants with sentiment scores
  @Get('restaurants-overview')
  async getRestaurantsOverview(
    @Query('date') date?: string,
    @Query('start_date') startDate?: string,
    @Query('end_date') endDate?: string,
    @Query('managed_ids') managedIdsStr?: string,
  ) {
    const managedIds = DashboardService.parseManagedIds(managedIdsStr);
    const range = resolveRange(date, startDate, endDate, getYesterdayChinaDateString);
    return this.dashboardService.getRestaurantsOverview(range.start, range.end, managedIds);
  }

  // GET /api/dashboard/coverage
  @Get('coverage')
  async getCoverage(
    @Query('restaurant_id') restaurantId: string,
    @Query('date') date?: string,
    @Query('start_date') startDate?: string,
    @Query('end_date') endDate?: string,
    @Query('managed_ids') managedIdsStr?: string,
  ) {
    const managedIds = DashboardService.parseManagedIds(managedIdsStr);
    const range = resolveRange(date, startDate, endDate);
    return this.dashboardService.getCoverageStats(
      restaurantId,
      range.start,
      range.end,
      managedIds,
    );
  }

  // GET /api/dashboard/dish-ranking
  @Get('dish-ranking')
  async getDishRanking(
    @Query('restaurant_id') restaurantId: string,
    @Query('date') date?: string,
    @Query('start_date') startDate?: string,
    @Query('end_date') endDate?: string,
    @Query('limit') limit?: string,
  ) {
    const range = resolveRange(date, startDate, endDate);
    return this.dashboardService.getDishRanking(
      restaurantId,
      range.start,
      range.end,
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
    @Query('start_date') startDate?: string,
    @Query('end_date') endDate?: string,
    @Query('managed_ids') managedIdsStr?: string,
  ) {
    const managedIds = DashboardService.parseManagedIds(managedIdsStr);
    const range = resolveRange(date, startDate, endDate);
    return this.dashboardService.getSentimentSummary(
      restaurantId,
      range.start,
      range.end,
      managedIds,
    );
  }

  // GET /api/dashboard/speech-highlights
  @Get('speech-highlights')
  async getSpeechHighlights(
    @Query('restaurant_id') restaurantId: string,
    @Query('date') date?: string,
    @Query('start_date') startDate?: string,
    @Query('end_date') endDate?: string,
  ) {
    const range = resolveRange(date, startDate, endDate);
    return this.dashboardService.getSpeechHighlights(
      restaurantId,
      range.start,
      range.end,
    );
  }

  // GET /api/dashboard/suggestions - Customer suggestions aggregated from feedbacks
  @Get('suggestions')
  async getSuggestions(
    @Query('restaurant_id') restaurantId: string,
    @Query('days') days?: string,
    @Query('managed_ids') managedIdsStr?: string,
  ) {
    const managedIds = DashboardService.parseManagedIds(managedIdsStr);
    return this.dashboardService.getSuggestions(
      restaurantId,
      parseInt(days || '7', 10),
      managedIds,
    );
  }

  // GET /api/dashboard/motivation-stats - Cumulative stats for motivation banner
  @Get('motivation-stats')
  async getMotivationStats(@Query('restaurant_id') restaurantId: string) {
    return this.dashboardService.getMotivationStats(restaurantId);
  }

  // GET /api/dashboard/benchmark - Regional manager benchmark vs company
  @Get('benchmark')
  async getBenchmark(
    @Query('managed_ids') managedIdsStr?: string,
    @Query('days') days?: string,
  ) {
    const managedIds = DashboardService.parseManagedIds(managedIdsStr);
    if (!managedIds) {
      throw new BadRequestException('managed_ids is required for benchmark');
    }
    return this.dashboardService.getBenchmark(
      managedIds,
      parseInt(days || '7', 10),
    );
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
