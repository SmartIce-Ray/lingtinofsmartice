// Root Application Module
// v1.2 - Added StaffModule for boss to view employee data

import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AudioModule } from './modules/audio/audio.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { ChatModule } from './modules/chat/chat.module';
import { StaffModule } from './modules/staff/staff.module';
import { ActionItemsModule } from './modules/action-items/action-items.module';
import { AuthModule, JwtAuthGuard } from './modules/auth';
import { SupabaseModule } from './common/supabase/supabase.module';

@Module({
  imports: [
    SupabaseModule,
    AuthModule,
    AudioModule,
    DashboardModule,
    ChatModule,
    StaffModule,
    ActionItemsModule,
  ],
  providers: [
    // Apply JWT guard globally - all routes require auth by default
    // Use @Public() decorator to make specific routes public
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
