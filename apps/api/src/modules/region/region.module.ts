// Region Module - Store grouping by geographic region
// v1.0

import { Module } from '@nestjs/common';
import { RegionController } from './region.controller';
import { RegionService } from './region.service';

@Module({
  controllers: [RegionController],
  providers: [RegionService],
})
export class RegionModule {}
