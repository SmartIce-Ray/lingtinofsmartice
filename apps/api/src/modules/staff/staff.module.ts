// Staff Module - API endpoints for boss to view employee data
// v1.0 - Initial version with chat history and visit records endpoints

import { Module } from '@nestjs/common';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';
import { SupabaseModule } from '../../common/supabase/supabase.module';

@Module({
  imports: [SupabaseModule],
  controllers: [StaffController],
  providers: [StaffService],
})
export class StaffModule {}
