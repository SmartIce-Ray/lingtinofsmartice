// Auth Controller - Login endpoint
// v1.1 - Added health check endpoint for debugging

import { Controller, Post, Body, UnauthorizedException, Logger, Get, UseGuards } from '@nestjs/common';
import { AuthService, AuthUser } from './auth.service';
import { Public } from './public.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from './current-user.decorator';

interface LoginDto {
  username: string;
  password: string;
}

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}

  @Public()
  @Get('health')
  async healthCheck() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      env: {
        SUPABASE_URL: process.env.SUPABASE_URL ? 'SET' : 'NOT SET',
        SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY ? `SET (${process.env.SUPABASE_SERVICE_KEY?.substring(0, 20)}...)` : 'NOT SET',
        NODE_ENV: process.env.NODE_ENV || 'not set',
      },
    };
  }

  @Public()
  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    this.logger.log(`▶ POST /auth/login - user: ${loginDto.username}`);

    const user = await this.authService.validateUser(loginDto.username, loginDto.password);

    if (!user) {
      this.logger.warn(`◀ Login failed for user: ${loginDto.username}`);
      throw new UnauthorizedException('用户名或密码错误');
    }

    const result = await this.authService.login(user);
    this.logger.log(`◀ Login success: ${user.username} (restaurant: ${user.restaurantId})`);

    return result;
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getProfile(@CurrentUser() user: AuthUser) {
    this.logger.log(`▶ GET /auth/me - user: ${user.username}`);
    return {
      id: user.id,
      username: user.username,
      employeeName: user.employeeName,
      restaurantId: user.restaurantId,
      roleCode: user.roleCode,
    };
  }
}
