import { Controller, Get, Post, Query } from '@nestjs/common';
import { DailySummaryService } from './daily-summary.service';
import { getChinaDateString } from '../../common/utils/date';
import { Public } from '../auth/public.decorator';

@Controller('daily-summary')
export class DailySummaryController {
  constructor(private readonly dailySummaryService: DailySummaryService) {}

  @Get()
  async getDailySummary(
    @Query('restaurant_id') restaurantId: string,
    @Query('date') date?: string,
  ) {
    return this.dailySummaryService.getDailySummary(
      restaurantId,
      date || getChinaDateString(),
    );
  }

  @Public()
  @Post('generate')
  async generateDailySummary(
    @Query('restaurant_id') restaurantId: string,
    @Query('date') date?: string,
  ) {
    return this.dailySummaryService.generateDailySummary(
      restaurantId,
      date || getChinaDateString(),
    );
  }
}
