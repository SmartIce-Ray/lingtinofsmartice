// Dashboard Controller - API endpoints for analytics
// v1.6 - Added: Error handling with detailed error messages for debugging
// v1.5 - Added: /restaurant/:id endpoint for restaurant detail view
// v1.4 - Added: /restaurants-overview endpoint for admin dashboard with sentiment scores
// v1.3 - Added: /restaurants endpoint for multi-store admin view

import { Controller, Get, Query, Param, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { getChinaDateString } from '../../common/utils/date';

@Controller('dashboard')
export class DashboardController {
  private readonly logger = new Logger(DashboardController.name);

  constructor(private readonly dashboardService: DashboardService) {}

  // GET /api/dashboard/restaurants - Get all restaurants for admin multi-store view
  @Get('restaurants')
  async getRestaurants() {
    try {
      return await this.dashboardService.getRestaurantList();
    } catch (error) {
      this.logger.error(`getRestaurants error: ${error.message}`, error.stack);
      throw new HttpException({ message: error.message, stack: error.stack }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // GET /api/dashboard/restaurants-overview - Get all restaurants with sentiment scores
  @Get('restaurants-overview')
  async getRestaurantsOverview(@Query('date') date?: string) {
    try {
      return await this.dashboardService.getRestaurantsOverview(date || getChinaDateString());
    } catch (error) {
      this.logger.error(`getRestaurantsOverview error: ${error.message}`, error.stack);
      throw new HttpException({ message: error.message, stack: error.stack }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // GET /api/dashboard/coverage
  @Get('coverage')
  async getCoverage(
    @Query('restaurant_id') restaurantId: string,
    @Query('date') date?: string,
  ) {
    try {
      this.logger.log(`getCoverage: restaurantId=${restaurantId}, date=${date || getChinaDateString()}`);
      return await this.dashboardService.getCoverageStats(
        restaurantId,
        date || getChinaDateString(),
      );
    } catch (error) {
      this.logger.error(`getCoverage error: ${error.message}`, error.stack);
      throw new HttpException({ message: error.message, stack: error.stack }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // GET /api/dashboard/dish-ranking
  @Get('dish-ranking')
  async getDishRanking(
    @Query('restaurant_id') restaurantId: string,
    @Query('date') date?: string,
    @Query('limit') limit?: string,
  ) {
    try {
      return await this.dashboardService.getDishRanking(
        restaurantId,
        date || getChinaDateString(),
        parseInt(limit || '5', 10),
      );
    } catch (error) {
      this.logger.error(`getDishRanking error: ${error.message}`, error.stack);
      throw new HttpException({ message: error.message, stack: error.stack }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // GET /api/dashboard/sentiment-trend
  @Get('sentiment-trend')
  async getSentimentTrend(
    @Query('restaurant_id') restaurantId: string,
    @Query('days') days?: string,
  ) {
    try {
      return await this.dashboardService.getSentimentTrend(
        restaurantId,
        parseInt(days || '7', 10),
      );
    } catch (error) {
      this.logger.error(`getSentimentTrend error: ${error.message}`, error.stack);
      throw new HttpException({ message: error.message, stack: error.stack }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // GET /api/dashboard/sentiment-summary
  @Get('sentiment-summary')
  async getSentimentSummary(
    @Query('restaurant_id') restaurantId: string,
    @Query('date') date?: string,
  ) {
    try {
      return await this.dashboardService.getSentimentSummary(
        restaurantId,
        date || getChinaDateString(),
      );
    } catch (error) {
      this.logger.error(`getSentimentSummary error: ${error.message}`, error.stack);
      throw new HttpException({ message: error.message, stack: error.stack }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // GET /api/dashboard/speech-highlights
  @Get('speech-highlights')
  async getSpeechHighlights(
    @Query('restaurant_id') restaurantId: string,
    @Query('date') date?: string,
  ) {
    try {
      return await this.dashboardService.getSpeechHighlights(
        restaurantId,
        date || getChinaDateString(),
      );
    } catch (error) {
      this.logger.error(`getSpeechHighlights error: ${error.message}`, error.stack);
      throw new HttpException({ message: error.message, stack: error.stack }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // GET /api/dashboard/restaurant/:id - Get restaurant detail with visit records
  @Get('restaurant/:id')
  async getRestaurantDetail(
    @Param('id') restaurantId: string,
    @Query('date') date?: string,
  ) {
    try {
      return await this.dashboardService.getRestaurantDetail(
        restaurantId,
        date || getChinaDateString(),
      );
    } catch (error) {
      this.logger.error(`getRestaurantDetail error: ${error.message}`, error.stack);
      throw new HttpException({ message: error.message, stack: error.stack }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
