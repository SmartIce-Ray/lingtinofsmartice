// Auth Controller - Login endpoint
// v1.0 - Initial implementation

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
