// JWT Strategy - Validate JWT tokens from Authorization header
// v1.0 - Initial implementation

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from './auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'lingtin-jwt-secret-change-in-production',
    });
  }

  async validate(payload: JwtPayload) {
    if (!payload.sub || !payload.restaurantId) {
      throw new UnauthorizedException('Invalid token payload');
    }

    return {
      id: payload.sub,
      username: payload.username,
      employeeName: payload.employeeName,
      restaurantId: payload.restaurantId,
      roleCode: payload.roleCode,
      managedRestaurantIds: payload.managedRestaurantIds || null,
      managedRegionIds: payload.managedRegionIds || null,
      isSuperAdmin: payload.isSuperAdmin === true,
    };
  }
}
